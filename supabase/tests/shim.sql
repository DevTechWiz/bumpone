-- shim.sql
-- Minimal Supabase-compatible environment so migrations 001..017 can replay on a
-- plain postgres:16 container (no Supabase CLI available in this repo).
-- Provides: Supabase roles, auth schema (auth.users, auth.uid, auth.role).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin nologin bypassrls;
  end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub', '')::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '')
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb
$$;

-- Supabase grants these by default; triggers (e.g. auth.role() inside protection
-- triggers) run as the requesting role and need schema usage + function execute.
grant usage on schema auth to anon, authenticated, service_role, supabase_admin;
grant execute on all functions in schema auth to anon, authenticated, service_role, supabase_admin;
