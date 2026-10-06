-- ==============================================================================
-- Migration 020: Harden Production Residual Controls
-- 
-- 1. Project Moderation State Machine (SEC-018):
--    - Adds 'pending' state to project_moderation_status enum.
--    - Default moderation_status 'pending' is installed in 021 (split out:
--      PostgreSQL forbids using a newly added enum value in the same
--      transaction that added it — "unsafe use of new value").
--    - Updates process_dodo_purchase to preserve 'pending' moderation status
--      for unreviewed projects (only admin approval moves pending -> approved).
--    - Replaces the INSERT-path guard so non-service inserts must be 'pending'
--      (never self-declared 'approved') — keeps SEC-018 closed on depth.
--
-- 2. War Room Message Security & Anti-Spoofing (SEC-012):
--    - Revokes direct INSERT permissions on messages table from authenticated and anon.
--    - Drops direct client insert policy so all messages must traverse the
--      server-authoritative API route (/api/war-room/messages) where identity,
--      character limit, and rate limits are enforced with service_role.
--
-- 3. Admin Audit Log Lockdown (SEC-017 / Admin Boundary):
--    - Explicitly revokes ALL permissions on admin_audit_log from anon and authenticated.
--    - Guarantees audit log records can only be created by server-side service_role.
-- ==============================================================================

-- 1. Extend project_moderation_status enum with 'pending'
do $$
begin
  if not exists (
    select 1 from pg_type typ
    join pg_enum enm on typ.oid = enm.enumtypid
    where typ.typname = 'project_moderation_status' and enm.enumlabel = 'pending'
  ) then
    alter type project_moderation_status add value 'pending' before 'approved';
  end if;
end $$;

-- Default moderation_status is installed by 021: PostgreSQL rejects using the
-- freshly added 'pending' label in the same transaction that added it
-- ("unsafe use of new value ... HINT: New enum values must be committed before
-- they can be used"), and the transaction scope of the migration applier is
-- unknown. 020 itself never evaluates the literal outside function bodies.

-- Ensure RLS on projects allows public to select only approved + active projects
-- (Existing policy "Public can view active approved projects" enforces moderation_status = 'approved' and is_active = true)

-- 2. Lock down War Room messages: remove direct client insert capability (SEC-012)
revoke insert on public.messages from authenticated;
revoke insert on public.messages from anon;
drop policy if exists "Authenticated users can post war room messages" on public.messages;

-- Ensure populate_message_author trigger strictly binds user_id to auth.uid() if invoked
create or replace function public.populate_message_author()
returns trigger as $$
begin
  -- If invoked from client session, force user_id to authenticated uid
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    new.user_id := auth.uid();
    new.is_official := false;
  end if;

  if new.user_id is not null then
    select display_name, handle into new.author_name, new.author_handle
    from public.users where id = new.user_id;
  end if;

  if new.author_name is null then
    new.author_name := coalesce(new.author_handle, 'Anonymous');
  end if;

  -- Only service_role or admin can set is_official = true
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    new.is_official := false;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 3. Lock down admin_audit_log table from direct client access
revoke all on public.admin_audit_log from anon;
revoke all on public.admin_audit_log from authenticated;

-- 4. Update process_dodo_purchase to respect pending moderation state
-- Base: 017's proven body verbatim (payload sanity, fast-path + post-lock
-- idempotency on the advisory lock, currency/floor validation, mandatory bound
-- quote state machine, suspended/rejected guard, immutable ledger inserts).
-- SEC-018 delta only:
--   (9)  payment never grants approval: is_active = (moderation = 'approved');
--        moderation_status is never written by the payment path.
--   (10) board rank recalculation runs ONLY for approved projects.
--   (11) payments ledger row ALWAYS records the financial truth.
--   (12) public board event journal runs ONLY for approved projects.
--   (13) graveyard displacement journal runs ONLY with the recalculation.
--   (14) payment_events idempotency ledger ALWAYS records the delivery.
-- Pending projects therefore receive financial value and full ledger coverage
-- but never appear on the public board until an administrator approves them
-- (admin moderate route flips status + is_active and recalculates ranks).
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
    -- SEC-018: a verified payment NEVER grants approval. Approved projects stay
    -- active; pending projects receive financial value but remain inactive until
    -- an administrator approves them; suspended/rejected never reach this point.
    update projects
    set
      current_active_value_minor = v_new_value_minor,
      total_paid_minor = total_paid_minor + p_amount_minor,
      ranking_sequence = v_seq,
      is_active = (v_moderation = 'approved'),
      updated_at = now()
    where id = v_project_id;

    if v_moderation = 'approved' then
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
    else
      -- Pending payment: credit + ledger only. The project must not hold a board
      -- rank while unreviewed, and no public board events may be emitted.
      v_new_rank := null;
      v_final_rank := null;
      v_displaced := 0;
      update projects
      set current_rank = null
      where id = v_project_id and current_rank is not null;
    end if;

    -- (11) financial audit record (always: the payment is real regardless of moderation)
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
      v_old_rank, v_final_rank,
      'paid'::payment_status
    ) returning id into v_payment_id;

    if v_moderation = 'approved' then
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
    end if;

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
    'new_rank', v_final_rank,
    'new_active_value_minor', v_new_value_minor,
    'sequence', v_seq,
    'displaced', v_displaced
  );
end;
$$;

-- 5. SEC-018 INSERT-path guard: non-service inserts may only declare 'pending'
-- (017's guard demanded 'approved', i.e. it invited self-declared approval if a
-- client insert path ever opens. Under pending-on-create the only safe value a
-- non-service role may write is 'pending'; service_role/postgres keep full control.)
create or replace function public.protect_project_authoritative_fields_insert()
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
    new.moderation_status is distinct from 'pending'::project_moderation_status or
    new.is_active is distinct from false
  ) then
    raise exception 'Security violation: authoritative ranking and financial fields can only be set by the service role';
  end if;
  return new;
end;
$$;
