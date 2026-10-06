-- 10_invariants.sql
-- Financial invariants for the PAYMENT -> VERIFICATION -> ACTIVE VALUE -> RANKING
-- boundary. Run with: psql -v ON_ERROR_STOP=1 -f 10_invariants.sql
-- Any failed assertion raises and aborts the script (exit != 0).

\set ON_ERROR_STOP on

-- ==============================================================================
-- F1. No payment -> no Active Value increase
-- ==============================================================================
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(257)) = 0
  and (select total_paid_minor from projects where id = uuid_for(257)) = 0,
  'F1 no payment -> no Active Value');
select t_assert((select count(*) from payments) = 0, 'F1 no rows in the payment ledger');
select t_assert(t_ranking_canonical(), 'F1 baseline ranking is canonical');

-- ==============================================================================
-- I3. Arbitrary authenticated/anon users cannot execute the money RPC
-- ==============================================================================
do $$
begin
  execute 'set role authenticated';
  begin
    perform public.process_dodo_purchase('evt_x1', 'pay_x1', 1000, '{}'::jsonb, null, null);
    raise exception 'I3a FAIL: authenticated executed the money RPC';
  exception when insufficient_privilege then null;
  end;
  reset role;

  execute 'set role anon';
  begin
    perform public.process_dodo_purchase('evt_x2', 'pay_x2', 1000, '{}'::jsonb, null, null);
    raise exception 'I3b FAIL: anon executed the money RPC';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'PASS: I3 money RPC denied to authenticated and anon';
end $$;

-- ==============================================================================
-- F8. Client-supplied price can never override the server-recorded quote
-- ==============================================================================
-- below platform floor
select t_assert(
  (select public.process_dodo_purchase('evt_price_low', 'pay_price_low', 500,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(770))),
     null, uuid_for(770)) ->> 'status') = 'error',
  'F8a amount below platform minimum rejected');
-- above the quote (overpaying is only allowed by paying through checkout for that quote)
select t_assert(
  (select public.process_dodo_purchase('evt_price_high', 'pay_price_high', 2000,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(770))),
     null, uuid_for(770)) ->> 'status') = 'error',
  'F8b amount different from the quoted amount rejected');
select t_assert(
  (select status from purchase_quotes where id = uuid_for(770)) = 'checkout_open',
  'F8 rejected attempts do not burn the quote');
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(257)) = 0,
  'F8 rejected attempts do not credit value');

-- ==============================================================================
-- F11. Quote-less crediting is impossible (SEC-003)
-- ==============================================================================
select t_assert(
  (select public.process_dodo_purchase('evt_no_quote', 'pay_no_quote', 50000,
     jsonb_build_object('metadata', jsonb_build_object('project_id', uuid_for(257))),
     uuid_for(257), null) ->> 'status') = 'error',
  'F11 quote-less webhook rejected');
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(257)) = 0,
  'F11 no credit without a quote');

-- ==============================================================================
-- F12/F13. Currency and amount validation
-- ==============================================================================
select t_assert(
  (select public.process_dodo_purchase('evt_eur', 'pay_eur', 1000,
     jsonb_build_object('currency', 'EUR', 'metadata', jsonb_build_object('quote_id', uuid_for(770))),
     null, uuid_for(770)) ->> 'status') = 'error',
  'F12 explicitly non-USD currency rejected');
select t_assert(
  (select public.process_dodo_purchase('evt_neg', 'pay_neg', -1000,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(770))),
     null, uuid_for(770)) ->> 'status') = 'error',
  'F13a negative amount rejected');
select t_assert(
  (select public.process_dodo_purchase('evt_zero', 'pay_zero', 0,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(770))),
     null, uuid_for(770)) ->> 'status') = 'error',
  'F13b zero amount rejected');
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(257)) = 0,
  'F13 no credit from invalid amounts');

-- ==============================================================================
-- F7. Expired quote cannot create a payment credit, and is not consumed
-- ==============================================================================
select t_assert(
  (select public.process_dodo_purchase('evt_expired', 'pay_expired', 1000,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(771))),
     null, uuid_for(771)) ->> 'status') = 'error',
  'F7 expired quote rejected');
select t_assert(
  (select status from purchase_quotes where id = uuid_for(771)) = 'checkout_open',
  'F7 expired quote not consumed by the failed attempt');
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(257)) = 0,
  'F7 no credit from an expired quote');

