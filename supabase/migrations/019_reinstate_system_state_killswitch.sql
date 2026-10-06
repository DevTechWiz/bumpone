-- ==============================================================================
-- 019: Reinstate the single-row system_state killswitch.
--
-- Migration 013 dropped system_state in favor of the PURCHASES_PAUSED env var,
-- but env vars only change on redeploy — the admin control plane's emergency
-- toggle became a no-op that logged actions it never performed (SEC-005).
-- The admin plane must be able to pause checkout creation at runtime.
--
-- Semantics:
--   * purchase/create consults PURCHASES_PAUSED (env, deploy-level) OR
--     system_state.purchases_paused (runtime, admin-controlled).
--   * Webhook processing is NOT gated — already-initiated checkouts keep
--     settling so legitimate paid transactions are never broken.
-- ==============================================================================

create table if not exists system_state (
  id text primary key default 'global',
  purchases_paused boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into system_state (id, purchases_paused) values ('global', false)
on conflict (id) do nothing;

-- Deny-by-default RLS: no policies for anon/authenticated.
-- Only the service role (server routes via supabaseAdmin) reads/writes this —
-- normal users cannot pause purchases or read state directly.
alter table system_state enable row level security;

drop trigger if exists trg_system_state_updated_at on system_state;
create trigger trg_system_state_updated_at
  before update on system_state
  for each row execute function set_updated_at();
