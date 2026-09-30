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
  alter publication supabase_realtime add table reaction_counts;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table messages;
exception when duplicate_object then null;
end $$;