-- ==============================================================================
-- F5. Wrong project metadata can never redirect the credit
-- ==============================================================================
select t_assert(
  (select public.process_dodo_purchase('evt_wp1', 'pay_wp1', 1000,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(772), 'project_id', uuid_for(258))),
     uuid_for(258), uuid_for(772)) ->> 'status') = 'error',
  'F5a quote/project mismatch via RPC parameter rejected');
select t_assert(
  (select public.process_dodo_purchase('evt_wp2', 'pay_wp2', 1000,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(772), 'project_id', uuid_for(258))),
     null, uuid_for(772)) ->> 'status') = 'error',
  'F5b quote/project mismatch via payload metadata rejected');
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(258)) = 0
  and (select current_active_value_minor from projects where id = uuid_for(257)) = 0,
  'F5 no credit to either project from wrong-project metadata');

-- ==============================================================================
-- F6. Wrong user metadata can never redirect the credit
-- ==============================================================================
select t_assert(
  (select public.process_dodo_purchase('evt_wu', 'pay_wu', 1000,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(772), 'project_id', uuid_for(257), 'user_id', uuid_for(2))),
     uuid_for(257), uuid_for(772)) ->> 'status') = 'error',
  'F6 quote/user mismatch via payload metadata rejected');
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(257)) = 0,
  'F6 no credit from wrong-user metadata');

-- ==============================================================================
-- F15. Quote user must own the project (credit the right user)
-- ==============================================================================
select t_assert(
  (select public.process_dodo_purchase('evt_own', 'pay_own', 1000,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(773))),
     null, uuid_for(773)) ->> 'status') = 'error',
  'F15 quote user must own the target project');
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(259)) = 0,
  'F15 no credit to a project the quote user does not own');

-- ==============================================================================
-- F8c + F2. The correct, server-quoted amount succeeds exactly once
-- ==============================================================================
select t_assert(
  (select public.process_dodo_purchase('evt_price_ok', 'pay_price_ok', 1000,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(770))),
     null, uuid_for(770)) ->> 'status') = 'success',
  'F8c exact quoted amount accepted (quote not burned by earlier failures)');
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(257)) = 1000,
  'F2 one payment -> exactly one Active Value increase (+1000)');
select t_assert(
  (select total_paid_minor from projects where id = uuid_for(257)) = 1000,
  'F2 total_paid_minor matches the payment');
select t_assert(
  (select count(*) from payments where quote_id = uuid_for(770)) = 1,
  'F2 exactly one payment row for the quote');
select t_assert(
  (select status from purchase_quotes where id = uuid_for(770)) = 'paid',
  'F2 quote transitions to paid');
select t_assert(t_ranking_canonical(), 'F2 ranking remains canonical after credit');

-- ==============================================================================
-- F3. Duplicate webhook -> zero additional increase
-- ==============================================================================
select t_assert(
  (select public.process_dodo_purchase('evt_price_ok', 'pay_price_ok', 1000,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(770))),
     null, uuid_for(770)) ->> 'status') = 'already_processed',
  'F3 duplicate event id -> already_processed');
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(257)) = 1000
  and (select count(*) from payments where quote_id = uuid_for(770)) = 1,
  'F3 duplicate webhook adds zero value and zero payment rows');

-- ==============================================================================
-- F4. Invalid webhook (unknown quote) -> zero increase
-- ==============================================================================
select t_assert(
  (select public.process_dodo_purchase('evt_bad_quote', 'pay_bad_quote', 1000,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(999))),
     null, uuid_for(999)) ->> 'status') = 'error',
  'F4 unknown quote rejected');
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(257)) = 1000,
  'F4 invalid webhook adds zero value');

-- ==============================================================================
-- Legit second payment, then F14/F16: paid quote / provider payment reuse
-- ==============================================================================
select t_assert(
  (select public.process_dodo_purchase('evt_ok', 'pay_ok', 1000,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(769))),
     null, uuid_for(769)) ->> 'status') = 'success',
  'F14 setup: second legit quote paid');
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(257)) = 2000,
  'F14 second payment adds exactly +1000');

select t_assert(
  (select public.process_dodo_purchase('evt_reuse', 'pay_reuse', 1000,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(769))),
     null, uuid_for(769)) ->> 'status') = 'error',
  'F14 already-paid quote cannot be paid again (new event id)');
