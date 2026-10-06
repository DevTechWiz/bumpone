-- 017_harden_financial_boundary.sql
-- Phase 1 (Production Hardening): PAYMENT -> PAYMENT VERIFICATION -> ACTIVE VALUE -> RANKING
--
-- Addresses: SEC-002 (paired with code change), SEC-003, SEC-014, SEC-015, plus the
-- financial hardening objectives: mandatory quote, quote/user/project binding,
-- currency validation, post-lock idempotency, no quote burn on validation failure,
-- immutable payment ledger, quote state-machine protection, INSERT-path guard on
-- authoritative project fields.
--
-- The business rule "no confirmed legitimate payment is rejected because of a race"
-- is preserved: all concurrent legitimate payments serialize on the advisory lock
-- and every validation failure now happens BEFORE any state mutation, so a rejected
-- attempt consumes nothing and can be retried.

-- ==============================================================================
-- 1. Hardened process_dodo_purchase (replaces 014)
-- ==============================================================================
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
  v_currency text;
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
  if p_amount_minor < 1000 then
    return jsonb_build_object('status', 'error', 'message', 'Payment amount below platform minimum');
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
  -- where two concurrent deliveries of the same event both pass the fast-path check.
  if exists (
    select 1 from payment_events
    where provider = 'dodo' and provider_event_id = p_event_id
  ) then
    return jsonb_build_object('status', 'already_processed');
  end if;

  -- ---------------------------------------------------------------- (4) currency validation
  -- All quotes and ledger values are USD minor units. An explicitly non-USD provider
  -- payload must never be credited as USD cents. Absent currency is tolerated (shape
  -- uncertainty) but a present non-USD currency is rejected (loud failure, not silent
  -- mis-crediting).
  v_currency := coalesce(p_payload->>'currency', '');
  if v_currency <> '' and lower(v_currency) <> 'usd' then
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

  -- (5c) amount must equal the server-recorded quote amount exactly
  if p_amount_minor <> v_quote_amount then
    return jsonb_build_object('status', 'error', 'message', 'Payment amount does not match authorized quote');
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

  -- (6a) quote must belong to the owner of the project it pays for (credit the right user)
  if v_user_id is distinct from v_quote_user_id then
    return jsonb_build_object('status', 'error', 'message', 'Quote user does not own the target project');
  end if;

  -- (6b) administratively suspended/rejected projects cannot receive credit
  if v_moderation in ('suspended', 'rejected') then
    return jsonb_build_object('status', 'error', 'message', 'Cannot process takeover for suspended or rejected project');
  end if;

  -- ================================================================
  -- All validation passed. Every mutation below happens in a single
  -- exception-protected sub-block: on any unique-key collision the
  -- entire mutation set (including quote consumption) rolls back,
  -- leaving the quote in checkout_open so the provider can retry.
  -- ================================================================
  begin
    -- (7) consume the quote (single-use, still guarded against state races)
    update purchase_quotes
    set status = 'paid', paid_at = now()
    where id = v_quote_id and status = 'checkout_open' and expires_at > now();
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then
      return jsonb_build_object('status', 'error', 'message', 'Quote could not be consumed');
    end if;

    -- (8) calculate new values
    v_new_value_minor := v_old_value_minor + p_amount_minor;
    v_seq := nextval('global_event_sequence_seq');

    -- Record pre-recalculation ranks for displacement tracking
    -- Capture pre-recalc board state (ranks 1..100) to track displaced casualties.
    -- Column list matches 002 so sessions holding the older temp table keep working.
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

    -- (9) update buyer's project record (do NOT set rank yet: unique index on current_rank)
    update projects
    set
      current_active_value_minor = v_new_value_minor,
      total_paid_minor = total_paid_minor + p_amount_minor,
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

    select count(*) into v_displaced
    from projects p
    join _pre_recalc_ranks pr on pr.id = p.id
    where p.id <> v_project_id
      and (p.current_rank > pr.current_rank or (p.current_rank is null and pr.current_rank is not null));

    -- (11) financial audit record
    insert into payments (
      project_id, user_id, quote_id, provider,
      provider_payment_id, amount_minor, currency,
      previous_active_value_minor, new_active_value_minor,
      previous_rank, new_rank, status
    ) values (
      v_project_id, v_user_id, v_quote_id,
      'dodo',
      p_payment_id, p_amount_minor, 'USD',
      v_old_value_minor, v_new_value_minor,
      v_old_rank, least(v_new_rank, 100),
      'paid'::payment_status
    ) returning id into v_payment_id;

    -- (12) board displacement event journal
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

    -- (14) webhook idempotency ledger (multi-tier: event id + provider payment id unique)
    insert into payment_events (
      provider, provider_event_id, payment_id, event_type, payload
    ) values (
      'dodo', p_event_id, p_payment_id, 'payment.succeeded', p_payload
    );

  exception
    when unique_violation then
      -- Concurrent duplicate delivery or provider payment id collision:
      -- sub-block rolls back (quote returns to checkout_open, no value credited).
      return jsonb_build_object('status', 'error', 'message', 'Duplicate payment rejected');
  end;

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

