-- seed.sql
-- Test fixtures for the financial-boundary invariant + concurrency suites.
-- All fixture ids live in the 00000000-0000-4000-8000-xxxxxxxxxxxx namespace so
-- worker scripts can compute them deterministically:
--   uuid_for(n) = '00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0')
--   projects:  0x101..0x1ff (invariants), 300..309 (distinct-concurrency),
--              400..400 (two-same-project), 500..599 (bulk-100)
--   quotes:    0x301..0x306 (invariants), 320..329, 401..402, 600..699
--   users:     0x001 (U_INV), 0x002 (U_OTH)

create or replace function uuid_for(n int)
returns uuid
language sql
immutable
as $$
  select ('00000000-0000-4000-8000-' || lpad(to_hex(n), 12, '0'))::uuid
$$;

create or replace function t_assert(cond boolean, msg text)
returns void
language plpgsql
as $$
begin
  if cond is distinct from true then
    raise exception 'ASSERT FAILED: %', msg;
  end if;
  raise notice 'PASS: %', msg;
end;
$$;

-- Ranking is canonical iff every active approved project's materialized current_rank
-- equals its true row_number (value DESC, sequence ASC) when <= 100, and is NULL beyond.
create or replace function t_ranking_canonical()
returns boolean
language sql
stable
as $$
  select not exists (
    select 1
    from (
      select
        current_rank,
        row_number() over (
          order by current_active_value_minor desc, ranking_sequence asc
        ) as rn
      from projects
      where is_active = true and moderation_status = 'approved'
    ) t
    where (t.rn <= 100 and t.current_rank is distinct from t.rn)
       or (t.rn > 100 and t.current_rank is not null)
  );
$$;

create table if not exists db_test_results (
  scenario text not null,
  worker int not null,
  status text not null
);

-- ---------------------------------------------------------------- fixtures

-- Users (public.users rows are auto-provisioned by the on_auth_user_created trigger)
insert into auth.users (id, email, raw_user_meta_data) values
  (uuid_for(1), 'inv@bumpone.test', '{"user_name":"invuser","full_name":"Invariant User"}'),
  (uuid_for(2), 'oth@bumpone.test', '{"user_name":"othuser","full_name":"Other User"}')
on conflict (id) do nothing;

do $$
declare
  v_cat uuid;
