-- 001_initial_schema.sql
-- Core 2026 Production Schema for BumpOne.lol
-- PostgreSQL 16+ / Supabase Engine
-- Clean Architecture: users (creators) own projects (board slots)

-- ==============================================================================
-- 1. Allowed Categories
-- ==============================================================================
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  slug text unique not null,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

-- ==============================================================================
-- 2. Users (Authenticated creator accounts wrapping auth.users)
-- ==============================================================================
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null,
  display_name text not null,
  avatar_url text,
  bio text,
  website text,
  twitter text,
  github text,
  reactions_fire int not null default 0,
  reactions_eyes int not null default 0,
  reactions_heart int not null default 0,
  reactions_laugh int not null default 0,
  total_reactions int generated always as (
    reactions_fire + reactions_eyes + reactions_heart + reactions_laugh
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_handle on users (handle);
create index if not exists idx_users_total_reactions on users (total_reactions desc);

-- Auto-provision public user profile on Supabase auth signup
create or replace function handle_new_user()
returns trigger as $$
declare
  v_handle text;
  v_base_handle text;
  v_counter int := 1;
begin
  v_base_handle := lower(regexp_replace(
    coalesce(
      nullif(new.raw_user_meta_data->>'user_name', ''),
      nullif(split_part(new.email, '@', 1), ''),
      'creator'
    ),
    '[^a-zA-Z0-9_]', '', 'g'
  ));
  if length(v_base_handle) < 2 then
    v_base_handle := 'creator';
  end if;
  
  v_handle := v_base_handle;
  loop
    begin
      insert into public.users (id, handle, display_name, avatar_url)
      values (
        new.id,
        v_handle,
        coalesce(
          nullif(new.raw_user_meta_data->>'full_name', ''),
          nullif(new.raw_user_meta_data->>'name', ''),
          nullif(new.raw_user_meta_data->>'user_name', ''),
          'Creator'
        ),
        new.raw_user_meta_data->>'avatar_url'
      );
      exit;
    exception
      when unique_violation then
        -- If this user ID is already provisioned, exit gracefully
        if exists (select 1 from public.users where id = new.id) then
          exit;
        end if;
        -- Handle collision: increment counter and retry
        v_counter := v_counter + 1;
        v_handle := v_base_handle || v_counter::text;
    end;
  end loop;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ==============================================================================
-- 3. Admin Users (Role-based administrator authorization)
-- ==============================================================================
create table if not exists admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin', -- 'admin', 'super_admin'
  created_at timestamptz not null default now()
);

-- ==============================================================================
-- 4. Projects (100 Slots on the Grid + Graveyard archive)
-- ==============================================================================
do $$ begin
  create type project_moderation_status as enum ('approved', 'suspended', 'rejected');
exception
  when duplicate_object then null;
end $$;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  title text not null,
  handle text not null,
  image_path text not null,
  destination_url text not null,
  category_id uuid references categories(id) on delete restrict not null,
  current_rank int, -- Materialized position (1-100), NULL if bumped off board into Graveyard
  current_active_value_minor bigint not null default 0, -- USD cents (sole monetary representation)
  total_paid_minor bigint not null default 0, -- Lifetime spend in USD cents
  ranking_sequence bigint not null default 0, -- Monotonic sequence timestamp (earlier wins tiebreaker)
  is_active boolean not null default true,
  moderation_status project_moderation_status not null default 'approved',
  image_pos_x int not null default 50,
  image_pos_y int not null default 50,
  image_zoom numeric(3,2) not null default 1.0,
  frame text not null default 'default',
  views_count bigint not null default 0,
  reactions_fire int not null default 0,
  reactions_eyes int not null default 0,
  reactions_heart int not null default 0,
  reactions_laugh int not null default 0,
  total_reactions int generated always as (
    reactions_fire + reactions_eyes + reactions_heart + reactions_laugh
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Structural & Financial Constraints
  constraint chk_projects_active_value_non_negative check (current_active_value_minor >= 0),
  constraint chk_projects_total_paid_non_negative check (total_paid_minor >= 0),
  constraint chk_projects_current_rank_range check (current_rank is null or (current_rank >= 1 and current_rank <= 100))
);

