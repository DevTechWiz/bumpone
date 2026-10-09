-- Migration 023: Support multi-currency Dodo payments and auto-activate upon verified payment
-- Fixes rejection of localized checkouts (e.g. INR, EUR, GBP) where Dodo charges customer in local currency
-- but settles in USD, and automatically activates newly paid projects to the public wall at their calculated rank.

create or replace function public.process_dodo_purchase(
  p_event_id text,
  p_payment_id text,
  p_amount_minor bigint,
  p_payload jsonb,
  p_project_id uuid default null,
  p_quote_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quote_id uuid;
  v_meta jsonb;
  v_settlement_currency text;
  v_customer_currency text;
  v_settlement_net bigint;
  v_quote_project_id uuid;
  v_quote_amount bigint;
  v_quote_user_id uuid;
  v_quote_status purchase_quote_status;
  v_quote_expires timestamptz;
  v_project_id uuid;
  v_user_id uuid;
  v_moderation project_moderation_status;
  v_old_value_minor bigint := 0;
  v_new_value_minor bigint;
  v_new_rank int;
  v_final_rank int;
  v_old_rank int;
  v_seq bigint;
  v_displaced int := 0;
  v_payment_id uuid;
  v_category_id uuid;
  v_title text;
  v_handle text;
  v_updated int;
begin
  -- ---------------------------------------------------------------- (0) payload sanity
  if p_event_id is null or p_event_id = '' then
    return jsonb_build_object('status', 'error', 'message', 'Missing webhook event id');
  end if;
  if p_payment_id is null or p_payment_id = '' then
    return jsonb_build_object('status', 'error', 'message', 'Missing provider payment id');
  end if;
  if p_amount_minor is null or p_amount_minor <= 0 then
    return jsonb_build_object('status', 'error', 'message', 'Invalid payment amount');
  end if;

  v_meta := coalesce(p_payload->'metadata', '{}'::jsonb);

  -- ---------------------------------------------------------------- (1) fast-path idempotency (no writes)
  if exists (
    select 1 from payment_events
    where provider = 'dodo' and provider_event_id = p_event_id
  ) then
    return jsonb_build_object('status', 'already_processed');
  end if;

  -- ---------------------------------------------------------------- (2) serialize all financial mutations
  perform pg_advisory_xact_lock(733100, 1);

  -- (3) idempotency re-check AFTER acquiring the lock: closes the TOCTOU window
  if exists (
    select 1 from payment_events
    where provider = 'dodo' and provider_event_id = p_event_id
  ) then
    return jsonb_build_object('status', 'already_processed');
  end if;

  -- ---------------------------------------------------------------- (4) currency validation
  -- Dodo is an MoR supporting global currencies. If settlement_currency is provided,
  -- it must be USD (the platform ledger currency). If absent, customer currency must be USD.
  v_settlement_currency := coalesce(p_payload->>'settlement_currency', '');
  v_customer_currency := coalesce(p_payload->>'currency', '');

  if v_settlement_currency <> '' and lower(v_settlement_currency) <> 'usd' then
    return jsonb_build_object('status', 'error', 'message', 'Unsupported settlement currency');
  end if;
  if v_settlement_currency = '' and v_customer_currency <> '' and lower(v_customer_currency) <> 'usd' then
    return jsonb_build_object('status', 'error', 'message', 'Unsupported currency');
  end if;

  -- ---------------------------------------------------------------- (5) quote is MANDATORY (SEC-003)
  begin
    v_quote_id := coalesce(p_quote_id, nullif(v_meta->>'quote_id', '')::uuid);
  exception when invalid_text_representation then
    return jsonb_build_object('status', 'error', 'message', 'Malformed quote id');
  end;

  if v_quote_id is null then
    return jsonb_build_object('status', 'error', 'message', 'Quote required: webhook metadata must reference a purchase quote');
  end if;

  select project_id, quoted_amount_minor, user_id, status, expires_at
  into v_quote_project_id, v_quote_amount, v_quote_user_id, v_quote_status, v_quote_expires
  from purchase_quotes
  where id = v_quote_id;

  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Quote not found');
  end if;

  -- (5a) Dodo metadata can never override or contradict the database relationships.
  if p_project_id is not null and p_project_id <> v_quote_project_id then
    return jsonb_build_object('status', 'error', 'message', 'Quote/project mismatch');
  end if;
  if v_meta->>'project_id' is not null and v_meta->>'project_id' <> ''
     and lower(v_meta->>'project_id') <> v_quote_project_id::text then
    return jsonb_build_object('status', 'error', 'message', 'Quote/project mismatch');
  end if;
  if v_meta->>'user_id' is not null and v_meta->>'user_id' <> ''
     and lower(v_meta->>'user_id') <> v_quote_user_id::text then
    return jsonb_build_object('status', 'error', 'message', 'Quote/user mismatch');
  end if;

  -- (5b) quote state machine: only open, unexpired quotes are payable
  if v_quote_status <> 'checkout_open' then
    return jsonb_build_object('status', 'error', 'message', 'Quote already used, expired, or cancelled');
  end if;
  if v_quote_expires <= now() then
    return jsonb_build_object('status', 'error', 'message', 'Quote expired');
  end if;

  -- (5c) amount validation:
  -- Must match either the USD quote amount directly, or the net USD settlement amount
  -- (settlement_amount - settlement_tax) from Dodo's multi-currency payload.
  if v_settlement_currency <> '' and lower(v_settlement_currency) = 'usd' and p_payload->>'settlement_amount' is not null then
    v_settlement_net := (p_payload->>'settlement_amount')::bigint - coalesce((p_payload->>'settlement_tax')::bigint, 0);
    if p_amount_minor <> v_quote_amount and v_settlement_net <> v_quote_amount then
      return jsonb_build_object('status', 'error', 'message', 'Payment amount does not match authorized quote');
    end if;
  else
    if p_amount_minor <> v_quote_amount then
      return jsonb_build_object('status', 'error', 'message', 'Payment amount does not match authorized quote');
    end if;
  end if;

  -- ---------------------------------------------------------------- (6) project is authoritative for crediting
  v_project_id := v_quote_project_id;

  select user_id, current_active_value_minor, current_rank, category_id, title, handle, moderation_status
  into v_user_id, v_old_value_minor, v_old_rank, v_category_id, v_title, v_handle, v_moderation
  from projects
  where id = v_project_id
  for update;

  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Target project not found');
  end if;

  -- (6a) quote must belong to the owner of the project it pays for
  if v_user_id is distinct from v_quote_user_id then
    return jsonb_build_object('status', 'error', 'message', 'Quote user does not own the target project');
  end if;

  -- (6b) administratively suspended/rejected projects cannot receive credit
  if v_moderation in ('suspended', 'rejected') then
    return jsonb_build_object('status', 'error', 'message', 'Cannot process takeover for suspended or rejected project');
  end if;

  -- ================================================================
  -- All validation passed. Every mutation below happens in a single sub-block.
  -- ================================================================
  begin
    -- (7) consume the quote
    update purchase_quotes
    set status = 'paid', paid_at = now()
    where id = v_quote_id and status = 'checkout_open' and expires_at > now();
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      return jsonb_build_object('status', 'error', 'message', 'Quote could not be consumed');
    end if;

    -- (8) calculate new values (always credit the authoritative USD quote amount)
    v_new_value_minor := v_old_value_minor + v_quote_amount;
    v_seq := nextval('global_event_sequence_seq');

    -- Capture pre-recalc board state (ranks 1..100) to track displaced casualties
    create temp table if not exists _pre_recalc_ranks (
      id uuid,
      current_rank int,
      title text,
      handle text,
      category_id uuid,
      current_active_value_minor bigint
    ) on commit drop;
    truncate _pre_recalc_ranks;
    insert into _pre_recalc_ranks (id, current_rank, title, handle, category_id, current_active_value_minor)
    select id, current_rank, title, handle, category_id, current_active_value_minor
    from projects
    where is_active = true and moderation_status = 'approved' and current_rank is not null;

    -- (9) update buyer's project record (auto-activate and approve upon verified payment)
    update projects
    set
      current_active_value_minor = v_new_value_minor,
      total_paid_minor = total_paid_minor + v_quote_amount,
      ranking_sequence = v_seq,
      is_active = true,
      moderation_status = 'approved',
      updated_at = now()
    where id = v_project_id;

    -- (10) atomically recalculate all active ranks 1..100
    update projects
    set current_rank = null
    where is_active = true and current_rank is not null;

    with ranked as (
      select
        id,
        row_number() over (
          order by current_active_value_minor desc, ranking_sequence asc
        ) as calculated_rank
      from projects
      where is_active = true and moderation_status = 'approved'
    )
    update projects p
    set
      current_rank = r.calculated_rank,
      updated_at = now()
    from ranked r
    where p.id = r.id and r.calculated_rank <= 100;

    select current_rank into v_new_rank
    from projects
    where id = v_project_id;

    if v_new_rank is null then
      v_new_rank := 101;
    end if;

    v_final_rank := least(v_new_rank, 100);

    select count(*) into v_displaced
    from projects p
    join _pre_recalc_ranks pr on pr.id = p.id
    where p.id <> v_project_id
      and (p.current_rank > pr.current_rank or (p.current_rank is null and pr.current_rank is not null));

    -- (11) financial audit record in USD minor units
    insert into payments (
      project_id, user_id, quote_id, provider,
      provider_payment_id, amount_minor, currency,
      previous_active_value_minor, new_active_value_minor,
      previous_rank, new_rank, status
    ) values (
      v_project_id, v_user_id, v_quote_id,
      'dodo',
      p_payment_id, v_quote_amount, 'USD',
      v_old_value_minor, v_new_value_minor,
      v_old_rank, v_final_rank,
      'paid'::payment_status
    ) returning id into v_payment_id;

    -- (12) board displacement event journal
    insert into board_events (
      event_sequence, payment_id, project_id, project_title_snapshot, project_handle_snapshot,
      previous_rank, new_rank, previous_active_value_minor, new_active_value_minor,
      category_id, profiles_displaced, event_type
    ) values (
      v_seq, v_payment_id, v_project_id, v_title, v_handle,
      v_old_rank, v_final_rank, v_old_value_minor, v_new_value_minor,
      v_category_id, v_displaced,
      case
        when v_old_rank is null then 'inserted'::board_event_type
        when v_new_rank > 100 then 'left_top_100'::board_event_type
        else 'bumped'::board_event_type
      end
    );

    -- (13) graveyard displacement journal
    insert into board_events (
      event_sequence, payment_id, project_id, project_title_snapshot, project_handle_snapshot,
      previous_rank, new_rank, previous_active_value_minor, new_active_value_minor,
      category_id, profiles_displaced, event_type
    )
    select
      nextval('global_event_sequence_seq'),
      v_payment_id,
      pr.id,
      pr.title,
      pr.handle,
      pr.current_rank,
      101,
      pr.current_active_value_minor,
      pr.current_active_value_minor,
      pr.category_id,
      1,
      'left_top_100'::board_event_type
    from _pre_recalc_ranks pr
    join projects p on p.id = pr.id
    where (p.current_rank is null or p.current_rank > 100)
      and pr.id <> v_project_id;

    -- (14) webhook idempotency ledger
    insert into payment_events (
      provider, provider_event_id, payment_id, event_type, payload
    ) values (
      'dodo', p_event_id, p_payment_id, 'payment.succeeded', p_payload
    );

  exception
    when unique_violation then
      return jsonb_build_object('status', 'error', 'message', 'Duplicate payment rejected');
  end;

  return jsonb_build_object(
    'status', 'success',
    'project_id', v_project_id,
    'payment_id', v_payment_id,
    'new_rank', v_final_rank,
    'new_active_value_minor', v_new_value_minor,
    'sequence', v_seq,
    'displaced', v_displaced
  );
end;
$$;

revoke execute on function public.process_dodo_purchase from public, anon, authenticated;
grant execute on function public.process_dodo_purchase to service_role;
