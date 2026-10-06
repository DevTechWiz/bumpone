-- 13_moderation.sql
-- SEC-018 moderation lifecycle assertions (runs after the financial,
-- concurrency, authorization, and system_state suites).
-- Invariants:
--   M1  A verified payment NEVER grants approval: pending stays pending,
--       stays inactive, holds no board rank, emits no public board events,
--       yet receives full financial + idempotency ledger coverage.
--   M2  An approved project's payment behaves exactly like the 017 baseline:
--       stays approved, activates, journaled on the public board, ranking
--       stays canonical.
--   M3  Suspended/rejected projects cannot receive credit at all and their
--       quotes are not consumed by the refused attempt.
--   M0  The moderation_status column default (021) is 'pending' — the schema
--       itself never lets a new project skip moderation.

\set ON_ERROR_STOP on

-- ==============================================================================
-- M0: deployed column default (021)
-- ==============================================================================
select t_assert(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'projects'
      and column_name = 'moderation_status') like '%pending%',
  'M0 moderation_status column default is pending');

-- ==============================================================================
-- Fixtures: distinct namespace 901..904 (projects), 911..914 (quotes)
-- ==============================================================================
do $$
declare
  v_cat uuid;
begin
  select id into v_cat from categories order by slug limit 1;

  -- M1: pending project (payment must not approve it)
  insert into projects (id, user_id, title, handle, image_path, destination_url, category_id, is_active, moderation_status)
  values (uuid_for(901), uuid_for(1), 'Pending Paid', 'pending_paid', 'https://img.test/m1.png', 'https://m1.test', v_cat, false, 'pending')
  on conflict (id) do nothing;
  insert into purchase_quotes (id, project_id, user_id, target_rank, quoted_amount_minor, expected_rank, expires_at, status)
  values (uuid_for(911), uuid_for(901), uuid_for(1), 1, 1000, 1, now() + interval '1 hour', 'checkout_open')
  on conflict (id) do nothing;

  -- M2: approved-but-inactive project (normal credited path)
  insert into projects (id, user_id, title, handle, image_path, destination_url, category_id, is_active, moderation_status)
  values (uuid_for(902), uuid_for(1), 'Approved Credit', 'approved_credit', 'https://img.test/m2.png', 'https://m2.test', v_cat, false, 'approved')
  on conflict (id) do nothing;
  insert into purchase_quotes (id, project_id, user_id, target_rank, quoted_amount_minor, expected_rank, expires_at, status)
  values (uuid_for(912), uuid_for(902), uuid_for(1), 1, 1000, 1, now() + interval '1 hour', 'checkout_open')
  on conflict (id) do nothing;

  -- M3a: rejected project (credit must be refused)
  insert into projects (id, user_id, title, handle, image_path, destination_url, category_id, is_active, moderation_status)
  values (uuid_for(903), uuid_for(1), 'Rejected Rig', 'rejected_rig', 'https://img.test/m3.png', 'https://m3.test', v_cat, false, 'rejected')
  on conflict (id) do nothing;
  insert into purchase_quotes (id, project_id, user_id, target_rank, quoted_amount_minor, expected_rank, expires_at, status)
  values (uuid_for(913), uuid_for(903), uuid_for(1), 1, 1000, 1, now() + interval '1 hour', 'checkout_open')
  on conflict (id) do nothing;

  -- M3b: suspended project (credit must be refused)
  insert into projects (id, user_id, title, handle, image_path, destination_url, category_id, is_active, moderation_status)
  values (uuid_for(904), uuid_for(1), 'Suspended Slot', 'suspended_slot', 'https://img.test/m4.png', 'https://m4.test', v_cat, false, 'suspended')
  on conflict (id) do nothing;
  insert into purchase_quotes (id, project_id, user_id, target_rank, quoted_amount_minor, expected_rank, expires_at, status)
  values (uuid_for(914), uuid_for(904), uuid_for(1), 1, 1000, 1, now() + interval '1 hour', 'checkout_open')
  on conflict (id) do nothing;
end $$;

