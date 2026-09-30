-- 002_ranking_rpc.sql
-- Authoritative Atomic Database Functions & RPCs for BumpOne.lol
-- PostgreSQL 16+ / Supabase Engine
-- Security Hardened: search_path locked, strict execution grants, atomic project creation

-- ==============================================================================
-- 1. Authoritative Atomic Ranking Mutation on Dodo Webhook
-- ==============================================================================
create or replace function process_dodo_purchase(
  p_event_id text,
  p_payment_id text,
  p_amount_minor bigint,
  p_payload jsonb,
  p_project_id uuid default null,
  p_quote_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_id uuid := p_project_id;
  v_quote_id text;
  v_quote_amount bigint;
  v_old_value_minor bigint := 0;
  v_new_value_minor bigint;
  v_old_rank int := null;
  v_new_rank int;
  v_seq bigint;
  v_displaced int := 0;
  v_payment_id uuid;
  v_category_id uuid;
  v_title text;
  v_handle text;
  v_meta jsonb;
begin
  -- 1. Webhook Idempotency Check: Don't re-process duplicate events
  if exists (
    select 1 from payment_webhook_events 
    where provider = 'dodo' and provider_event_id = p_event_id
  ) then
    return jsonb_build_object('status', 'already_processed');
  end if;

  -- 2. Lock Board for serial execution (Fixed numeric namespace 733100, key 1 prevents race conditions)
  perform pg_advisory_xact_lock(733100, 1);

  v_meta := coalesce(p_payload->'metadata', '{}'::jsonb);
  
  if p_quote_id is not null then
    v_quote_id := p_quote_id::text;
  else
    v_quote_id := v_meta->>'quote_id';
  end if;

  -- Validate quote if provided
  if v_quote_id is not null then
    select project_id, quoted_amount_minor into v_project_id, v_quote_amount
    from purchase_quotes
    where id = v_quote_id::uuid and status = 'checkout_open' and expires_at > now();

    -- Enforce that quote exists, is checkout_open, and has not expired
    if v_quote_amount is null then
      raise exception 'Invalid, expired, or already-processed quote: %', v_quote_id
        using errcode = 'P0004';
    end if;

    -- Enforce payment amount strictly matches the authoritative server-generated quote
    if p_amount_minor <> v_quote_amount then
      raise exception 'Payment amount (%) does not match quoted amount (%)',
        p_amount_minor, v_quote_amount
        using errcode = 'P0001';
    end if;

    -- Enforce quote project matches parameter if both provided
    if p_project_id is not null and p_project_id <> v_project_id then
      raise exception 'Project ID mismatch between quote (%) and parameter (%)',
        v_project_id, p_project_id
        using errcode = 'P0005';
    end if;
  end if;

  -- 3. Validate project exists (projects MUST be pre-created via /api/purchase/create)
  if v_project_id is null then
    raise exception 'project_id is required — projects must be pre-created before payment'
      using errcode = 'P0002';
  end if;

  if not exists (select 1 from projects where id = v_project_id) then
    raise exception 'Project % not found', v_project_id
      using errcode = 'P0003';
  end if;

  -- Enforce that suspended or rejected projects cannot accept purchases or be reactivated
  if exists (select 1 from projects where id = v_project_id and moderation_status in ('suspended', 'rejected')) then
    raise exception 'Project % is suspended or rejected and cannot accept purchases', v_project_id
      using errcode = 'P0006';
  end if;

  select current_active_value_minor, current_rank, category_id, title, handle
  into v_old_value_minor, v_old_rank, v_category_id, v_title, v_handle
  from projects 
  where id = v_project_id;

  -- 4. Calculate new values in minor units (cents)
  v_old_value_minor := coalesce(v_old_value_minor, 0);
  v_new_value_minor := v_old_value_minor + p_amount_minor;
  v_seq := nextval('global_event_sequence_seq');

  -- Capture pre-recalc board state (ranks 1..100) to track any displaced casualty falling off into Graveyard
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
  where is_active = true and current_rank between 1 and 100;

  -- 5. Update buyer project with new active bid value and ranking sequence
  -- NOTE: moderation_status is NOT overridden here — moderation is independent from payment
  update projects
  set current_active_value_minor = v_new_value_minor,
      ranking_sequence = v_seq,
      total_paid_minor = total_paid_minor + p_amount_minor,
      is_active = true,
      updated_at = now()
  where id = v_project_id;

  -- 6. Atomically recalculate all board positions 1..100 based on:
  -- ORDER BY current_active_value_minor DESC, ranking_sequence ASC
  -- ranking_sequence ASC ensures earliest timestamp to reach the current value wins ties
  update projects
  set current_rank = null
  where is_active = true and current_rank is not null;

  with ranked as (
    select id, row_number() over (
      order by current_active_value_minor desc, ranking_sequence asc
    ) as rank_pos
    from projects
    where is_active = true and moderation_status = 'approved'
  )
  update projects p
  set current_rank = r.rank_pos
  from ranked r
  where p.id = r.id and r.rank_pos <= 100;

  -- 7. Query buyer's newly assigned rank
  select current_rank into v_new_rank
  from projects
  where id = v_project_id;

  if v_new_rank is null then
    v_new_rank := 101;
  end if;

  if v_old_rank is null then
    v_displaced := case when v_new_rank <= 100 then 101 - v_new_rank else 0 end;
  elsif v_new_rank < v_old_rank then
    v_displaced := v_old_rank - v_new_rank;
  else
    v_displaced := 0;
  end if;

  -- 8. Record financial payment transaction in ledger
  insert into payments (
    project_id, user_id, provider, quote_id, provider_payment_id,
    amount_minor, currency, previous_active_value_minor, new_active_value_minor,
    previous_rank, new_rank, status
  ) select
    v_project_id, user_id, 'dodo',
    case when v_quote_id is not null then v_quote_id::uuid else null end,
    p_payment_id, p_amount_minor, 'USD', v_old_value_minor, v_new_value_minor,
    v_old_rank, least(v_new_rank, 100), 'paid'::payment_status
  from projects where id = v_project_id
  returning id into v_payment_id;

  -- Mark quote as paid if quote existed
  if v_quote_id is not null then
    update purchase_quotes set status = 'paid', paid_at = now() where id = v_quote_id::uuid;
  end if;

  -- 9. Record board displacement in immutable audit journal
  insert into board_events (
    event_sequence, payment_id, project_id, project_title_snapshot, project_handle_snapshot,
    previous_rank, new_rank, previous_active_value_minor, new_active_value_minor,
    category_id, profiles_displaced, event_type
  ) values (
    v_seq, v_payment_id, v_project_id, v_title, v_handle,
    v_old_rank, least(v_new_rank, 100), v_old_value_minor, v_new_value_minor,
    v_category_id, v_displaced,
    case
      when v_old_rank is null then 'inserted'::board_event_type
      when v_new_rank > 100 then 'left_top_100'::board_event_type
      else 'bumped'::board_event_type
    end
  );

  -- Record casualty event for any project displaced out of the top 100 into the Graveyard
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
    101, -- Graveyard rank indicator
    pr.current_active_value_minor,
    pr.current_active_value_minor,
    pr.category_id,
    1,
    'left_top_100'::board_event_type
  from _pre_recalc_ranks pr
  join projects p on p.id = pr.id
  where (p.current_rank is null or p.current_rank > 100)
    and pr.id <> v_project_id;

  -- 10. Record webhook event for multi-tier idempotency
  insert into payment_webhook_events (
    provider, provider_event_id, payment_id, event_type, payload
  ) values (
    'dodo', p_event_id, p_payment_id, 'payment.succeeded', p_payload
  );

  return jsonb_build_object(
    'status', 'success',
    'project_id', v_project_id,
    'payment_id', v_payment_id,
    'new_rank', least(v_new_rank, 100),
    'new_active_value_minor', v_new_value_minor,
    'sequence', v_seq,
    'displaced', v_displaced
  );
end;
$$;

revoke execute on function process_dodo_purchase from public, anon, authenticated;
grant execute on function process_dodo_purchase to service_role;

-- ==============================================================================
-- 2. Refund Policy
-- ==============================================================================
-- BumpOne operates a competitive auction model. Application-level refunds are
-- intentionally NOT supported because:
--   1. Payments purchase rank positions that immediately affect other users.
--   2. Reversing a payment after displacement cascades is logically unsound.
--   3. Gateway-level chargebacks (Dodo/Stripe disputes) are handled externally
--      by the payment provider, not by this application.
--
-- If a chargeback occurs, an admin can manually suspend the project via the
-- moderation endpoint, which triggers recalculate_board_ranks().
-- ==============================================================================

-- ==============================================================================
-- 3. Correct Atomic Reaction Recording RPC (Fixed double increment bug)
-- ==============================================================================
create or replace function add_project_reaction(
  p_project_id uuid,
  p_anonymous_id text,
  p_reaction_type text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_new boolean := false;
  v_new_count int := 1;
begin
  -- Validate reaction type enum
  if p_reaction_type not in ('fire', 'eyes', 'heart', 'laugh') then
    return jsonb_build_object('success', false, 'error', 'Invalid reaction type');
  end if;

  -- Only proceed if the project exists
  if not exists (select 1 from projects where id = p_project_id) then
    return jsonb_build_object('success', false, 'error', 'Project not found');
  end if;

  -- Insert reaction only if not already reacted by this anonymous identity
  with inserted as (
    insert into reactions (project_id, anonymous_id, reaction_type)
    values (p_project_id, p_anonymous_id, p_reaction_type::reaction_type)
    on conflict (project_id, anonymous_id, reaction_type) do nothing
    returning id
  )
  select exists (select 1 from inserted) into v_is_new;

  -- If conflict occurred (already reacted), do NOT increment counter!
  if not v_is_new then
    select coalesce(count, 0) into v_new_count
    from reaction_counts
    where project_id = p_project_id and reaction_type = p_reaction_type::reaction_type;

    return jsonb_build_object(
      'success', true,
      'reaction', p_reaction_type,
      'count', coalesce(v_new_count, 0),
      'already_reacted', true
    );
  end if;

  -- Row was genuinely inserted: safely upsert counter
  insert into reaction_counts (project_id, reaction_type, count)
  values (p_project_id, p_reaction_type::reaction_type, 1)
  on conflict (project_id, reaction_type)
  do update set count = reaction_counts.count + 1
  returning count into v_new_count;

  return jsonb_build_object(
    'success', true,
    'reaction', p_reaction_type,
    'count', v_new_count,
    'already_reacted', false
  );
end;
$$;

revoke execute on function add_project_reaction from public, anon;
grant execute on function add_project_reaction to authenticated, service_role;

-- ==============================================================================
-- 4. Maintenance / Admin Re-ranking Function
-- ==============================================================================
create or replace function recalculate_board_ranks()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(733100, 1);

  update projects
  set current_rank = null
  where is_active = true and current_rank is not null;

  with ranked as (
    select id, row_number() over (
      order by current_active_value_minor desc, ranking_sequence asc
    ) as rank_pos
    from projects
    where is_active = true and moderation_status = 'approved'
  )
  update projects p
  set current_rank = r.rank_pos
  from ranked r
  where p.id = r.id and r.rank_pos <= 100;
end;
$$;

revoke execute on function recalculate_board_ranks from public, anon, authenticated;
grant execute on function recalculate_board_ranks to service_role;

-- ==============================================================================
-- 5. Webhook Payload Retention Maintenance Function
-- ==============================================================================
-- Prunes raw webhook JSON payloads older than p_days (default 90) to prevent
-- unbounded table growth while preserving transactional payment ledgers.
create or replace function prune_old_webhook_events(p_days int default 90)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted int;
begin
  delete from payment_webhook_events
  where processed_at < now() - (p_days || ' days')::interval;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function prune_old_webhook_events from public, anon, authenticated;
grant execute on function prune_old_webhook_events to service_role;