create index if not exists idx_projects_total_reactions on projects (total_reactions desc);

create index if not exists idx_projects_user on projects (user_id);
create index if not exists idx_projects_category on projects (category_id);
create index if not exists idx_projects_ranking_order on projects (current_active_value_minor desc, ranking_sequence asc);

-- Crucial: Enforce strict uniqueness for active ranks 1..100 (No two projects can share rank 17)
create unique index if not exists idx_projects_active_rank on projects (current_rank)
where is_active = true and current_rank is not null;

-- ==============================================================================
-- 5. Purchase Quotes (Authoritative Server-Generated Purchase Offers)
-- ==============================================================================
do $$ begin
  create type purchase_quote_status as enum ('checkout_open', 'paid', 'expired', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists purchase_quotes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete restrict,
  user_id uuid not null references users(id) on delete restrict,
  target_rank int not null check (target_rank between 1 and 100),
  quoted_amount_minor bigint not null check (quoted_amount_minor >= 1000 and quoted_amount_minor % 100 = 0),
  expected_rank int not null check (expected_rank between 1 and 101),
  expires_at timestamptz not null,
  status purchase_quote_status not null default 'checkout_open',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_purchase_quotes_project_status on purchase_quotes(project_id, status);
create index if not exists idx_purchase_quotes_user_status on purchase_quotes(user_id, status, created_at desc);
create index if not exists idx_purchase_quotes_expires on purchase_quotes(expires_at);

-- ==============================================================================
-- 6. Payments (Financial gateway transaction lifecycle)
-- ==============================================================================
do $$ begin
  create type payment_status as enum (
    'created', 'pending', 'paid', 'failed', 'cancelled', 'disputed', 'chargeback'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete restrict not null, -- Never delete financial history
  user_id uuid references users(id) on delete set null,
  quote_id uuid references purchase_quotes(id) on delete set null,
  provider text not null default 'dodo',
  provider_payment_id text unique,
  provider_checkout_id text,
  amount_minor bigint not null, -- Amount paid in cents
  currency text not null default 'USD',
  previous_active_value_minor bigint not null default 0,
  new_active_value_minor bigint not null default 0,
  previous_rank int,
  new_rank int not null,
  status payment_status not null default 'created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Financial constraints
  constraint chk_payments_amount_positive check (amount_minor > 0),
  constraint chk_payments_prev_value_non_negative check (previous_active_value_minor >= 0),
  constraint chk_payments_new_value_non_negative check (new_active_value_minor >= 0),
  constraint chk_payments_new_rank_range check (new_rank >= 1 and new_rank <= 100)
);

create index if not exists idx_payments_project_created on payments (project_id, created_at desc);
create index if not exists idx_payments_user_created on payments (user_id, created_at desc);
create index if not exists idx_payments_provider_payment on payments (provider_payment_id);
create index if not exists idx_payments_status_created on payments (status, created_at desc);

-- ==============================================================================
-- 7. Payment Events (Idempotency Ledger)
-- ==============================================================================
create table if not exists payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'dodo',
  provider_event_id text not null, -- Dodo webhook-id header
  payment_id text,                 -- Dodo payment_id
  event_type text not null,        -- payment.succeeded, payment.dispute, etc.
  payload jsonb not null,
  processed_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists idx_payment_events_payment_id on payment_events (payment_id);

-- ==============================================================================
-- 8. Board Events (Monotonic displacement audit journal)
-- ==============================================================================
do $$ begin
  create type board_event_type as enum (
    'inserted', 'bumped', 'left_top_100', 'returned_to_top_100', 'admin_override'
  );
exception
  when duplicate_object then null;
end $$;

create sequence if not exists global_event_sequence_seq start 1000;

create table if not exists board_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint not null default nextval('global_event_sequence_seq'),
  payment_id uuid references payments(id) on delete set null,
  project_id uuid references projects(id) on delete restrict not null, -- Historical audit preserved
  project_title_snapshot text, -- Preserves project identity if ever archived
  project_handle_snapshot text,
  previous_rank int,
  new_rank int not null,
  previous_active_value_minor bigint not null default 0,
  new_active_value_minor bigint not null default 0,
  category_id uuid references categories(id) on delete set null,
  profiles_displaced int not null default 0,
  event_type board_event_type not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_board_events_sequence on board_events (event_sequence);
create index if not exists idx_board_events_project on board_events (project_id, created_at desc);
create index if not exists idx_board_events_created on board_events (created_at desc);

-- ==============================================================================
-- 9. Reactions Ledger
-- ==============================================================================
do $$ begin
  create type reaction_type as enum ('fire', 'eyes', 'heart', 'laugh');
exception
  when duplicate_object then null;
end $$;

create table if not exists reactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  target_user_id uuid references users(id) on delete cascade,
  anonymous_id text not null, -- signed cookie UUIDv4
  reaction_type reaction_type not null,
  created_at timestamptz not null default now(),
  constraint chk_reaction_target check (
    (project_id is not null and target_user_id is null) or
    (project_id is null and target_user_id is not null)
  ),
  constraint uq_project_reaction unique (project_id, anonymous_id, reaction_type),
  constraint uq_user_reaction unique (target_user_id, anonymous_id, reaction_type)
);

