-- 11_authorization.sql
-- Phase 2 authorization suite: identity binding (SEC-004), privilege revocation
-- (SEC-010), the full RLS matrix, handle/metadata triggers (SEC-026), the
-- realtime publication (SEC-024), and trigger-function hygiene (SEC-016).
-- Run AFTER 10_invariants.sql + concurrency scenarios + verify_concurrency.sql.
--
-- Simulated JWTs: auth.uid()/auth.role() read the request.jwt.claims GUC (shim.sql),
-- so each scenario sets claims and `set role` the way PostgREST would.

\set ON_ERROR_STOP on

-- ==============================================================================
-- Setup: mirror Supabase default table privileges.
-- The plain-postgres harness lacks Supabase's ALTER DEFAULT PRIVILEGES, so read
-- access and the default-equivalent write grants (which RLS must then deny)
-- are granted explicitly here. The revokes from 003/016/018 on users/projects/
-- messages are intentionally NOT widened.
-- ==============================================================================
grant select on all tables in schema public to anon, authenticated;
grant insert, update on public.reports to authenticated;
grant update on public.purchase_quotes to authenticated;
  grant update, delete on public.messages to authenticated;
  -- 020 revoked client INSERT on messages (SEC-012); the shim has no Supabase
  -- default privileges, so the server-authoritative role gets its grant here.
  grant insert on public.messages to service_role;
grant insert on public.reactions to authenticated;
grant delete on public.board_events to authenticated;

-- ==============================================================================
-- A. Reaction identity binding (SEC-004)
-- ==============================================================================
do $$
declare
  v_fire int;
  v_owner_clout int;
