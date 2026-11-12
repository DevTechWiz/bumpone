-- 028_dynamic_free_claims_config.sql
-- Server-controlled dynamic configuration for free launch claims and board limits.
-- 
-- Columns added to system_state:
--   * free_claims_enabled: master toggle for free launch promo claims (default true)
--   * free_claims_limit: maximum board slots allowed to enter for free (default 50)
--   * min_bump_usd: dynamic minimum USD increment/entry (default 10)
--
-- Security:
--   system_state has deny-by-default Row-Level Security (RLS) from migration 019.
--   No client anon/authenticated role has SELECT or UPDATE permissions on system_state.
--   Only server routes using the service role (supabaseAdmin) can read or mutate this state.

ALTER TABLE public.system_state
  ADD COLUMN IF NOT EXISTS free_claims_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS free_claims_limit integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS min_bump_usd integer NOT NULL DEFAULT 10;

-- Ensure global row exists and has defaults populated
INSERT INTO public.system_state (id, purchases_paused, free_claims_enabled, free_claims_limit, min_bump_usd)
VALUES ('global', false, true, 50, 10)
ON CONFLICT (id) DO UPDATE SET
  free_claims_enabled = COALESCE(public.system_state.free_claims_enabled, true),
  free_claims_limit = COALESCE(public.system_state.free_claims_limit, 50),
  min_bump_usd = COALESCE(public.system_state.min_bump_usd, 10);