create index if not exists idx_reactions_anonymous on reactions (anonymous_id);
create index if not exists idx_reactions_project on reactions (project_id) where project_id is not null;
create index if not exists idx_reactions_target_user on reactions (target_user_id) where target_user_id is not null;

-- ==============================================================================
-- 10. Messages (War Room Trollbox / Live Feed)
-- ==============================================================================
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  author_name text not null,
  author_handle text,
  avatar_color text not null default '#ef4444',
  text text not null,
  slot_tag int, -- Optional slot referenced (1..100)
  is_official boolean not null default false,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint chk_messages_slot_tag check (slot_tag is null or (slot_tag >= 1 and slot_tag <= 100))
);

create index if not exists idx_messages_created_at on messages (created_at desc);
create index if not exists idx_messages_user on messages (user_id);

-- ==============================================================================
-- 11. Moderation Reports
-- ==============================================================================
do $$ begin
  create type report_status as enum ('open', 'under_review', 'resolved_actioned', 'resolved_no_action', 'dismissed');
exception
  when duplicate_object then null;
end $$;

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  reporter_id text,
  reason text not null,
  details text,
  status report_status not null default 'open',
  admin_notes text,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_reports_reason check (reason in ('scam', 'spam', 'offensive', 'broken_link', 'other'))
);

create index if not exists idx_reports_project on reports (project_id);
create index if not exists idx_reports_status_created on reports (status, created_at desc);

-- ==============================================================================
-- 12. Admin Audit Log (Immutable Administrative Action History)
-- ==============================================================================
create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  admin_identifier text not null default 'admin',
  action text not null,
  target_type text not null, -- 'project', 'user', 'payment', 'report', 'system'
  target_id text not null,
  reason text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_log_created on admin_audit_log (created_at desc);
create index if not exists idx_admin_audit_log_target on admin_audit_log (target_type, target_id);