revoke execute on function public.process_dodo_purchase from public, anon, authenticated;
grant execute on function public.process_dodo_purchase to service_role;

-- ==============================================================================
-- 2. Ledger constraints: one payment row per quote, USD-only ledger
-- ==============================================================================
create unique index if not exists uq_payments_quote_id
  on payments (quote_id) where quote_id is not null;

do $$ begin
  alter table payments add constraint chk_payments_currency_usd check (upper(currency) = 'USD');
exception when duplicate_object then null; end $$;

-- ==============================================================================
-- 3. purchase_quotes state machine + immutable commercial terms
-- ==============================================================================
create or replace function enforce_purchase_quote_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Commercial terms are fixed at creation: a paid payment can never be re-priced,
  -- re-pointed at another project, or re-attributed to another user.
  if new.project_id is distinct from old.project_id
     or new.user_id is distinct from old.user_id
     or new.quoted_amount_minor is distinct from old.quoted_amount_minor
     or new.target_rank is distinct from old.target_rank
     or new.expected_rank is distinct from old.expected_rank
     or new.created_at is distinct from old.created_at then
    raise exception 'Security violation: purchase quote commercial terms are immutable';
  end if;

  -- Forward-only status transitions: checkout_open -> paid | expired | cancelled;
  -- paid is terminal.
  if new.status is distinct from old.status then
    if not (old.status = 'checkout_open' and new.status in ('paid', 'expired', 'cancelled')) then
      raise exception 'Security violation: invalid purchase quote state transition from % to %',
        old.status, new.status;
    end if;
  end if;

  if new.status = 'paid' and old.status <> 'paid' and new.paid_at is null then
    new.paid_at := now();
  end if;

  return new;
end;
$$;

revoke execute on function enforce_purchase_quote_integrity() from public, anon, authenticated;
drop trigger if exists trg_purchase_quotes_integrity on purchase_quotes;
create trigger trg_purchase_quotes_integrity
  before update on purchase_quotes
  for each row execute function enforce_purchase_quote_integrity();

-- ==============================================================================
-- 4. payments ledger immutability (only status/updated_at may change post-insert)
-- ==============================================================================
create or replace function enforce_payments_immutability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id is distinct from old.id
     or new.project_id is distinct from old.project_id
     or new.user_id is distinct from old.user_id
     or new.quote_id is distinct from old.quote_id
     or new.provider is distinct from old.provider
     or new.provider_payment_id is distinct from old.provider_payment_id
     or new.provider_checkout_id is distinct from old.provider_checkout_id
     or new.amount_minor is distinct from old.amount_minor
     or new.currency is distinct from old.currency
     or new.previous_active_value_minor is distinct from old.previous_active_value_minor
     or new.new_active_value_minor is distinct from old.new_active_value_minor
     or new.previous_rank is distinct from old.previous_rank
     or new.new_rank is distinct from old.new_rank
     or new.created_at is distinct from old.created_at then
    raise exception 'Security violation: payment ledger rows are immutable';
  end if;
  return new;
end;
$$;

revoke execute on function enforce_payments_immutability() from public, anon, authenticated;
drop trigger if exists trg_payments_immutability on payments;
create trigger trg_payments_immutability
  before update on payments
  for each row execute function enforce_payments_immutability();

-- ==============================================================================
-- 5. payment_events is insert-only (idempotency ledger)
-- ==============================================================================
create or replace function prevent_payment_events_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Security violation: payment_events rows are append-only';
end;
$$;

revoke execute on function prevent_payment_events_update() from public, anon, authenticated;
drop trigger if exists trg_payment_events_append_only on payment_events;
create trigger trg_payment_events_append_only
  before update on payment_events
  for each row execute function prevent_payment_events_update();

-- ==============================================================================
-- 6. SEC-015: INSERT-path guard on authoritative project fields
--    Mirrors protect_project_authoritative_fields for the INSERT path: no client
--    can create a project that is already credited, ranked, active-but-unmoderated.
-- ==============================================================================
create or replace function protect_project_authoritative_fields_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (current_user not in ('postgres', 'service_role', 'supabase_admin')
      and coalesce(auth.role(), '') <> 'service_role') and (
    new.current_active_value_minor is distinct from 0 or
    new.total_paid_minor is distinct from 0 or
    new.current_rank is not null or
    new.ranking_sequence is distinct from 0 or
    new.moderation_status is distinct from 'approved'::project_moderation_status or
    new.is_active is distinct from false
  ) then
    raise exception 'Security violation: authoritative ranking and financial fields can only be set by the service role';
  end if;
  return new;
end;
$$;

revoke execute on function protect_project_authoritative_fields_insert() from public, anon, authenticated;
drop trigger if exists trg_protect_project_fields_insert on projects;
create trigger trg_protect_project_fields_insert
  before insert on projects
  for each row execute function protect_project_authoritative_fields_insert();

-- ==============================================================================
-- 7. search_path hygiene for financial/authoritative triggers (SEC-015/SEC-016 subset)
-- ==============================================================================
alter function public.protect_project_authoritative_fields() set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = public, pg_temp;
