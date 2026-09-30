# BumpOne.lol — 2026 Database & Realtime Architecture

## Overview
BumpOne.lol runs on PostgreSQL 16+ via Supabase. The database architecture is designed for:
1. **Zero Race-Condition Concurrency:** Serialized rank displacement transactions using PostgreSQL transaction advisory locks (`pg_advisory_xact_lock`).
2. **Native 2026 Supabase Realtime:** Built-in publication broadcasting directly to client WebSockets without custom worker poller daemons.
3. **Stateless Edge Delivery:** Heavy read operations (such as `/api/board`) are served with HTTP stale-while-revalidate edge cache headers for ultra-fast TTFB.

---

## Tables

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

### 2. `profiles`
The primary entity representing grid slots (1–100) and off-board Graveyard profiles.
```sql
create type profile_moderation_status as enum ('approved', 'suspended', 'rejected');

create table profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  handle text not null,
  image_path text not null,
  destination_url text not null,
  category_id uuid references categories(id) on delete restrict not null,
  current_rank int, -- materialized rank (1-100), null if unranked/Graveyard
  current_active_value int not null default 0, -- Whole USD
  current_active_value_minor int not null default 0, -- USD cents (active_value * 100)
  total_paid_minor int not null default 0, -- Lifetime spend in USD cents
  sequence bigint not null default 0, -- monotonic sequence of latest rank event (tiebreaker)
  is_active boolean not null default true,
  moderation_status profile_moderation_status not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_user on profiles (user_id);
create index idx_profiles_active_rank on profiles (current_rank) where is_active = true and current_rank is not null;
create index idx_profiles_active_value on profiles (current_active_value desc, sequence asc);
create index idx_profiles_category on profiles (category_id);
```

---

### 3. `purchases`
Immutable financial ledger of completed checkout payments.
```sql
create type purchase_status as enum (
  'created', 'pending', 'paid', 'failed', 'cancelled', 'refunded', 'disputed', 'chargeback'
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete set null,
  quote_id text, -- Ephemeral quote token stored in Dodo metadata
  dodo_payment_id text unique,
  dodo_checkout_session_id text,
  amount_minor int not null,
  currency text not null default 'USD',
  previous_active_value_minor int not null,
  new_active_value_minor int not null,
  previous_rank int,
  new_rank int not null,
  status purchase_status not null default 'created',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_purchases_profile on purchases (profile_id);
create index idx_purchases_dodo_payment on purchases (dodo_payment_id);
```

---

### 4. `payment_events` (Webhook Idempotency)
Ensures Dodo webhook retries are processed exactly once.
```sql
create table payment_events (
  id uuid primary key default gen_random_uuid(),
  event_id text unique not null,
  payment_id text not null,
  event_type text not null,
  payload jsonb not null,
  processed_at timestamptz not null default now()
);

create index idx_payment_events_event_id on payment_events (event_id);
```

---

### 5. `rank_events`
Monotonic event journal of all ranking displacements. Powers War Room feeds, audio triggers, and history charts.
```sql
create type rank_event_type as enum (
  'inserted', 'bumped', 'left_top_100', 'returned_to_top_100', 'refund_rollback', 'admin_override'
);

create sequence global_event_sequence_seq start 1000;

create table rank_events (
  id uuid primary key default gen_random_uuid(),
  sequence bigint not null default nextval('global_event_sequence_seq'),
  purchase_id uuid references purchases(id) on delete set null,
  profile_id uuid references profiles(id) on delete cascade not null,
  previous_rank int,
  new_rank int not null,
  previous_active_value int not null,
  new_active_value int not null,
  category_id uuid references categories(id) on delete set null,
  profiles_displaced int not null default 0,
  event_type rank_event_type not null,
  created_at timestamptz not null default now()
);

create unique index idx_rank_events_sequence on rank_events (sequence);
create index idx_rank_events_profile on rank_events (profile_id, created_at desc);
```

---

### 6. `reactions` & `reaction_counts`
Anti-spam anonymous emoji reactions with atomic materialized counter cache.
```sql
create type reaction_type as enum ('fire', 'eyes', 'heart', 'laugh');

create table reactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade not null,
  anonymous_id text not null,
  reaction_type reaction_type not null,
  created_at timestamptz not null default now(),
  unique (profile_id, anonymous_id, reaction_type)
);

create table reaction_counts (
  profile_id uuid references profiles(id) on delete cascade not null,
  reaction_type reaction_type not null,
  count int not null default 0,
  primary key (profile_id, reaction_type)
);
```

---

### 7. `reports`
User moderation reports.
```sql
create type report_status as enum ('open', 'under_review', 'resolved_actioned', 'resolved_no_action', 'dismissed');

create table reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade not null,
  reporter_id text,
  reason text not null,
  details text,
  status report_status not null default 'open',
  admin_notes text,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

### 8. `admin_actions`
Audit log of admin PIN operations.
```sql
create table admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_identifier text not null default 'admin',
  action text not null,
  target_id uuid not null,
  reason text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
```

---

### 9. `system_state`
Single-row table storing global operational killswitches.
```sql
create table system_state (
  id text primary key default 'global',
  purchases_paused boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into system_state (id, purchases_paused) values ('global', false) on conflict do nothing;
```

---

## PostgreSQL Stored Procedures & Triggers

### 1. `process_dodo_purchase()`
Atomic webhook handler with serializing transaction lock:
* Executes `pg_advisory_xact_lock(hashtext('board_ranking_mutation'))`
* Validates webhook idempotency
* Recomputes ranks & shifts displaced profiles
* Updates buyer profile and bumps profiles > 100 to null
* Records in `rank_events`, `purchases`, and `payment_events`

### 2. `add_profile_reaction()`
Atomic single-query reaction recording and counter increment:
* Avoids multi-step read-modify-write race conditions
* Records in `reactions` (`on conflict do nothing`)
* Upserts `reaction_counts` atomically (`do update set count = count + 1`)

### 3. `recalculate_board_ranks()`
Maintenance procedure:
* Re-compacts positions 1–100 after moderation suspensions or payment refunds.

### 4. `set_updated_at()`
Trigger function ensuring `updated_at` timestamps update on every `UPDATE` operation across all tables.