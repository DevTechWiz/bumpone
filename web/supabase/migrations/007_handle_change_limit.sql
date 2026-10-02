-- 007_handle_change_limit.sql
-- Migration: Track when creator @handle was last updated to enforce 30-day cooldown limit

alter table users
  add column if not exists handle_last_changed_at timestamptz;

comment on column users.handle_last_changed_at is 'Timestamp of the most recent handle change; creators may update their handle once every 30 days.';
