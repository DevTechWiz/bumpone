# BumpOne.lol — Canonical Database & Realtime Architecture

## Overview
BumpOne.lol runs on PostgreSQL 16+ via Supabase. The database architecture is designed for:
1. **Zero Race-Condition Concurrency:** Serialized rank displacement transactions using PostgreSQL transaction advisory locks (`pg_advisory_xact_lock`).
2. **Strict Financial & Rank Integrity:** Monetary values are modeled exclusively as `bigint` minor units (USD cents). Ranks are strictly unique via partial index and bounded by CHECK constraints.
3. **Immutable Journals & Protected Foreign Keys:** Financial transactions (`payments`) and displacement audit history (`board_events`) use `ON DELETE RESTRICT` so history can never be silently erased.
4. **Native 2026 Supabase Realtime:** Built-in publication broadcasting changes on `projects`, `board_events`, `reaction_counts`, and `messages` directly to client WebSockets.

---

## Canonical Tables

### 1. `categories`
Stores allowed categories for slots.
```sql
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  slug text unique not null,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);
```

---

### 2. `users`
Public creator profile wrapping `auth.users`. Supports direct Instagram-style profile likes/reactions.
```sql
create table users (
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

create index idx_users_handle on users (handle);
create index idx_users_total_reactions on users (total_reactions desc);
```

---

### 3. `admin_users`
Role-based administrator authorization.
```sql
create table admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin', -- 'admin', 'super_admin'
  created_at timestamptz not null default now()
);
```

---

### 4. `projects`
The primary entity representing grid slots (1–100) and off-board Graveyard projects (`current_rank IS NULL`).
```sql
create type project_moderation_status as enum ('approved', 'suspended', 'rejected');

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  title text not null,
  handle text not null,
  image_path text not null,
  destination_url text not null,
  category_id uuid references categories(id) on delete restrict not null,
  current_rank int, -- materialized rank (1-100), null if unranked/Graveyard
  current_active_value_minor bigint not null default 0, -- USD cents (sole monetary representation)
  total_paid_minor bigint not null default 0, -- Lifetime spend in USD cents
  ranking_sequence bigint not null default 0, -- monotonic sequence of latest rank event (tiebreaker)
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

  constraint chk_projects_active_value_non_negative check (current_active_value_minor >= 0),
  constraint chk_projects_total_paid_non_negative check (total_paid_minor >= 0),
  constraint chk_projects_current_rank_range check (current_rank is null or (current_rank >= 1 and current_rank <= 100))
);

create index idx_projects_user on projects (user_id);
create index idx_projects_category on projects (category_id);
create index idx_projects_ranking_order on projects (current_active_value_minor desc, ranking_sequence asc);
create index idx_projects_total_reactions on projects (total_reactions desc);
create unique index idx_projects_active_rank on projects (current_rank) where is_active = true and current_rank is not null;
```

---

### 5. `purchase_quotes`
Authoritative server-generated purchase quotes with strict TTL.
```sql
create type purchase_quote_status as enum ('checkout_open', 'paid', 'expired', 'cancelled');

create table purchase_quotes (
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

create index idx_purchase_quotes_project_status on purchase_quotes(project_id, status);
create index idx_purchase_quotes_user_status on purchase_quotes(user_id, status, created_at desc);
create index idx_purchase_quotes_expires on purchase_quotes(expires_at);
```

---

### 6. `payments`
Gateway financial transactions and lifecycle ledger.
```sql
create type payment_status as enum (
  'created', 'pending', 'paid', 'failed', 'cancelled', 'disputed', 'chargeback'
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete restrict not null,
  user_id uuid references users(id) on delete set null,
  quote_id uuid references purchase_quotes(id) on delete set null,
  provider text not null default 'dodo',
  provider_payment_id text unique,
  provider_checkout_id text,
  amount_minor bigint not null,
  currency text not null default 'USD',
  previous_active_value_minor bigint not null default 0,
  new_active_value_minor bigint not null default 0,
  previous_rank int,
  new_rank int not null,
  status payment_status not null default 'created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_payments_amount_positive check (amount_minor > 0),
  constraint chk_payments_prev_value_non_negative check (previous_active_value_minor >= 0),
  constraint chk_payments_new_value_non_negative check (new_active_value_minor >= 0),
  constraint chk_payments_new_rank_range check (new_rank >= 1 and new_rank <= 100)
);

create index idx_payments_project_created on payments (project_id, created_at desc);
create index idx_payments_user_created on payments (user_id, created_at desc);
create index idx_payments_provider_payment on payments (provider_payment_id);
create index idx_payments_status_created on payments (status, created_at desc);
```

---