-- ==============================================================================
-- 13. System Global State (Emergency Killswitch & Operational Config)
-- ==============================================================================
create table if not exists system_state (
  id text primary key default 'global',
  purchases_paused boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into system_state (id, purchases_paused) values ('global', false)
on conflict (id) do nothing;

-- ==============================================================================
-- 14. Protection Trigger: Prevent unauthorized client modifications
-- ==============================================================================
create or replace function protect_project_authoritative_fields()
returns trigger as $$
begin
  -- Only postgres / service_role can modify ranking, monetary, and moderation fields
  if (current_user not in ('postgres', 'service_role') and coalesce(auth.role(), '') <> 'service_role') and (
    new.current_rank is distinct from old.current_rank or
    new.current_active_value_minor is distinct from old.current_active_value_minor or
    new.total_paid_minor is distinct from old.total_paid_minor or
    new.ranking_sequence is distinct from old.ranking_sequence or
    new.moderation_status is distinct from old.moderation_status or
    new.is_active is distinct from old.is_active
  ) then
    raise exception 'Security violation: Authoritative ranking and financial fields can only be modified by the service role';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_protect_project_fields on projects;
create trigger trg_protect_project_fields
  before update on projects
  for each row execute function protect_project_authoritative_fields();

-- ==============================================================================
-- 15. Automated Timestamp Trigger Function
-- ==============================================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();

drop trigger if exists trg_projects_updated_at on projects;
create trigger trg_projects_updated_at
  before update on projects
  for each row execute function set_updated_at();

drop trigger if exists trg_payments_updated_at on payments;
create trigger trg_payments_updated_at
  before update on payments
  for each row execute function set_updated_at();

drop trigger if exists trg_reports_updated_at on reports;
create trigger trg_reports_updated_at
  before update on reports
  for each row execute function set_updated_at();

drop trigger if exists trg_system_state_updated_at on system_state;
create trigger trg_system_state_updated_at
  before update on system_state
  for each row execute function set_updated_at();
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
-- 3. Atomic Inlined Reaction RPCs (Projects & Users)
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
  v_new_count int := 0;
begin
  if p_reaction_type not in ('fire', 'eyes', 'heart', 'laugh') then
    return jsonb_build_object('success', false, 'error', 'Invalid reaction type');
  end if;

  if not exists (select 1 from projects where id = p_project_id) then
    return jsonb_build_object('success', false, 'error', 'Project not found');
  end if;

  with inserted as (
    insert into reactions (project_id, anonymous_id, reaction_type)
    values (p_project_id, p_anonymous_id, p_reaction_type::reaction_type)
    on conflict (project_id, anonymous_id, reaction_type) do nothing
    returning id
  )
  select exists (select 1 from inserted) into v_is_new;

  if not v_is_new then
    if p_reaction_type = 'fire' then
      select reactions_fire into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'eyes' then
      select reactions_eyes into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'heart' then
      select reactions_heart into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'laugh' then
      select reactions_laugh into v_new_count from projects where id = p_project_id;
    end if;

    return jsonb_build_object(
      'success', true,
      'reaction', p_reaction_type,
      'count', coalesce(v_new_count, 0),
      'already_reacted', true
    );
  end if;

  if p_reaction_type = 'fire' then
    update projects set reactions_fire = reactions_fire + 1 where id = p_project_id returning reactions_fire into v_new_count;
  elsif p_reaction_type = 'eyes' then
    update projects set reactions_eyes = reactions_eyes + 1 where id = p_project_id returning reactions_eyes into v_new_count;
  elsif p_reaction_type = 'heart' then
    update projects set reactions_heart = reactions_heart + 1 where id = p_project_id returning reactions_heart into v_new_count;
  elsif p_reaction_type = 'laugh' then
    update projects set reactions_laugh = reactions_laugh + 1 where id = p_project_id returning reactions_laugh into v_new_count;
  end if;

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

create or replace function remove_project_reaction(
  p_project_id uuid,
  p_anonymous_id text,
  p_reaction_type text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted boolean := false;
  v_new_count int := 0;
begin
  if p_reaction_type not in ('fire', 'eyes', 'heart', 'laugh') then
    return jsonb_build_object('success', false, 'error', 'Invalid reaction type');
  end if;

  with deleted as (
    delete from reactions
    where project_id = p_project_id
      and anonymous_id = p_anonymous_id
      and reaction_type = p_reaction_type::reaction_type
    returning id
  )
  select exists (select 1 from deleted) into v_deleted;

  if not v_deleted then
    if p_reaction_type = 'fire' then
      select reactions_fire into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'eyes' then
      select reactions_eyes into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'heart' then
      select reactions_heart into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'laugh' then
      select reactions_laugh into v_new_count from projects where id = p_project_id;
    end if;

    return jsonb_build_object('success', true, 'reaction', p_reaction_type, 'count', coalesce(v_new_count, 0));
  end if;

  if p_reaction_type = 'fire' then
    update projects set reactions_fire = greatest(0, reactions_fire - 1) where id = p_project_id returning reactions_fire into v_new_count;
  elsif p_reaction_type = 'eyes' then
    update projects set reactions_eyes = greatest(0, reactions_eyes - 1) where id = p_project_id returning reactions_eyes into v_new_count;
  elsif p_reaction_type = 'heart' then
    update projects set reactions_heart = greatest(0, reactions_heart - 1) where id = p_project_id returning reactions_heart into v_new_count;
  elsif p_reaction_type = 'laugh' then
    update projects set reactions_laugh = greatest(0, reactions_laugh - 1) where id = p_project_id returning reactions_laugh into v_new_count;
  end if;

  return jsonb_build_object('success', true, 'reaction', p_reaction_type, 'count', v_new_count);
end;
$$;

revoke execute on function remove_project_reaction from public, anon;
grant execute on function remove_project_reaction to authenticated, service_role;

create or replace function add_user_reaction(
  p_user_id uuid,
  p_anonymous_id text,
  p_reaction_type text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_new boolean := false;
  v_new_count int := 0;
begin
  if p_reaction_type not in ('fire', 'eyes', 'heart', 'laugh') then
    return jsonb_build_object('success', false, 'error', 'Invalid reaction type');
  end if;

  if not exists (select 1 from users where id = p_user_id) then
    return jsonb_build_object('success', false, 'error', 'User not found');
  end if;

  with inserted as (
    insert into reactions (target_user_id, anonymous_id, reaction_type)
    values (p_user_id, p_anonymous_id, p_reaction_type::reaction_type)
    on conflict (target_user_id, anonymous_id, reaction_type) do nothing
    returning id
  )
  select exists (select 1 from inserted) into v_is_new;

  if not v_is_new then
    if p_reaction_type = 'fire' then
      select reactions_fire into v_new_count from users where id = p_user_id;
    elsif p_reaction_type = 'eyes' then
      select reactions_eyes into v_new_count from users where id = p_user_id;
    elsif p_reaction_type = 'heart' then
      select reactions_heart into v_new_count from users where id = p_user_id;
    elsif p_reaction_type = 'laugh' then
      select reactions_laugh into v_new_count from users where id = p_user_id;
    end if;

    return jsonb_build_object(
      'success', true,
      'reaction', p_reaction_type,
      'count', coalesce(v_new_count, 0),
      'already_reacted', true
    );
  end if;

  if p_reaction_type = 'fire' then
    update users set reactions_fire = reactions_fire + 1 where id = p_user_id returning reactions_fire into v_new_count;
  elsif p_reaction_type = 'eyes' then
    update users set reactions_eyes = reactions_eyes + 1 where id = p_user_id returning reactions_eyes into v_new_count;
  elsif p_reaction_type = 'heart' then
    update users set reactions_heart = reactions_heart + 1 where id = p_user_id returning reactions_heart into v_new_count;
  elsif p_reaction_type = 'laugh' then
    update users set reactions_laugh = reactions_laugh + 1 where id = p_user_id returning reactions_laugh into v_new_count;
  end if;

  return jsonb_build_object(
    'success', true,
    'reaction', p_reaction_type,
    'count', v_new_count,
    'already_reacted', false
  );
end;
$$;

revoke execute on function add_user_reaction from public, anon;
grant execute on function add_user_reaction to authenticated, service_role;

create or replace function remove_user_reaction(
  p_user_id uuid,
  p_anonymous_id text,
  p_reaction_type text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted boolean := false;
  v_new_count int := 0;
begin
  if p_reaction_type not in ('fire', 'eyes', 'heart', 'laugh') then
    return jsonb_build_object('success', false, 'error', 'Invalid reaction type');
  end if;

  with deleted as (
    delete from reactions
    where target_user_id = p_user_id
      and anonymous_id = p_anonymous_id
      and reaction_type = p_reaction_type::reaction_type
    returning id
  )
  select exists (select 1 from deleted) into v_deleted;

  if not v_deleted then
    if p_reaction_type = 'fire' then
      select reactions_fire into v_new_count from users where id = p_user_id;
    elsif p_reaction_type = 'eyes' then
      select reactions_eyes into v_new_count from users where id = p_user_id;
    elsif p_reaction_type = 'heart' then
      select reactions_heart into v_new_count from users where id = p_user_id;
    elsif p_reaction_type = 'laugh' then
      select reactions_laugh into v_new_count from users where id = p_user_id;
    end if;

    return jsonb_build_object('success', true, 'reaction', p_reaction_type, 'count', coalesce(v_new_count, 0));
  end if;

  if p_reaction_type = 'fire' then
    update users set reactions_fire = greatest(0, reactions_fire - 1) where id = p_user_id returning reactions_fire into v_new_count;
  elsif p_reaction_type = 'eyes' then
    update users set reactions_eyes = greatest(0, reactions_eyes - 1) where id = p_user_id returning reactions_eyes into v_new_count;
  elsif p_reaction_type = 'heart' then
    update users set reactions_heart = greatest(0, reactions_heart - 1) where id = p_user_id returning reactions_heart into v_new_count;
  elsif p_reaction_type = 'laugh' then
    update users set reactions_laugh = greatest(0, reactions_laugh - 1) where id = p_user_id returning reactions_laugh into v_new_count;
  end if;

  return jsonb_build_object('success', true, 'reaction', p_reaction_type, 'count', v_new_count);
end;
$$;

revoke execute on function remove_user_reaction from public, anon;
grant execute on function remove_user_reaction to authenticated, service_role;

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
  delete from payment_events
  where processed_at < now() - (p_days || ' days')::interval;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function prune_old_webhook_events from public, anon, authenticated;
grant execute on function prune_old_webhook_events to service_role;
-- 003_rls_policies.sql
-- 2026 Production Row Level Security (RLS) & Realtime Publication for BumpOne.lol
-- PostgreSQL 16+ / Supabase Engine
-- Security Hardened: Anonymous direct write policies removed, RPC/service-role enforced

-- ==============================================================================
-- 1. Enable RLS on all tables
-- ==============================================================================
alter table categories enable row level security;
alter table users enable row level security;
alter table admin_users enable row level security;
alter table projects enable row level security;
alter table purchase_quotes enable row level security;
alter table payments enable row level security;
alter table payment_events enable row level security;
alter table board_events enable row level security;
alter table reactions enable row level security;
alter table messages enable row level security;
alter table reports enable row level security;
alter table admin_audit_log enable row level security;
alter table system_state enable row level security;

-- ==============================================================================
-- 2. Public & Authenticated Read Policies
-- ==============================================================================

-- Categories: Viewable by anyone
create policy "Categories are publicly viewable"
  on categories for select
  using (true);

-- Users: Creator accounts are publicly readable
create policy "Users are publicly viewable"
  on users for select
  using (true);

-- Users: Authenticated creators can insert and update their own account
create policy "Users can insert their own user account"
  on users for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own user account"
  on users for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admin Users: Only admins can view admin membership
create policy "Admin users are viewable by admins"
  on admin_users for select
  to authenticated
  using (auth.uid() in (select id from admin_users));

-- Projects: Public can view active approved projects
create policy "Public can view active approved projects"
  on projects for select
  using (moderation_status = 'approved' and is_active = true);

-- Projects: Authenticated users can view their own projects regardless of status
create policy "Users can view their own projects"
  on projects for select
  to authenticated
  using (auth.uid() = user_id);

-- Projects: Owners can update their own project (guarded by trg_protect_project_fields)
create policy "Users can update their own project metadata"
  on projects for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Purchase Quotes: Users can view their own quotes
create policy "Users can view their own quotes"
  on purchase_quotes for select
  to authenticated
  using (auth.uid() = user_id);

-- Payments: Users can view their own payments
create policy "Users can view their own payments"
  on payments for select
  to authenticated
  using (auth.uid() = user_id);

-- Board Events: Immutable public audit ledger of displacements & history
create policy "Board events are publicly readable"
  on board_events for select
  using (true);

-- Messages: Non-deleted war room messages are publicly readable
create policy "Messages are publicly readable"
  on messages for select
  using (is_deleted = false);

-- System State: Global killswitch / operational status is publicly readable
create policy "System state is publicly readable"
  on system_state for select
  using (true);

-- ==============================================================================
-- 3. Strict Write Policies
-- Authoritative writes (financial transactions, purchase quotes, ranking mutations,
-- moderation actions, reaction counters, and system state) route exclusively through
-- validated Next.js server APIs/RPCs using service_role.
--
-- Direct authenticated user writes are restricted to:
--   - Creator user profile metadata (display_name, handle, avatar_url, bio, etc.)
--   - Creator project display metadata (title, handle, image_path, destination_url, pos/zoom, frame)
--     Guarded by trg_protect_project_fields (cannot touch active_value, rank, moderation_status)
--   - War Room messages (text, slot_tag, avatar_color)
--     Guarded by populate_message_author() trigger (forces is_official = false, authenticates author)
--
-- Direct anon inserts on reactions, reports, messages, quotes, and payments
-- are strictly blocked by RLS.
-- ==============================================================================

-- Authenticated creators can insert their own messages with ownership link
-- Column-level grants prevent spoofing is_official, author_name, author_handle
create policy "Authenticated users can post war room messages"
  on messages for insert
  to authenticated
  with check (auth.uid() = user_id and is_official = false);

revoke insert on messages from authenticated;
grant insert (user_id, text, slot_tag, avatar_color) on messages to authenticated;

-- Auto-populate author identity from the users table and force is_official = false
-- This prevents authenticated users from impersonating admins or other users
create or replace function populate_message_author()
returns trigger as $$
begin
  if new.user_id is not null then
    select display_name, handle into new.author_name, new.author_handle
    from users where id = new.user_id;
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
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_populate_message_author on messages;
create trigger trg_populate_message_author
  before insert on messages
  for each row execute function populate_message_author();

-- Restrict updateable columns for authenticated creators (defense-in-depth alongside trigger)
revoke update on projects from authenticated;
grant update (title, handle, image_path, destination_url, category_id, image_pos_x, image_pos_y, image_zoom, frame) on projects to authenticated;

revoke update on users from authenticated;
grant update (display_name, handle, avatar_url, bio, website, twitter, github) on users to authenticated;

-- ==============================================================================
-- 4. Enable Supabase Realtime Broadcast on Core War Room Tables
-- ==============================================================================
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
exception when others then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table projects;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table board_events;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table users;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null;
end $$;
-- 004_seed.sql
-- Seed categories, Genesis projects, initial board events, and initial messages
-- Clean Architecture: operates on categories, projects, board_events, messages

-- ==============================================================================
-- PART 1: Production-Essential Reference Data (Required in all environments)
-- ==============================================================================
insert into categories (name, slug, display_order) values
  ('AI', 'ai', 1),
  ('Apps', 'apps', 2),
  ('Websites', 'websites', 3),
  ('Creators', 'creators', 4),
  ('Games', 'games', 5),
  ('Design', 'design', 6),
  ('Tech', 'tech', 7)
on conflict (slug) do update set
  name = excluded.name,
  display_order = excluded.display_order;

-- ==============================================================================
-- PART 2: Bootstrap Genesis Board (Initial 100 Slots)
-- As documented in docs/03_PRICING_SYSTEM.md and docs/21_LAUNCH_PLAN.md,
-- BumpOne launches with an initial 100-slot Genesis board (#1 = $100 down to #100 = $1).
-- Note: total_paid_minor is strictly set to 0 (no fake payments recorded in ledger).
-- Once filled, every subsequent takeover requires target + $10 top-up.
-- ==============================================================================
do $$
declare
  cat_ai uuid;
  cat_apps uuid;
  cat_websites uuid;
  cat_creators uuid;
  cat_games uuid;
  cat_design uuid;
  cat_tech uuid;
  v_val_minor bigint;
  v_cat uuid;
  v_title text;
  v_handle text;
  v_url text;
  v_img text;
  v_project_id uuid;
begin
  select id into cat_ai from categories where slug = 'ai';
  select id into cat_apps from categories where slug = 'apps';
  select id into cat_websites from categories where slug = 'websites';
  select id into cat_creators from categories where slug = 'creators';
  select id into cat_games from categories where slug = 'games';
  select id into cat_design from categories where slug = 'design';
  select id into cat_tech from categories where slug = 'tech';

  -- Only seed if projects table is empty
  if not exists (select 1 from projects limit 1) then
    for i in 1..100 loop
      v_val_minor := (101 - i) * 100; -- in USD cents ($100 = 10000 cents, $1 = 100 cents)
      
      -- Assign varied categories & brands
      case (i % 7)
        when 0 then
          v_cat := cat_ai;
          v_title := case when i = 1 then 'Apex AI Copilot' else 'Neural Agent #' || i end;
          v_handle := '@apex_ai';
          v_url := 'https://github.com';
          v_img := 'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=500&auto=format&fit=crop&q=80';
        when 1 then
          v_cat := cat_tech;
          v_title := case when i = 1 then 'Solana Syndicate DAO' else 'Hyperdrive Protocol #' || i end;
          v_handle := '@sabor_dao';
          v_url := 'https://solana.com';
          v_img := 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=700&auto=format&fit=crop&q=80';
        when 2 then
          v_cat := cat_design;
          v_title := case when i = 2 then 'Cyberpunk Tokyo' else 'Studio Neon #' || i end;
          v_handle := '@shinji_3d';
          v_url := 'https://artstation.com';
          v_img := 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=700&auto=format&fit=crop&q=80';
        when 3 then
          v_cat := cat_creators;
          v_title := case when i = 3 then 'Neon Samurai Genesis' else 'Creator Wave #' || i end;
          v_handle := '@vortex_eth';
          v_url := 'https://opensea.io';
          v_img := 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80';
        when 4 then
          v_cat := cat_apps;
          v_title := case when i = 4 then 'SaaS Pulse Tracker' else 'Orbit Chat #' || i end;
          v_handle := '@marcus_builds';
          v_url := 'https://indiehackers.com';
          v_img := 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&auto=format&fit=crop&q=80';
        when 5 then
          v_cat := cat_games;
          v_title := case when i = 5 then 'Voxel Punk Arcade' else 'Ether Knight #' || i end;
          v_handle := '@pixel_pete';
          v_url := 'https://itch.io';
          v_img := 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=700&auto=format&fit=crop&q=80';
        else
          v_cat := cat_websites;
          v_title := case when i = 6 then 'Lumen Grid' else 'Chrome Atlas #' || i end;
          v_handle := '@lumen_grid';
          v_url := 'https://vercel.com';
          v_img := 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=700&auto=format&fit=crop&q=80';
      end case;

      insert into projects (
        title, handle, image_path, destination_url,
        category_id, current_rank, current_active_value_minor,
        total_paid_minor, ranking_sequence, is_active,
        image_pos_x, image_pos_y, image_zoom, frame, views_count,
        reactions_fire, reactions_eyes, reactions_heart, reactions_laugh
      ) values (
        v_title, v_handle, v_img, v_url,
        v_cat, i, v_val_minor,
        v_val_minor, 1000 + i, true,
        50, 50, 1.0, 'default', (101 - i) * 37,
        (i * 7) % 53, (i * 3) % 29, (i * 5) % 19, (i * 2) % 11
      ) returning id into v_project_id;

      -- Initial seed board displacement event
      insert into board_events (
        event_sequence, project_id, project_title_snapshot, project_handle_snapshot,
        previous_rank, new_rank, previous_active_value_minor, new_active_value_minor,
        category_id, profiles_displaced, event_type
      ) values (
        1000 + i, v_project_id, v_title, v_handle,
        null, i, 0, v_val_minor, v_cat, 0, 'inserted'
      );
    end loop;

    -- Seed initial War Room messages
    insert into messages (author_name, author_handle, avatar_color, text, slot_tag, is_official) values
      ('System', '@bumpone', '#06b6d4', 'The 100-slot grid is live! Top up your project bid to displace rivals and capture #1.', 1, true),
      ('Apex AI', '@apex_ai', '#8b5cf6', 'Rank #1 secured for now. Who has the courage to bump us?', 1, false),
      ('Hyperdrive', '@sabor_dao', '#10b981', 'Preparing top-up... Slot #1 belongs to the DAO.', 2, false);
  end if;
end $$;