begin
  select id into v_cat from categories order by slug limit 1;

  -- Invariant-scope projects (inactive until credited)
  insert into projects (id, user_id, title, handle, image_path, destination_url, category_id, is_active, moderation_status) values
    (uuid_for(257), uuid_for(1), 'Invariant Project', 'invariant_project', 'https://img.test/inv.png', 'https://inv.test', v_cat, false, 'approved'),
    (uuid_for(258), uuid_for(2), 'Other Project',     'other_project',     'https://img.test/oth.png', 'https://oth.test', v_cat, false, 'approved'),
    (uuid_for(259), uuid_for(2), 'Owned By Other',    'owned_by_other',    'https://img.test/o2.png',  'https://o2.test',  v_cat, false, 'approved'),
    (uuid_for(260), uuid_for(1), 'Service Role Proj', 'service_role_proj', 'https://img.test/sr.png',  'https://sr.test',  v_cat, false, 'approved')
  on conflict (id) do nothing;

  -- Concurrency: distinct-projects stream (10)
  for i in 0..9 loop
    insert into projects (id, user_id, title, handle, image_path, destination_url, category_id, is_active, moderation_status)
    values (uuid_for(300 + i), uuid_for(1), 'Concurrent ' || i, 'concurrent_proj_' || i,
            'https://img.test/c.png', 'https://c.test', v_cat, false, 'approved')
    on conflict (id) do nothing;
  end loop;

  -- Concurrency: two purchases, one project + single-quote replay targets
  insert into projects (id, user_id, title, handle, image_path, destination_url, category_id, is_active, moderation_status)
  values
    (uuid_for(400), uuid_for(1), 'Double Tap', 'double_tap_proj', 'https://img.test/d.png', 'https://d.test', v_cat, false, 'approved'),
    (uuid_for(261), uuid_for(1), 'Dup Target',   'dup_target_proj',   'https://img.test/x.png', 'https://x.test', v_cat, false, 'approved'),
    (uuid_for(262), uuid_for(1), 'Same Q Target','same_q_target_proj','https://img.test/y.png', 'https://y.test', v_cat, false, 'approved')
  on conflict (id) do nothing;

  -- Concurrency: bulk-100 stream
  for i in 0..99 loop
    insert into projects (id, user_id, title, handle, image_path, destination_url, category_id, is_active, moderation_status)
    values (uuid_for(500 + i), uuid_for(1), 'Bulk ' || i, 'bulk_proj_' || i,
            'https://img.test/b.png', 'https://b.test', v_cat, false, 'approved')
    on conflict (id) do nothing;
  end loop;

  -- Invariant quotes (all on P_INV = uuid_for(257) unless noted)
  insert into purchase_quotes (id, project_id, user_id, target_rank, quoted_amount_minor, expected_rank, expires_at, status) values
    (uuid_for(769), uuid_for(257), uuid_for(1), 1, 1000, 1, now() + interval '10 minutes', 'checkout_open'), -- Q_OK
    (uuid_for(770), uuid_for(257), uuid_for(1), 1, 1000, 1, now() + interval '10 minutes', 'checkout_open'), -- Q_PRICE
    (uuid_for(771), uuid_for(257), uuid_for(1), 1, 1000, 1, now() - interval '1 minute',  'checkout_open'), -- Q_EXPIRED
    (uuid_for(772), uuid_for(257), uuid_for(1), 1, 1000, 1, now() + interval '10 minutes', 'checkout_open'), -- Q_WRONGPROJ
    (uuid_for(773), uuid_for(259), uuid_for(1), 1, 1000, 1, now() + interval '10 minutes', 'checkout_open'), -- Q_OWNER (project owned by U_OTH)
    (uuid_for(774), uuid_for(260), uuid_for(1), 1, 1000, 1, now() + interval '10 minutes', 'checkout_open'), -- Q_SVC
    (uuid_for(775), uuid_for(257), uuid_for(1), 1, 1000, 1, now() + interval '10 minutes', 'checkout_open')  -- Q_MISC (state-machine tests)
  on conflict (id) do nothing;

  -- Concurrency quotes
  insert into purchase_quotes (id, project_id, user_id, target_rank, quoted_amount_minor, expected_rank, expires_at, status) values
    (uuid_for(784), uuid_for(261), uuid_for(1), 1, 1000, 1, now() + interval '10 minutes', 'checkout_open'), -- Q_DUP   (project 0x105)
    (uuid_for(785), uuid_for(262), uuid_for(1), 1, 1000, 1, now() + interval '10 minutes', 'checkout_open'), -- Q_SAME  (project 0x106)
    (uuid_for(786), uuid_for(400), uuid_for(1), 1, 2000, 1, now() + interval '10 minutes', 'checkout_open'), -- Q_D2A
    (uuid_for(787), uuid_for(400), uuid_for(1), 1, 3000, 1, now() + interval '10 minutes', 'checkout_open')  -- Q_D2B
  on conflict (id) do nothing;

  -- distinct-concurrency quotes (320..329 on projects 300..309), $200 each
  for i in 0..9 loop
    insert into purchase_quotes (id, project_id, user_id, target_rank, quoted_amount_minor, expected_rank, expires_at, status)
    values (uuid_for(320 + i), uuid_for(300 + i), uuid_for(1), 50, 20000, 50, now() + interval '10 minutes', 'checkout_open')
    on conflict (id) do nothing;
  end loop;

  -- bulk quotes (600..699 on projects 500..599), $150 each
  for i in 0..99 loop
    insert into purchase_quotes (id, project_id, user_id, target_rank, quoted_amount_minor, expected_rank, expires_at, status)
    values (uuid_for(600 + i), uuid_for(500 + i), uuid_for(1), 50, 15000, 50, now() + interval '10 minutes', 'checkout_open')
    on conflict (id) do nothing;
  end loop;
end $$;