select t_assert(
  (select public.process_dodo_purchase('evt_dup_payid', 'pay_price_ok', 1000,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(770))),
     null, uuid_for(770)) ->> 'status') = 'error',
  'F16 already-used provider payment id cannot be reused');
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(257)) = 2000
  and (select count(*) from payments where project_id = uuid_for(257)) = 2,
  'F14/F16 reuse attempts add zero value and zero payment rows');

-- ==============================================================================
-- I4. The legitimate privileged path (service_role) works
-- ==============================================================================
do $$
declare
  v_status text;
begin
  execute 'set role service_role';
  select public.process_dodo_purchase('evt_svc_1', 'pay_svc_1', 1000,
    jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(774), 'project_id', uuid_for(260), 'user_id', uuid_for(1))),
    uuid_for(260), uuid_for(774)) ->> 'status'
  into v_status;
  reset role;
  perform t_assert(v_status = 'success', 'I4 service_role (the webhook path) can execute the money RPC');
end $$;
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(260)) = 1000
  and (select count(*) from payments where quote_id = uuid_for(774)) = 1,
  'I4 service_role credit is exactly once');
select t_assert(t_ranking_canonical(), 'I4 ranking canonical after service_role credit');

-- ==============================================================================
-- I5. purchase_quotes: immutable commercial terms + forward-only state machine
-- ==============================================================================
do $$
begin
  update purchase_quotes set quoted_amount_minor = 500 where id = uuid_for(770);
  raise exception 'I5a FAIL: paid quote was re-priced';
exception when raise_exception then
  if SQLERRM not like 'Security violation%' then raise; end if;
  raise notice 'PASS: I5a quote amount is immutable';
end $$;

do $$
begin
  update purchase_quotes set project_id = uuid_for(258) where id = uuid_for(770);
  raise exception 'I5b FAIL: paid quote was re-pointed at another project';
exception when raise_exception then
  if SQLERRM not like 'Security violation%' then raise; end if;
  raise notice 'PASS: I5b quote project binding is immutable';
end $$;

do $$
begin
  update purchase_quotes set status = 'checkout_open', paid_at = null where id = uuid_for(770);
  raise exception 'I5c FAIL: paid quote was reopened';
exception when raise_exception then
  if SQLERRM not like 'Security violation%' then raise; end if;
  raise notice 'PASS: I5c paid quotes are terminal';
end $$;

-- forward transition is allowed: checkout_open -> expired
update purchase_quotes set status = 'expired' where id = uuid_for(775);
-- backward transition from expired is blocked
do $$
begin
  update purchase_quotes set status = 'checkout_open' where id = uuid_for(775);
  raise exception 'I5d FAIL: expired quote was reopened';
exception when raise_exception then
  if SQLERRM not like 'Security violation%' then raise; end if;
  raise notice 'PASS: I5d expired quotes cannot return to checkout_open';
end $$;

-- ==============================================================================
-- I6. payments ledger is immutable
-- ==============================================================================
do $$
begin
  update payments set amount_minor = 999999 where quote_id = uuid_for(770);
  raise exception 'I6a FAIL: payment amount was mutated after insert';
exception when raise_exception then
  if SQLERRM not like 'Security violation%' then raise; end if;
  raise notice 'PASS: I6a payment amount is immutable';
end $$;

do $$
begin
  update payments set project_id = uuid_for(258), new_active_value_minor = 9999999 where quote_id = uuid_for(770);
  raise exception 'I6b FAIL: payment project/value was mutated after insert';
exception when raise_exception then
  if SQLERRM not like 'Security violation%' then raise; end if;
  raise notice 'PASS: I6b payment project and credited value are immutable';
end $$;

-- ==============================================================================
-- I7. payment_events is append-only
-- ==============================================================================
do $$
begin
  update payment_events set payload = '{}'::jsonb where provider_event_id = 'evt_ok';
  raise exception 'I7 FAIL: payment_events row was updated';
exception when raise_exception then
  if SQLERRM not like 'Security violation%' then raise; end if;
  raise notice 'PASS: I7 payment_events is append-only';
end $$;