-- ==============================================================================
-- M1. Payment on a PENDING project (SEC-018 core)
-- ==============================================================================
select t_assert(
  (select public.process_dodo_purchase('m1_evt', 'm1_pay', 1000,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(911))),
     null, uuid_for(911)) ->> 'status') = 'success',
  'M1a pending project accepts the payment credit');
select t_assert(
  (select moderation_status from projects where id = uuid_for(901)) = 'pending',
  'M1b payment never grants approval');
select t_assert(
  (select is_active from projects where id = uuid_for(901)) = false,
  'M1c pending project stays inactive after payment');
select t_assert(
  (select current_rank from projects where id = uuid_for(901)) is null,
  'M1d pending project holds no board rank');
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(901)) = 1000
  and (select total_paid_minor from projects where id = uuid_for(901)) = 1000,
  'M1e pending project receives financial value');
select t_assert(
  (select count(*) from payments where quote_id = uuid_for(911)) = 1,
  'M1f pending payment recorded in the payments ledger');
select t_assert(
  (select count(*) from payment_events where provider = 'dodo' and provider_event_id = 'm1_evt') = 1,
  'M1g pending payment recorded in the idempotency ledger');
select t_assert(
  (select count(*) from board_events where project_id = uuid_for(901)) = 0,
  'M1h pending payment emits no public board events');
select t_assert(
  (select public.process_dodo_purchase('m1_evt', 'm1_pay', 1000,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(911))),
     null, uuid_for(911)) ->> 'status') = 'already_processed',
  'M1i pending payment delivery is idempotent');
select t_assert(t_ranking_canonical(), 'M1j board stays canonical after pending credit');

-- ==============================================================================
-- M2. Payment on an APPROVED project (017 baseline behavior preserved)
-- ==============================================================================
select t_assert(
  (select public.process_dodo_purchase('m2_evt', 'm2_pay', 1000,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(912))),
     null, uuid_for(912)) ->> 'status') = 'success',
  'M2a approved project accepts the payment credit');
select t_assert(
  (select moderation_status from projects where id = uuid_for(902)) = 'approved',
  'M2b approved project stays approved');
select t_assert(
  (select is_active from projects where id = uuid_for(902)) = true,
  'M2c approved project is activated by payment');
select t_assert(
  (select count(*) from board_events where project_id = uuid_for(902)) >= 1,
  'M2d approved payment journaled on the public board');
select t_assert(
  (select count(*) from payments where quote_id = uuid_for(912)) = 1,
  'M2e approved payment recorded in the payments ledger');
select t_assert(t_ranking_canonical(), 'M2f board stays canonical after approved credit');

-- ==============================================================================
-- M3. Suspended/rejected projects cannot receive credit
-- ==============================================================================
select t_assert(
  (select public.process_dodo_purchase('m3a_evt', 'm3a_pay', 1000,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(913))),
     null, uuid_for(913)) ->> 'status') = 'error',
  'M3a rejected project refuses payment credit');
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(903)) = 0
  and (select count(*) from payments where quote_id = uuid_for(913)) = 0,
  'M3b rejected refusal credits nothing');
select t_assert(
  (select status from purchase_quotes where id = uuid_for(913)) = 'checkout_open',
  'M3c rejected refusal does not consume the quote');

select t_assert(
  (select public.process_dodo_purchase('m3b_evt', 'm3b_pay', 1000,
     jsonb_build_object('metadata', jsonb_build_object('quote_id', uuid_for(914))),
     null, uuid_for(914)) ->> 'status') = 'error',
  'M3d suspended project refuses payment credit');
select t_assert(
  (select current_active_value_minor from projects where id = uuid_for(904)) = 0
  and (select count(*) from payments where quote_id = uuid_for(914)) = 0,
  'M3e suspended refusal credits nothing');
select t_assert(
  (select status from purchase_quotes where id = uuid_for(914)) = 'checkout_open',
  'M3f suspended refusal does not consume the quote');

select t_assert(t_ranking_canonical(), 'M3g board stays canonical after refusals');
