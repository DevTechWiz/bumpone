-- 013_drop_overengineered_tables.sql
-- Schema Simplification & Over-Engineering Cleanup
--
-- 1. Drops obsolete `reaction_counts` table (already inlined into projects and users in migration 006)
-- 2. Drops redundant `admin_users` table (admin auth is now handled directly via ADMIN_EMAILS env var and Supabase auth app_metadata with zero DB query overhead)
-- 3. Drops single-row `system_state` table (kill-switch is handled cleanly via PURCHASES_PAUSED env var at the edge)

-- 1. Drop reaction_counts if it exists
drop table if exists public.reaction_counts cascade;

-- 2. Drop admin_users if it exists
drop table if exists public.admin_users cascade;

-- 3. Drop system_state if it exists
drop table if exists public.system_state cascade;
