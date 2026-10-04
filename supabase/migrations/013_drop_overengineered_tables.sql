-- 013_drop_overengineered_tables.sql
-- Schema Simplification & Over-Engineering Cleanup
--
-- 1. Drops obsolete `reaction_counts` table (already inlined into projects and users in migration 006)
-- 2. Drops redundant `admin_users` table (admin auth is now handled directly via ADMIN_EMAILS env var and Supabase auth app_metadata with zero DB query overhead)

-- 1. Drop reaction_counts if it exists
drop table if exists public.reaction_counts cascade;

-- 2. Drop admin_users if it exists
drop table if exists public.admin_users cascade;
