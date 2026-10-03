-- 005_rename_payment_events.sql
-- Synchronize canonical naming: payment_webhook_events -> payment_events
-- Aligns with docs/10_PAYMENT_FLOW.md, docs/24_IMPLEMENTATION_CONTRACT.md, and docs/25_PRODUCTION_ARCHITECTURE.md

-- 1. Rename table and indexes safely
do $$
begin
  if exists (
    select from pg_tables where schemaname = 'public' and tablename = 'payment_webhook_events'
  ) and not exists (
    select from pg_tables where schemaname = 'public' and tablename = 'payment_events'
  ) then
    alter table payment_webhook_events rename to payment_events;
  end if;

  if exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_payment_webhook_events_payment_id'
  ) then
    alter index idx_payment_webhook_events_payment_id rename to idx_payment_events_payment_id;
  end if;
end $$;

-- 2. Create if not exists (for completely fresh setups)
create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'dodo',
  provider_event_id text unique not null,
  payment_id text,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create index if not exists idx_payment_events_payment_id on payment_events (payment_id);

-- 3. Enable RLS
alter table payment_events enable row level security;

-- 4. Update process_dodo_purchase to reference payment_events
create or replace function process_dodo_purchase(
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
  v_quote_id text;
  v_quote_amount bigint;
  v_project_id uuid := p_project_id;
  v_user_id uuid;
  v_current_value_minor bigint := 0;
  v_new_value_minor bigint;
  v_new_rank int;
  v_prev_rank int;
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
    select 1 from payment_events 
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

    if not found then
      return jsonb_build_object('status', 'error', 'message', 'Quote expired, cancelled, or not found');
    end if;

    if p_amount_minor <> v_quote_amount then
      return jsonb_build_object('status', 'error', 'message', 'Payment amount does not match authorized quote');
    end if;

    -- Mark quote as consumed/paid
    update purchase_quotes
    set status = 'paid', paid_at = now()
    where id = v_quote_id::uuid;
  end if;

  if v_project_id is null then
    return jsonb_build_object('status', 'error', 'message', 'Missing project_id');
  end if;

  -- 3. Lock & read current project state
  select
    user_id, current_active_value_minor, current_rank, category_id, title, handle, moderation_status
  into
    v_user_id, v_current_value_minor, v_prev_rank, v_category_id, v_title, v_handle
  from projects
  where id = v_project_id
  for update;

  if not found then
    return jsonb_build_object('status', 'error', 'message', 'Target project not found');
  end if;

  -- Safeguard: reject payment processing if project was administratively suspended or rejected
  if exists (
    select 1 from projects 
    where id = v_project_id and moderation_status in ('suspended', 'rejected')
  ) then
    return jsonb_build_object('status', 'error', 'message', 'Cannot process takeover for suspended or rejected project');
  end if;

  -- 4. Calculate new values
  v_new_value_minor := v_current_value_minor + p_amount_minor;
  v_seq := nextval('board_events_event_sequence_seq');

  -- 5. Calculate new rank position
  -- Ordered by: active value DESC, then earliest ranking_sequence ASC (tiebreaker)
  select count(*) + 1 into v_new_rank
  from projects
  where is_active = true
    and moderation_status = 'approved'
    and id <> v_project_id
    and (
      current_active_value_minor > v_new_value_minor
      or (current_active_value_minor = v_new_value_minor and ranking_sequence < v_seq)
    );

  -- 6. Update buyer's project record
  update projects
  set
    current_active_value_minor = v_new_value_minor,
    total_paid_minor = total_paid_minor + p_amount_minor,
    current_rank = v_new_rank,
    ranking_sequence = v_seq,
    is_active = true,
    moderation_status = 'approved',
    updated_at = now()
  where id = v_project_id;

  -- Record pre-recalculation ranks for displacement tracking
  create temp table _pre_recalc_ranks on commit drop as
  select id, current_rank, current_active_value_minor, category_id
  from projects
  where is_active = true and moderation_status = 'approved' and current_rank is not null;

  -- 7. Atomically recalculate all active ranks 1..100
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
  where p.id = r.id and (p.current_rank is distinct from r.calculated_rank);

  -- Count displaced projects (projects whose rank worsened/increased)
  select count(*) into v_displaced
  from projects p
  join _pre_recalc_ranks pr on pr.id = p.id
  where p.id <> v_project_id
    and p.current_rank > pr.current_rank;

  -- 8. Insert financial audit record
  insert into payments (
    project_id, user_id, quote_id, provider,
    provider_payment_id, amount_minor, currency,
    status, payload
  ) values (
    v_project_id, v_user_id, v_quote_id::uuid, 'dodo',
    p_payment_id, p_amount_minor, 'USD',
    'paid', p_payload
  ) returning id into v_payment_id;

  -- 9. Insert board displacement event journal
  insert into board_events (
    event_sequence, project_id, project_title_snapshot, project_handle_snapshot,
    previous_rank, new_rank, previous_active_value_minor, new_active_value_minor,
    category_id, profiles_displaced, event_type
  ) values (
    v_seq, v_project_id, v_title, v_handle,
    v_prev_rank, least(v_new_rank, 100), v_current_value_minor, v_new_value_minor,
    v_category_id, v_displaced, 'bumped'
  );

  -- Check if any project was displaced completely past #100 into the Graveyard
  insert into board_events (
    event_sequence, project_id, project_title_snapshot, project_handle_snapshot,
    previous_rank, new_rank, previous_active_value_minor, new_active_value_minor,
    category_id, profiles_displaced, event_type
  )
  select
    nextval('board_events_event_sequence_seq'),
    p.id,
    p.title,
    p.handle,
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

  -- 10. Record webhook event for multi-tier idempotency in payment_events
  insert into payment_events (
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

-- 5. Update prune_old_webhook_events function
create or replace function prune_old_webhook_events(p_days int default 90)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted int;
begin
  delete from payment_events
  where processed_at < now() - (p_days || ' days')::interval;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function prune_old_webhook_events from public, anon, authenticated;
grant execute on function prune_old_webhook_events to service_role;