begin
  -- A1: authenticated user A cannot act as user B
  perform set_config('request.jwt.claims',
    json_build_object('sub', uuid_for(1)::text, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
  begin
    perform public.add_project_reaction_auth(uuid_for(257), uuid_for(2), 'fire');
    raise exception 'A1 FAIL: A reacted as B';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- A2: authenticated user A acts as themselves -> success
  execute 'set role authenticated';
  begin
    if (public.add_project_reaction_auth(uuid_for(257), uuid_for(1), 'fire') ->> 'success') <> 'true' then
      raise exception 'A2 FAIL: self reaction rejected';
    end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', false);
  perform t_assert(
    (select count(*) from reactions
      where project_id = uuid_for(257) and user_id = uuid_for(1) and reaction_type = 'fire') = 1,
    'A2 reaction row recorded for the acting user');
  perform t_assert(
    (select reactions_fire from projects where id = uuid_for(257)) > 0,
    'A2 project counter incremented');

  -- A3: null identity is never accepted (would bypass the unique constraint)
  perform set_config('request.jwt.claims',
    json_build_object('sub', uuid_for(1)::text, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
  begin
    perform public.add_project_reaction_auth(uuid_for(257), null, 'fire');
    raise exception 'A3 FAIL: null identity accepted';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', false);

  -- A4: service_role (verified server routes) may act on behalf of a user
  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
  execute 'set role service_role';
  begin
    if (public.add_project_reaction_auth(uuid_for(257), uuid_for(2), 'fire') ->> 'success') <> 'true' then
      raise exception 'A4 FAIL: service_role could not act on behalf of a user';
    end if;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', false);

  -- Cleanup: remove both reactions and restore counters
  delete from reactions
    where project_id = uuid_for(257) and reaction_type = 'fire'
      and user_id in (uuid_for(1), uuid_for(2));
  update projects set reactions_fire = greatest(0, reactions_fire - 2) where id = uuid_for(257);
  update users set total_reactions_received = greatest(0, total_reactions_received - 2) where id = uuid_for(1);

  -- A5: legacy identity-forgeable RPCs are gone
  perform t_assert(
    to_regprocedure('public.add_project_reaction(uuid,text,text)') is null and
    to_regprocedure('public.remove_project_reaction(uuid,text,text)') is null and
    to_regprocedure('public.add_user_reaction(uuid,text,text)') is null and
    to_regprocedure('public.remove_user_reaction(uuid,text,text)') is null,
    'A5 legacy reaction RPCs dropped');

  -- A6: anon cannot execute the auth-gated RPCs (execute grant revoked)
  execute 'set role anon';
  begin
    perform public.add_project_reaction_auth(uuid_for(257), uuid_for(1), 'fire');
    raise exception 'A6 FAIL: anon executed the reaction RPC';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'PASS: A (reaction identity binding)';
end $$;

-- ==============================================================================
-- B. Direct client write revocation (SEC-010)
-- ==============================================================================
do $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uuid_for(1)::text, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';

  -- B1: cannot update own profile row directly
  begin
    update users set display_name = 'Hacked' where id = uuid_for(1);
    raise exception 'B1 FAIL: authenticated updated users directly';
  exception when insufficient_privilege then null;
  end;

  -- B2: cannot update own project directly (even though RLS policy would allow it)
  begin
    update projects set title = 'Hacked' where id = uuid_for(257);
    raise exception 'B2 FAIL: authenticated updated projects directly';
  exception when insufficient_privilege then null;
  end;

  -- B3: cannot insert projects directly
  begin
    insert into projects (id, user_id, title, handle, image_path, destination_url, category_id)
    values (uuid_for(799), uuid_for(1), 'T', 't', 'https://i.test/x.png', 'https://t.test',
            (select id from categories order by slug limit 1));
    raise exception 'B3 FAIL: authenticated inserted a project directly';
  exception when insufficient_privilege then null;
  end;

  -- B4: cannot insert users directly
  begin
    insert into users (id, handle, display_name) values (uuid_for(3), 'ghost', 'Ghost');
    raise exception 'B4 FAIL: authenticated inserted a user directly';
  exception when insufficient_privilege then null;
  end;

  reset role;
  perform set_config('request.jwt.claims', '', false);
  perform t_assert(
    (select count(*) from users where id = uuid_for(1)) = 1 and
    (select title from projects where id = uuid_for(257)) = 'Invariant Project',
    'B no direct client writes altered data');
  raise notice 'PASS: B (direct write revocation)';
end $$;

-- ==============================================================================
-- C. RLS matrix (with Supabase-equivalent default grants from setup)
-- ==============================================================================
do $$
declare
  v int;
begin
  -- Seed rows visible only to the table owner (postgres) so denials are meaningful
  insert into admin_audit_log (admin_user_id, admin_identifier, action, target_type, target_id)
  values (uuid_for(1), 'test', 'test_action', 'system', 'global');
  insert into reports (project_id, reporter_id, reason, details)
  values (uuid_for(257), 'seed', 'spam', 'seed report details');
  insert into purchase_quotes (id, project_id, user_id, target_rank, quoted_amount_minor,
                               expected_rank, expires_at, status)
  values (uuid_for(790), uuid_for(258), uuid_for(2), 10, 1000, 10,
          now() + interval '10 minutes', 'checkout_open');
  insert into payments (id, project_id, user_id, amount_minor, new_rank)
  values (uuid_for(791), uuid_for(257), uuid_for(1), 1000, 1);
  insert into payments (id, project_id, user_id, amount_minor, new_rank)
  values (uuid_for(792), uuid_for(258), uuid_for(2), 1000, 1);
  insert into board_events (event_sequence, project_id, project_title_snapshot,
                            project_handle_snapshot, previous_rank, new_rank, event_type)
  values (900001, uuid_for(257), 'Invariant Project', 'invariant_project', 1, 2, 'bumped');

  select count(*) into v from payment_events;
  perform t_assert(v > 0, 'C0 harness has payment_events rows (post-concurrency)');

  -- C1: anon sees zero payment events (idempotency ledger is service-only)
  execute 'set role anon';
  select count(*) into v from payment_events;
  reset role;
  perform t_assert(v = 0, 'C1 anon sees no payment_events rows');

  -- C2: authenticated sees no admin audit log
  perform set_config('request.jwt.claims',
    json_build_object('sub', uuid_for(1)::text, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
  select count(*) into v from admin_audit_log;
  reset role;
  perform t_assert(v = 0, 'C2 authenticated sees no admin_audit_log rows');

  -- C3: authenticated sees no moderation reports
  execute 'set role authenticated';
  select count(*) into v from reports;
  reset role;
  perform t_assert(v = 0, 'C3 authenticated sees no reports rows');

  -- C4: authenticated cannot insert reports directly (RLS default deny)
  execute 'set role authenticated';
  begin
    insert into reports (project_id, reason, details)
    values (uuid_for(257), 'spam', 'direct insert attempt');
    raise exception 'C4 FAIL: authenticated inserted a report directly';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- C5: authenticated cannot insert reactions directly (must go through the bound RPC)
  execute 'set role authenticated';
  begin
    insert into reactions (project_id, user_id, reaction_type)
    values (uuid_for(257), uuid_for(1), 'fire');
    raise exception 'C5 FAIL: authenticated inserted a reaction directly';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- C6: no UPDATE policy on purchase_quotes -> statement affects 0 rows
  -- (RLS filters unmatched rows silently; only INSERT/privilege denials raise 42501)
  execute 'set role authenticated';
  update purchase_quotes set quoted_amount_minor = 999 where id = uuid_for(769);
  get diagnostics v = row_count;
  reset role;
  perform t_assert(v = 0, 'C6 authenticated quote update affected 0 rows (RLS)');
  perform t_assert(
    (select quoted_amount_minor from purchase_quotes where id = uuid_for(769)) = 1000,
    'C6 quote commercial terms untouched');

  -- C7: purchases killswitch has no DB table to flip (013 moved it to the
  -- PURCHASES_PAUSED edge env var) — nothing to update, nothing to test here.

  -- C8: project visibility: own inactive project yes, someone else project no
  execute 'set role authenticated';
  select count(*) into v from projects where id = uuid_for(257); -- own, inactive
  perform t_assert(v = 1, 'C8a owner sees own inactive project');
  select count(*) into v from projects where id = uuid_for(258); -- other user project
  perform t_assert(v = 0, 'C8b non-owner does not see another project');
  reset role;

  -- C9: quotes: own rows only
  execute 'set role authenticated';
  select count(*) into v from purchase_quotes where id = uuid_for(769); -- user 1 quote
  perform t_assert(v = 1, 'C9a user sees own quote');
  select count(*) into v from purchase_quotes where id = uuid_for(790); -- user 2 quote
  perform t_assert(v = 0, 'C9b user does not see another quote');
  reset role;

  -- C10: payments: own rows only
  execute 'set role authenticated';
  select count(*) into v from payments where id = uuid_for(791);
  perform t_assert(v = 1, 'C10a user sees own payment');
  select count(*) into v from payments where id = uuid_for(792);
  perform t_assert(v = 0, 'C10b user does not see another payment');
  reset role;

  -- C11: message identity spoofing: author columns are not client-writable
  execute 'set role authenticated';
  begin
    insert into messages (user_id, author_name, text)
    values (uuid_for(1), 'BumpOne Official', 'spoof attempt');
    raise exception 'C11 FAIL: authenticated set author_name directly';
  exception when insufficient_privilege then null;
  end;

  -- C12: SEC-012 (migration 020): direct client INSERTs are revoked entirely —
  -- messages may only traverse /api/war-room/messages (service_role), where
  -- identity, length, and rate limits are enforced server-side.
  begin
    insert into messages (user_id, text) values (uuid_for(1), 'hello war room');
    raise exception 'C12 FAIL: authenticated inserted a message directly (SEC-012)';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- server-authoritative path: service_role (the API route's role) can insert;
  -- the trigger derives author columns and forces is_official = false
  perform set_config('request.jwt.claims', '{"role":"service_role"}', false);
  execute 'set role service_role';
  insert into messages (user_id, text) values (uuid_for(1), 'hello war room');
  reset role;
  perform set_config('request.jwt.claims', '', false);
  perform t_assert(
    (select count(*) from messages
      where user_id = uuid_for(1) and text = 'hello war room'
        and is_official = false
        and author_name = (select display_name from users where id = uuid_for(1))) = 1,
    'C12 service_role message author populated, is_official false');

  -- authenticated still cannot edit (no UPDATE policy on messages)
  execute 'set role authenticated';
  begin
    update messages set text = 'edited' where user_id = uuid_for(1) and text = 'hello war room';
    get diagnostics v = row_count;
    perform t_assert(v = 0, 'C12b message edit affected 0 rows (RLS)');
  exception when insufficient_privilege then null; -- column-grant denial is also a pass
  end;
  reset role;
  perform t_assert(
    (select count(*) from messages
      where user_id = uuid_for(1) and text = 'hello war room') = 1,
    'C12b message text unchanged');

  -- C13: no DELETE policy on board_events -> statement affects 0 rows
  execute 'set role authenticated';
  delete from board_events where project_id = uuid_for(257);
  get diagnostics v = row_count;
  reset role;
  perform t_assert(v = 0, 'C13 board_events delete affected 0 rows (RLS)');
  perform t_assert(
    (select count(*) from board_events where event_sequence = 900001) = 1,
    'C13 board event row survived');
  perform set_config('request.jwt.claims', '', false);

  -- Cleanup seeded rows
  delete from admin_audit_log where action = 'test_action';
  delete from reports where reporter_id = 'seed';
  delete from purchase_quotes where id = uuid_for(790);
  delete from payments where id in (uuid_for(791), uuid_for(792));
  delete from board_events where event_sequence = 900001;
  delete from messages where user_id = uuid_for(1) and text = 'hello war room';

  raise notice 'PASS: C (RLS matrix)';
end $$;

-- ==============================================================================
-- D. Handle rules: format, 30-day cooldown, server-authoritative stamp (SEC-026)
-- ==============================================================================
do $$
begin
  -- D1: invalid handle format rejected
  begin
    update users set handle = 'Bad Handle!' where id = uuid_for(1);
    raise exception 'D1 FAIL: invalid handle accepted';
  exception when check_violation then null;
  end;

  -- D2: first handle change succeeds and stamps the cooldown
  update users set handle = 'invuser_changed' where id = uuid_for(1);
  perform t_assert(
    (select handle_last_changed_at from users where id = uuid_for(1)) is not null,
    'D2 handle change stamped handle_last_changed_at');

  -- D3: immediate second change blocked by the 30-day cooldown
  begin
    update users set handle = 'invuser_again' where id = uuid_for(1);
    raise exception 'D3 FAIL: cooldown not enforced';
  exception when object_not_in_prerequisite_state then null;
  end;

  -- D4: backdate (owner test bypass), then a change succeeds and re-stamps
  alter table users disable trigger trg_enforce_user_profile_fields;
  update users set handle_last_changed_at = now() - interval '31 days' where id = uuid_for(1);
  alter table users enable trigger trg_enforce_user_profile_fields;
  update users set handle = 'invuser_expired' where id = uuid_for(1);
  perform t_assert(
    (select handle_last_changed_at from users where id = uuid_for(1)) > now() - interval '1 minute',
    'D4 expired cooldown allows change and re-stamps');

  -- D5: direct tampering with the stamp (handle unchanged) is reverted
  update users set handle_last_changed_at = null where id = uuid_for(1);
  perform t_assert(
    (select handle_last_changed_at from users where id = uuid_for(1)) is not null,
    'D5 stamp tampering reverted');

  -- D6: non-https website rejected; https allowed; legacy value survives unrelated edits
  begin
    update users set website = 'javascript:alert(1)' where id = uuid_for(1);
    raise exception 'D6 FAIL: javascript: website accepted';
  exception when check_violation then null;
  end;
  update users set website = 'https://ok.test' where id = uuid_for(1);
  alter table users disable trigger trg_enforce_user_profile_fields;
  update users set website = 'http://legacy.test' where id = uuid_for(1);
  alter table users enable trigger trg_enforce_user_profile_fields;
  update users set bio = 'edited bio' where id = uuid_for(1); -- legacy value untouched -> allowed
  perform t_assert(
    (select website from users where id = uuid_for(1)) = 'http://legacy.test',
    'D6 legacy stored website survives unrelated edits');

  raise notice 'PASS: D (handle rules)';
end $$;

-- ==============================================================================
-- E. Project metadata triggers (SEC-010 write half / SEC-001)
-- ==============================================================================
do $$
begin
  -- E1: destination_url must be https when changed
  begin
    update projects set destination_url = 'javascript:alert(1)' where id = uuid_for(257);
    raise exception 'E1a FAIL: javascript: destination accepted';
  exception when check_violation then null;
  end;
  begin
    update projects set destination_url = 'http://insecure.test' where id = uuid_for(257);
    raise exception 'E1b FAIL: http destination accepted';
  exception when check_violation then null;
  end;
  update projects set destination_url = 'https://ok.test' where id = uuid_for(257);

  -- E2: image_path scheme allowlist
  begin
    update projects set image_path = 'javascript:alert(1)' where id = uuid_for(257);
    raise exception 'E2a FAIL: javascript: image accepted';
  exception when check_violation then null;
  end;
  update projects set image_path = 'data:image/png;base64,QUFB' where id = uuid_for(257);

  -- E3: title length enforced on change
  begin
    update projects set title = repeat('x', 101) where id = uuid_for(257);
    raise exception 'E3 FAIL: 101-char title accepted';
  exception when check_violation then null;
  end;
  update projects set title = 'Invariant Project Renamed' where id = uuid_for(257);

  -- E4: project handle format enforced on change
  begin
    update projects set handle = 'Bad Handle!' where id = uuid_for(257);
    raise exception 'E4 FAIL: invalid project handle accepted';
  exception when check_violation then null;
  end;

  perform t_assert(true, 'E project metadata triggers enforced');
  raise notice 'PASS: E (project metadata)';
end $$;

-- ==============================================================================
-- F. Realtime publication (SEC-024)
-- ==============================================================================
select t_assert(
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'users') = 0,
  'F1 users removed from the realtime publication');
select t_assert(
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'projects') = 1,
  'F2 projects remain published for the public board');

-- ==============================================================================
-- G. Trigger-function hygiene (SEC-016)
-- ==============================================================================
select t_assert(
  (select coalesce(array_to_string(proconfig, ','), '') from pg_proc where proname = 'handle_new_user')
    like '%search_path=public, pg_temp%',
  'G1a handle_new_user search_path pinned');
select t_assert(
  (select coalesce(array_to_string(proconfig, ','), '') from pg_proc where proname = 'populate_message_author')
    like '%search_path=public, pg_temp%',
  'G1b populate_message_author search_path pinned');
select t_assert(
  not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute') and
  not has_function_privilege('authenticated', 'public.populate_message_author()', 'execute') and
  not has_function_privilege('authenticated', 'public.set_updated_at()', 'execute') and
  not has_function_privilege('authenticated', 'public.protect_project_authoritative_fields()', 'execute') and
  not has_function_privilege('authenticated', 'public.enforce_user_profile_fields()', 'execute') and
  not has_function_privilege('authenticated', 'public.enforce_project_metadata_fields()', 'execute'),
  'G2 trigger functions not client-executable');
select t_assert(
  has_function_privilege('service_role', 'public.enforce_user_profile_fields()', 'execute') and
  has_function_privilege('service_role', 'public.enforce_project_metadata_fields()', 'execute') and
  has_function_privilege('service_role', 'public.set_updated_at()', 'execute'),
  'G3 service_role retains trigger-function execute');

select t_assert(
  (select count(*) from users where id = uuid_for(1) and handle = 'invuser_expired') = 1,
  'FINAL fixture identity intact');
