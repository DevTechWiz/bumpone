-- verify_concurrency.sql
-- Financial/ranking invariant verification after all concurrent scenarios.
-- Expected worker outcomes (from db_test_results):
--   dup_event   10 workers, ONE shared event id  -> 1 success, 9 already_processed
--   same_quote  10 workers, shared quote, distinct events -> 1 success, 9 quote-reuse errors
--   distinct    10 workers, distinct quotes/projects -> 10 success (no false rejection)
--   double_tap   2 workers, distinct quotes, SAME project -> 2 success (value exactly 2000+3000)
--   bulk       100 workers, distinct quotes/projects -> 100 success (no false rejection)
\set ON_ERROR_STOP on

-- ==============================================================================
-- A. Duplicate delivery of a single webhook event (idempotency under race)
-- ==============================================================================
select t_assert(
  (select count(*) from db_test_results where scenario = 'dup_event') = 10,
  'A all ten duplicate workers reported a result');
select t_assert(
  (select count(*) from db_test_results where scenario = 'dup_event' and status = 'success') = 1,
  'A exactly one success among 10 concurrent duplicate deliveries');
select t_assert(
  (select count(*) from db_test_results where scenario = 'dup_event' and status = 'already_processed') = 9,
  'A nine replays answered already_processed (no double credit)');
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(261)) = 1000
  and (select total_paid_minor from projects where id = uuid_for(261)) = 1000,
  'A project credited exactly once (+1000) despite 10 concurrent deliveries');
select t_assert(
  (select count(*) from payments where quote_id = uuid_for(784)) = 1,
  'A exactly one payment row for the duplicated event');
select t_assert(
  (select count(*) from payment_events where provider_event_id = 'evt_dup_event') = 1,
  'A exactly one idempotency-ledger row for the duplicated event');
select t_assert(
  (select status from purchase_quotes where id = uuid_for(784)) = 'paid',
  'A quote consumed exactly once');

-- ==============================================================================
-- B. Ten distinct events racing for ONE quote (quote double-spend attempt)
-- ==============================================================================
select t_assert(
  (select count(*) from db_test_results where scenario = 'same_quote') = 10,
  'B all ten same-quote workers reported a result');
select t_assert(
  (select count(*) from db_test_results where scenario = 'same_quote' and status = 'success') = 1,
  'B exactly one success for the shared quote');
select t_assert(
  (select count(*) from db_test_results
   where scenario = 'same_quote' and status like 'error - Quote already used%') = 9,
  'B nine quote double-spend attempts rejected');
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(262)) = 1000
  and (select total_paid_minor from projects where id = uuid_for(262)) = 1000,
  'B shared quote credits exactly once');
select t_assert(
  (select count(*) from payments where quote_id = uuid_for(785)) = 1,
  'B exactly one payment row for the shared quote');

-- ==============================================================================
-- C. Ten distinct legitimate concurrent purchases (business rule: none rejected)
-- ==============================================================================
select t_assert(
  (select count(*) from db_test_results where scenario = 'distinct') = 10,
  'C all ten distinct workers reported a result');
select t_assert(
  (select count(*) from db_test_results where scenario = 'distinct' and status = 'success') = 10,
  'C all ten distinct legitimate purchases succeeded (race rejected none)');
do $$
declare
  i int;
  v bigint;
  ok boolean := true;
begin
  for i in 0..9 loop
    select current_active_value_minor into v from projects where id = uuid_for(300 + i);
    if v is distinct from 20000 then
      ok := false;
    end if;
  end loop;
  perform t_assert(ok, 'C every distinct project credited exactly once (+20000)');
end $$;
select t_assert(
  (select count(*) from payments where quote_id between uuid_for(320) and uuid_for(329)) = 10,
  'C exactly ten payment rows');
select t_assert(
  (select count(*) from purchase_quotes where id between uuid_for(320) and uuid_for(329)
     and status = 'paid') = 10,
  'C all ten quotes paid exactly once');

-- ==============================================================================
-- D. Two purchases, one project, simultaneous (double-tap)
-- ==============================================================================
select t_assert(
  (select count(*) from db_test_results where scenario = 'double_tap') = 2,
  'D both double-tap workers reported a result');
select t_assert(
  (select count(*) from db_test_results where scenario = 'double_tap' and status = 'success') = 2,
  'D both legitimate same-project purchases succeeded (race rejected none)');
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(400)) = 5000,
  'D final Active Value exactly 2000+3000 (order-independent)');
select t_assert(
  (select total_paid_minor from projects where id = uuid_for(400)) = 5000,
  'D total_paid exactly 5000');
select t_assert(
  (select count(*) from payments where project_id = uuid_for(400)) = 2,
  'D exactly two payment rows');
select t_assert(
  (select count(*) from purchase_quotes where id in (uuid_for(786), uuid_for(787)) and status = 'paid') = 2,
  'D both quotes consumed exactly once each');

-- ==============================================================================
-- E. Bulk: 100 distinct legitimate concurrent purchases
-- ==============================================================================
select t_assert(
  (select count(*) from db_test_results where scenario = 'bulk') = 100,
  'E all hundred bulk workers reported a result');
select t_assert(
  (select count(*) from db_test_results where scenario = 'bulk' and status = 'success') = 100,
  'E all 100 concurrent legitimate purchases succeeded (race rejected none)');
do $$
declare
  i int;
  v bigint;
  ok boolean := true;
begin
  for i in 0..99 loop
    select current_active_value_minor into v from projects where id = uuid_for(500 + i);
    if v is distinct from 15000 then
      ok := false;
    end if;
  end loop;
  perform t_assert(ok, 'E every bulk project credited exactly once (+15000)');
end $$;
select t_assert(
  (select count(*) from payments where quote_id between uuid_for(600) and uuid_for(699)) = 100,
  'E exactly one hundred payment rows');

-- ==============================================================================
-- Global ledger + ranking invariants across the whole suite
-- ==============================================================================
-- 3 sequential legit payments from 10_invariants + 114 concurrent successes
select t_assert(
  (select count(*) from payments where status = 'paid') = 117,
  'GLOBAL exactly 117 payment rows (3 sequential + 114 concurrent successes)');
select t_assert(
  (select count(*) from payment_events) = 117,
  'GLOBAL exactly 117 processed webhook events (one per credited payment)');
select t_assert(
  (select count(*) from payments) = (select count(*) from payment_events),
  'GLOBAL payment ledger and idempotency ledger stay 1:1');
select t_assert(t_ranking_canonical(), 'GLOBAL ranking is canonical after all concurrency');
select t_assert(
  (select count(*) from projects where current_rank is not null and is_active) <= 100,
  'GLOBAL at most 100 ranked active projects');
