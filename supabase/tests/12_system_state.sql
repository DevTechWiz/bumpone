-- ==============================================================================
-- Phase 5: system_state killswitch RLS matrix.
-- Normal users must not be able to pause purchases (or even see the flag);
-- only the service role (admin routes via supabaseAdmin) may change it.
-- ==============================================================================

-- Mirror Supabase's default grants so RLS (not privilege) is the tested barrier.
-- service_role is BYPASSRLS but still needs table-level grants in this shim
-- (real Supabase grants them via default privileges).
grant select, insert, update on public.system_state to anon, authenticated;
grant select, insert, update on public.system_state to service_role;

do $$
declare
  v int;
  v_before timestamptz;
begin
  -- S0: 019 seeded exactly one global row
  select count(*) into v from system_state where id = 'global';
  perform t_assert(v = 1, 'S0 global system_state row exists');

  -- S1: anon sees nothing (RLS default deny, no SELECT policy)
  execute 'set role anon';
  select count(*) into v from system_state;
  reset role;
  perform t_assert(v = 0, 'S1 anon sees no system_state rows');

  -- S2: authenticated sees nothing
  perform set_config('request.jwt.claims',
    json_build_object('sub', uuid_for(1)::text, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
  select count(*) into v from system_state;
  reset role;
  perform t_assert(v = 0, 'S2 authenticated sees no system_state rows');

  -- S3: authenticated update affects 0 rows — pause flag cannot be flipped
  execute 'set role authenticated';
  update system_state set purchases_paused = true where id = 'global';
  get diagnostics v = row_count;
  reset role;
  perform t_assert(v = 0, 'S3 authenticated update affected 0 rows (RLS)');
  perform t_assert(
    (select purchases_paused from system_state where id = 'global') = false,
    'S3 pause flag unchanged after blocked update');

  -- S4: authenticated insert blocked outright (no policy WITH CHECK)
  execute 'set role authenticated';
  begin
    insert into system_state (id, purchases_paused) values ('global', true);
    raise exception 'S4 FAIL: authenticated inserted system_state directly';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', false);

  raise notice 'PASS: S (system_state killswitch RLS)';
end $$;

-- S5: service_role (the application path) can pause and resume.
-- Separate transaction from S6 so now()-based updated_at can advance.
do $$
begin
  execute 'set role service_role';
  update system_state set purchases_paused = true, updated_by = uuid_for(1)
    where id = 'global';
  reset role;
  perform t_assert(
    (select purchases_paused from system_state where id = 'global') = true,
    'S5 service_role pause applied');
end $$;

do $$
declare
  v_before timestamptz;
begin
  select updated_at into v_before from system_state where id = 'global';

  execute 'set role service_role';
  update system_state set purchases_paused = false where id = 'global';
  reset role;

  perform t_assert(
    (select purchases_paused from system_state where id = 'global') = false,
    'S5b service_role resume applied');
  perform t_assert(
    (select updated_at from system_state where id = 'global') > v_before,
    'S5b updated_at advanced by trigger across transactions');
  perform t_assert(
    (select updated_by from system_state where id = 'global') = uuid_for(1),
    'S5b updated_by records the acting admin');
end $$;