### 7. `payment_events`
Multi-provider webhook delivery and idempotency ledger.
```sql
create table payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'dodo',
  provider_event_id text not null,
  payment_id text,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index idx_payment_events_payment_id on payment_events (payment_id);
```

---

### 8. `board_events`
Monotonic rank displacement journal and historical trajectory record.
```sql
create type board_event_type as enum (
  'inserted', 'bumped', 'left_top_100', 'returned_to_top_100', 'admin_override'
);

create table board_events (
  id uuid primary key default gen_random_uuid(),
  event_sequence bigint not null default nextval('global_event_sequence_seq'),
  payment_id uuid references payments(id) on delete set null,
  project_id uuid references projects(id) on delete restrict not null,
  project_title_snapshot text,
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

create unique index idx_board_events_sequence on board_events (event_sequence);
create index idx_board_events_project on board_events (project_id, created_at desc);
create index idx_board_events_created on board_events (created_at desc);
```

---

### 9. `reactions` (Dual-Target Event Ledger)
Audit ledger tracking 1-reaction-per-identity across projects (reels) and user profiles. Standalone counts table eliminated in favor of inlined columns on `projects` and `users` for 0-join instant read queries.
```sql
create type reaction_type as enum ('fire', 'eyes', 'heart', 'laugh');

create table reactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  target_user_id uuid references users(id) on delete cascade,
  anonymous_id text not null,
  reaction_type reaction_type not null,
  created_at timestamptz not null default now(),
  constraint chk_reaction_target check (
    (project_id is not null and target_user_id is null) or
    (project_id is null and target_user_id is not null)
  ),
  constraint uq_project_reaction unique (project_id, anonymous_id, reaction_type),
  constraint uq_user_reaction unique (target_user_id, anonymous_id, reaction_type)
);

create index idx_reactions_anonymous on reactions (anonymous_id);
create index idx_reactions_project on reactions (project_id) where project_id is not null;
create index idx_reactions_target_user on reactions (target_user_id) where target_user_id is not null;
```

---

### 10. `messages`
War Room live trollbox feed.
```sql
create table messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  author_name text not null,
  author_handle text,
  avatar_color text not null default '#ef4444',
  text text not null,
  slot_tag int,
  is_official boolean not null default false,
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint chk_messages_slot_tag check (slot_tag is null or (slot_tag >= 1 and slot_tag <= 100))
);

create index idx_messages_created_at on messages (created_at desc);
```

---

### 11. `reports` & `admin_audit_log`
```sql
create type report_status as enum ('open', 'under_review', 'resolved_actioned', 'resolved_no_action', 'dismissed');

create table reports (
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

create table admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  admin_identifier text not null default 'admin',
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
```

---

### 12. `system_state`
Global operational switches and emergency purchase pause.
```sql
create table system_state (
  id text primary key default 'global',
  purchases_paused boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
```

---

1. **`process_dodo_purchase(p_event_id, p_payment_id, p_amount_minor, p_payload, p_project_id, p_quote_id)`**:
   - `pg_advisory_xact_lock(733100, 1)` dedicated numeric lock namespace
   - Validates webhook idempotency (`payment_events`)
   - Enforces authoritative quote validation: existence, `checkout_open` status, expiration check, quote amount match (`p_amount_minor = v_quote_amount`), and project binding
   - Enforces pre-created project validation and safeguards against reactivating suspended/rejected projects
   - Updates project `current_active_value_minor` and `ranking_sequence`
   - Atomically recalculates ranks 1..100 (`ORDER BY current_active_value_minor DESC, ranking_sequence ASC`)
   - Inserts into `payments`, `board_events` (buyer bump + graveyard casualty `left_top_100` displacement), and `payment_events`
   - Restricted to `service_role`
2. **`add_project_reaction(p_project_id, p_anonymous_id, p_reaction_type)`**:
   - Atomically records reaction and safely increments count only on genuine insert (eliminates duplicate-count bug)
3. **`recalculate_board_ranks()`**:
   - Serialized re-ranking maintenance RPC with advisory lock
4. **`protect_project_authoritative_fields()` Trigger**:
   - Guards `current_rank`, `current_active_value_minor`, `total_paid_minor`, `ranking_sequence`, `moderation_status`, `is_active` against direct client updates
5. **`handle_new_user()` Trigger**:
   - Automatically provisions `public.users` on `auth.users` insert with concurrency-safe retry loop
6. **`populate_message_author()` Trigger**:
   - Automatically derives author identity (`display_name`, `handle`) from `users` table and prevents client spoofing of `is_official` or arbitrary names/handles
7. **`prune_old_webhook_events(p_days)`**:
   - Maintenance function to purge raw webhook JSON payloads older than `p_days` (default 90 days) to prevent unbounded storage growth while preserving ledger integrity