-- ==============================================================================
-- I8/I9. Ledger constraints: one payment per quote, USD-only
-- ==============================================================================
do $$
begin
  insert into payments (project_id, user_id, quote_id, provider, provider_payment_id,
                        amount_minor, currency, previous_active_value_minor, new_active_value_minor, new_rank, status)
  values (uuid_for(257), uuid_for(1), uuid_for(770), 'dodo', 'pay_sneaky_1',
          1000, 'USD', 1000, 2000, 5, 'paid');
  raise exception 'I8 FAIL: second payment row for the same quote was accepted';
exception when unique_violation then
  raise notice 'PASS: I8 at most one payment row per quote';
end $$;

do $$
begin
  insert into payments (project_id, user_id, quote_id, provider, provider_payment_id,
                        amount_minor, currency, previous_active_value_minor, new_active_value_minor, new_rank, status)
  values (uuid_for(257), uuid_for(1), null, 'dodo', 'pay_eur_row',
          1000, 'EUR', 0, 1000, 5, 'paid');
  raise exception 'I9 FAIL: non-USD payment row was accepted';
exception when check_violation then
  raise notice 'PASS: I9 payment ledger is USD-only';
end $$;

-- ==============================================================================
-- I2. Client INSERT path cannot fabricate Active Value (SEC-015)
-- ==============================================================================
do $$
declare
  v_cat uuid;
begin
  select id into v_cat from categories order by slug limit 1;

  -- (a) no insert privilege at all
  execute 'set role authenticated';
  begin
    insert into projects (id, user_id, title, handle, image_path, destination_url, category_id, current_active_value_minor)
    values ('00000000-0000-4000-8000-000000000999', uuid_for(1), 'Cheat', 'cheat_proj',
            'https://img.test/cheat.png', 'https://cheat.test', v_cat, 999999);
    raise exception 'I2a FAIL: authenticated inserted a credited project';
  exception when insufficient_privilege then
    raise notice 'PASS: I2a authenticated has no INSERT privilege on projects';
  end;
  reset role;

  -- (b) even with a grant (RLS disabled), the INSERT-path trigger blocks authoritative fields
  alter table projects disable row level security;
  grant insert on projects to authenticated;
  perform set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}', true);
  execute 'set role authenticated';

  begin
    insert into projects (id, user_id, title, handle, image_path, destination_url, category_id, current_active_value_minor)
    values ('00000000-0000-4000-8000-000000000998', uuid_for(1), 'Cheat2', 'cheat_proj_2',
            'https://img.test/cheat2.png', 'https://cheat2.test', v_cat, 999999);
    raise exception 'I2b FAIL: trigger allowed a client INSERT with credited value';
  exception when raise_exception then
    if SQLERRM not like 'Security violation%' then raise; end if;
    raise notice 'PASS: I2b INSERT trigger blocks client-authored Active Value';
  end;

  -- a plain draft insert shaped like the production one (service_role path) is allowed
  insert into projects (id, user_id, title, handle, image_path, destination_url, category_id, is_active)
  values ('00000000-0000-4000-8000-000000000997', uuid_for(1), 'Legit Draft', 'legit_draft',
          'https://img.test/ld.png', 'https://ld.test', v_cat, false);
  raise notice 'PASS: I2c INSERT trigger allows an inactive zero-value draft';

  -- defaults-only insert (is_active defaults to true) is still blocked: a client can
  -- never self-activate a project
  begin
    insert into projects (id, user_id, title, handle, image_path, destination_url, category_id)
    values ('00000000-0000-4000-8000-000000000996', uuid_for(1), 'Self Active', 'self_active',
            'https://img.test/sa.png', 'https://sa.test', v_cat);
    raise exception 'I2d FAIL: trigger allowed a client to self-activate a project';
  exception when raise_exception then
    if SQLERRM not like 'Security violation%' then raise; end if;
    raise notice 'PASS: I2d INSERT trigger blocks client self-activation';
  end;

  reset role;
  delete from projects where id = '00000000-0000-4000-8000-000000000997';
  revoke insert on projects from authenticated;
  alter table projects enable row level security;
end $$;

-- ==============================================================================
-- Final: sequential suite leaves the board canonical
-- ==============================================================================
select t_assert(t_ranking_canonical(), 'FINAL sequential invariants leave ranking canonical');
select t_assert(
  (select count(*) from payments where status = 'paid') = 3,
  'FINAL exactly 3 legit payments (price_ok, ok, svc)');
select t_assert(
  (select count(*) from payment_events) = 3,
  'FINAL exactly 3 processed webhook events');
