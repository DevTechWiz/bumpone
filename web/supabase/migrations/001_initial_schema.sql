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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_handle on users (handle);

-- ==============================================================================
-- 3. Projects (100 Slots on the Grid + Graveyard archive)
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Structural & Financial Constraints
  constraint chk_projects_active_value_non_negative check (current_active_value_minor >= 0),
  constraint chk_projects_total_paid_non_negative check (total_paid_minor >= 0),
  constraint chk_projects_current_rank_range check (current_rank is null or (current_rank >= 1 and current_rank <= 100))
);

create index if not exists idx_projects_user on projects (user_id);
create index if not exists idx_projects_category on projects (category_id);
create index if not exists idx_projects_ranking_order on projects (current_active_value_minor desc, ranking_sequence asc);

-- Crucial: Enforce strict uniqueness for active ranks 1..100 (No two projects can share rank 17)
create unique index if not exists idx_projects_active_rank on projects (current_rank)
where is_active = true and current_rank is not null;

-- ==============================================================================
-- 4. Payments (Financial gateway transaction lifecycle)
-- ==============================================================================
do $$ begin
  create type payment_status as enum (
    'created', 'pending', 'paid', 'failed', 'cancelled', 'refunded', 'disputed', 'chargeback'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete restrict not null, -- Never delete financial history
  user_id uuid references users(id) on delete set null,
  provider text not null default 'dodo',
  quote_id text, -- Ephemeral client quote token (stored statelessly in gateway metadata)
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
-- 5. Payment Webhook Events (Idempotency Ledger)
-- ==============================================================================
create table if not exists payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'dodo',
  provider_event_id text not null, -- Dodo webhook-id header
  payment_id text,                 -- Dodo payment_id
  event_type text not null,        -- payment.succeeded, refund.succeeded, etc.
  payload jsonb not null,
  processed_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists idx_payment_webhook_events_payment_id on payment_webhook_events (payment_id);

-- ==============================================================================
-- 6. Board Events (Monotonic displacement audit journal)
-- ==============================================================================
do $$ begin
  create type board_event_type as enum (
    'inserted', 'bumped', 'left_top_100', 'returned_to_top_100', 'refund_rollback', 'admin_override'
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
-- 7. Reactions & Materialized Reaction Counts
-- ==============================================================================
do $$ begin
  create type reaction_type as enum ('fire', 'eyes', 'heart', 'laugh');
exception
  when duplicate_object then null;
end $$;

create table if not exists reactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  anonymous_id text not null, -- signed cookie UUIDv4 to prevent spamming
  reaction_type reaction_type not null,
  created_at timestamptz not null default now(),
  unique (project_id, anonymous_id, reaction_type)
);

create index if not exists idx_reactions_anonymous on reactions (anonymous_id);

create table if not exists reaction_counts (
  project_id uuid references projects(id) on delete cascade not null,
  reaction_type reaction_type not null,
  count int not null default 0,
  primary key (project_id, reaction_type)
);

-- ==============================================================================
-- 8. Messages (War Room Trollbox / Live Feed)
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
-- 9. Moderation Reports
-- ==============================================================================
do $$ begin
  create type report_status as enum ('open', 'under_review', 'resolved_actioned', 'resolved_no_action', 'dismissed');
exception
  when duplicate_object then null;
end $$;

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  reporter_id text, -- hashed anon id / token
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
-- 10. Admin Audit Log (Immutable Administrative Action History)
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
-- 11. System Global State (Emergency Killswitch & Operational Config)
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
-- 12. Automated Timestamp Trigger Function
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
