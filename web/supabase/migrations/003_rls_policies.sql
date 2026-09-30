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
alter table payment_webhook_events enable row level security;
alter table board_events enable row level security;
alter table reactions enable row level security;
alter table reaction_counts enable row level security;
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

-- Reaction Counts: Publicly readable for real-time counters
create policy "Reaction counts are publicly readable"
  on reaction_counts for select
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
-- Direct anon inserts on reactions, reports, messages, quotes, and payments
-- are intentionally NOT permitted via public RLS. All writes MUST route through
-- validated Next.js API endpoints using service_role to enforce HMAC cookies,
-- rate limits, content moderation, and fraud protection.
-- ==============================================================================

-- Authenticated creators can insert their own messages with ownership link
create policy "Authenticated users can post war room messages"
  on messages for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ==============================================================================
-- 4. Enable Supabase Realtime Broadcast on Core War Room Tables
-- ==============================================================================
do $$ begin
  alter publication supabase_realtime add table projects;
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table board_events;
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table reaction_counts;
exception
  when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table messages;
exception
  when duplicate_object then null;
end $$;
