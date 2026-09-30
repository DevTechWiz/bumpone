-- 006_inline_reaction_counts.sql
-- Migration: Inline reaction counts directly onto projects and users tables
-- Eliminates high-overhead join queries on reaction_counts while preserving reactions event ledger
-- Adds support for Instagram-style user/creator profile reactions alongside project reactions

-- ==============================================================================
-- 1. Add reaction columns to projects table
-- ==============================================================================
alter table projects
  add column if not exists reactions_fire int not null default 0,
  add column if not exists reactions_eyes int not null default 0,
  add column if not exists reactions_heart int not null default 0,
  add column if not exists reactions_laugh int not null default 0,
  add column if not exists total_reactions int generated always as (
    reactions_fire + reactions_eyes + reactions_heart + reactions_laugh
  ) stored;

create index if not exists idx_projects_total_reactions on projects (total_reactions desc);

-- ==============================================================================
-- 2. Add reaction columns to users table (creator profile reactions)
-- ==============================================================================
alter table users
  add column if not exists reactions_fire int not null default 0,
  add column if not exists reactions_eyes int not null default 0,
  add column if not exists reactions_heart int not null default 0,
  add column if not exists reactions_laugh int not null default 0,
  add column if not exists total_reactions int generated always as (
    reactions_fire + reactions_eyes + reactions_heart + reactions_laugh
  ) stored;

create index if not exists idx_users_total_reactions on users (total_reactions desc);

-- ==============================================================================
-- 3. Backfill reaction counts from reaction_counts into projects before dropping
-- ==============================================================================
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'reaction_counts') then
    update projects p
    set
      reactions_fire = coalesce((select rc.count from reaction_counts rc where rc.project_id = p.id and rc.reaction_type = 'fire'), 0),
      reactions_eyes = coalesce((select rc.count from reaction_counts rc where rc.project_id = p.id and rc.reaction_type = 'eyes'), 0),
      reactions_heart = coalesce((select rc.count from reaction_counts rc where rc.project_id = p.id and rc.reaction_type = 'heart'), 0),
      reactions_laugh = coalesce((select rc.count from reaction_counts rc where rc.project_id = p.id and rc.reaction_type = 'laugh'), 0);
  end if;
end $$;

-- ==============================================================================
-- 4. Update reactions ledger table to support both projects and creator profiles
-- ==============================================================================
alter table reactions
  add column if not exists target_user_id uuid references users(id) on delete cascade;

alter table reactions
  alter column project_id drop not null;

-- Drop legacy unique constraint
alter table reactions
  drop constraint if exists reactions_project_id_anonymous_id_reaction_type_key;
alter table reactions
  drop constraint if exists uq_project_reaction;
alter table reactions
  drop constraint if exists uq_user_reaction;
alter table reactions
  drop constraint if exists chk_reaction_target;

-- Ensure exactly one target is present
alter table reactions
  add constraint chk_reaction_target check (
    (project_id is not null and target_user_id is null) or
    (project_id is null and target_user_id is not null)
  );

-- Enforce 1 reaction per emoji per identity
alter table reactions
  add constraint uq_project_reaction unique (project_id, anonymous_id, reaction_type);
alter table reactions
  add constraint uq_user_reaction unique (target_user_id, anonymous_id, reaction_type);

create index if not exists idx_reactions_project on reactions (project_id) where project_id is not null;
create index if not exists idx_reactions_target_user on reactions (target_user_id) where target_user_id is not null;

-- ==============================================================================
-- 5. Drop deprecated reaction_counts table and clean up publications
-- ==============================================================================
do $$ begin
  alter publication supabase_realtime drop table reaction_counts;
exception when others then null;
end $$;

drop policy if exists "Reaction counts are publicly readable" on reaction_counts;
drop table if exists reaction_counts cascade;

-- Ensure projects and users are published to Supabase Realtime
do $$ begin
  alter publication supabase_realtime add table projects;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table users;
exception when duplicate_object then null;
end $$;

-- ==============================================================================
-- 6. Atomic Project Reaction RPC (add & remove)
-- ==============================================================================
create or replace function add_project_reaction(
  p_project_id uuid,
  p_anonymous_id text,
  p_reaction_type text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_new boolean := false;
  v_new_count int := 0;
begin
  -- Validate reaction type
  if p_reaction_type not in ('fire', 'eyes', 'heart', 'laugh') then
    return jsonb_build_object('success', false, 'error', 'Invalid reaction type');
  end if;

  -- Verify project exists
  if not exists (select 1 from projects where id = p_project_id) then
    return jsonb_build_object('success', false, 'error', 'Project not found');
  end if;

  -- Insert reaction ledger entry if not already present
  with inserted as (
    insert into reactions (project_id, anonymous_id, reaction_type)
    values (p_project_id, p_anonymous_id, p_reaction_type::reaction_type)
    on conflict (project_id, anonymous_id, reaction_type) do nothing
    returning id
  )
  select exists (select 1 from inserted) into v_is_new;

  -- If conflict occurred (already reacted), fetch current column count
  if not v_is_new then
    if p_reaction_type = 'fire' then
      select reactions_fire into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'eyes' then
      select reactions_eyes into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'heart' then
      select reactions_heart into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'laugh' then
      select reactions_laugh into v_new_count from projects where id = p_project_id;
    end if;

    return jsonb_build_object(
      'success', true,
      'reaction', p_reaction_type,
      'count', coalesce(v_new_count, 0),
      'already_reacted', true
    );
  end if;

  -- Increment the corresponding column atomically
  if p_reaction_type = 'fire' then
    update projects set reactions_fire = reactions_fire + 1 where id = p_project_id returning reactions_fire into v_new_count;
  elsif p_reaction_type = 'eyes' then
    update projects set reactions_eyes = reactions_eyes + 1 where id = p_project_id returning reactions_eyes into v_new_count;
  elsif p_reaction_type = 'heart' then
    update projects set reactions_heart = reactions_heart + 1 where id = p_project_id returning reactions_heart into v_new_count;
  elsif p_reaction_type = 'laugh' then
    update projects set reactions_laugh = reactions_laugh + 1 where id = p_project_id returning reactions_laugh into v_new_count;
  end if;

  return jsonb_build_object(
    'success', true,
    'reaction', p_reaction_type,
    'count', v_new_count,
    'already_reacted', false
  );
end;
$$;

revoke execute on function add_project_reaction from public, anon;
grant execute on function add_project_reaction to authenticated, service_role;

create or replace function remove_project_reaction(
  p_project_id uuid,
  p_anonymous_id text,
  p_reaction_type text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted boolean := false;
  v_new_count int := 0;
begin
  if p_reaction_type not in ('fire', 'eyes', 'heart', 'laugh') then
    return jsonb_build_object('success', false, 'error', 'Invalid reaction type');
  end if;

  with deleted as (
    delete from reactions
    where project_id = p_project_id
      and anonymous_id = p_anonymous_id
      and reaction_type = p_reaction_type::reaction_type
    returning id
  )
  select exists (select 1 from deleted) into v_deleted;

  if not v_deleted then
    -- Not found, return current count without change
    if p_reaction_type = 'fire' then
      select reactions_fire into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'eyes' then
      select reactions_eyes into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'heart' then
      select reactions_heart into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'laugh' then
      select reactions_laugh into v_new_count from projects where id = p_project_id;
    end if;

    return jsonb_build_object('success', true, 'reaction', p_reaction_type, 'count', coalesce(v_new_count, 0));
  end if;

  -- Decrement safely (never drop below 0)
  if p_reaction_type = 'fire' then
    update projects set reactions_fire = greatest(0, reactions_fire - 1) where id = p_project_id returning reactions_fire into v_new_count;
  elsif p_reaction_type = 'eyes' then
    update projects set reactions_eyes = greatest(0, reactions_eyes - 1) where id = p_project_id returning reactions_eyes into v_new_count;
  elsif p_reaction_type = 'heart' then
    update projects set reactions_heart = greatest(0, reactions_heart - 1) where id = p_project_id returning reactions_heart into v_new_count;
  elsif p_reaction_type = 'laugh' then
    update projects set reactions_laugh = greatest(0, reactions_laugh - 1) where id = p_project_id returning reactions_laugh into v_new_count;
  end if;

  return jsonb_build_object('success', true, 'reaction', p_reaction_type, 'count', v_new_count);
end;
$$;

revoke execute on function remove_project_reaction from public, anon;
grant execute on function remove_project_reaction to authenticated, service_role;

-- ==============================================================================
-- 7. Atomic Creator/User Reaction RPC (add & remove)
-- ==============================================================================
create or replace function add_user_reaction(
  p_user_id uuid,
  p_anonymous_id text,
  p_reaction_type text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_new boolean := false;
  v_new_count int := 0;
begin
  if p_reaction_type not in ('fire', 'eyes', 'heart', 'laugh') then
    return jsonb_build_object('success', false, 'error', 'Invalid reaction type');
  end if;

  if not exists (select 1 from users where id = p_user_id) then
    return jsonb_build_object('success', false, 'error', 'User not found');
  end if;

  with inserted as (
    insert into reactions (target_user_id, anonymous_id, reaction_type)
    values (p_user_id, p_anonymous_id, p_reaction_type::reaction_type)
    on conflict (target_user_id, anonymous_id, reaction_type) do nothing
    returning id
  )
  select exists (select 1 from inserted) into v_is_new;

  if not v_is_new then
    if p_reaction_type = 'fire' then
      select reactions_fire into v_new_count from users where id = p_user_id;
    elsif p_reaction_type = 'eyes' then
      select reactions_eyes into v_new_count from users where id = p_user_id;
    elsif p_reaction_type = 'heart' then
      select reactions_heart into v_new_count from users where id = p_user_id;
    elsif p_reaction_type = 'laugh' then
      select reactions_laugh into v_new_count from users where id = p_user_id;
    end if;

    return jsonb_build_object(
      'success', true,
      'reaction', p_reaction_type,
      'count', coalesce(v_new_count, 0),
      'already_reacted', true
    );
  end if;

  if p_reaction_type = 'fire' then
    update users set reactions_fire = reactions_fire + 1 where id = p_user_id returning reactions_fire into v_new_count;
  elsif p_reaction_type = 'eyes' then
    update users set reactions_eyes = reactions_eyes + 1 where id = p_user_id returning reactions_eyes into v_new_count;
  elsif p_reaction_type = 'heart' then
    update users set reactions_heart = reactions_heart + 1 where id = p_user_id returning reactions_heart into v_new_count;
  elsif p_reaction_type = 'laugh' then
    update users set reactions_laugh = reactions_laugh + 1 where id = p_user_id returning reactions_laugh into v_new_count;
  end if;

  return jsonb_build_object(
    'success', true,
    'reaction', p_reaction_type,
    'count', v_new_count,
    'already_reacted', false
  );
end;
$$;

revoke execute on function add_user_reaction from public, anon;
grant execute on function add_user_reaction to authenticated, service_role;

create or replace function remove_user_reaction(
  p_user_id uuid,
  p_anonymous_id text,
  p_reaction_type text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted boolean := false;
  v_new_count int := 0;
begin
  if p_reaction_type not in ('fire', 'eyes', 'heart', 'laugh') then
    return jsonb_build_object('success', false, 'error', 'Invalid reaction type');
  end if;

  with deleted as (
    delete from reactions
    where target_user_id = p_user_id
      and anonymous_id = p_anonymous_id
      and reaction_type = p_reaction_type::reaction_type
    returning id
  )
  select exists (select 1 from deleted) into v_deleted;

  if not v_deleted then
    if p_reaction_type = 'fire' then
      select reactions_fire into v_new_count from users where id = p_user_id;
    elsif p_reaction_type = 'eyes' then
      select reactions_eyes into v_new_count from users where id = p_user_id;
    elsif p_reaction_type = 'heart' then
      select reactions_heart into v_new_count from users where id = p_user_id;
    elsif p_reaction_type = 'laugh' then
      select reactions_laugh into v_new_count from users where id = p_user_id;
    end if;

    return jsonb_build_object('success', true, 'reaction', p_reaction_type, 'count', coalesce(v_new_count, 0));
  end if;

  if p_reaction_type = 'fire' then
    update users set reactions_fire = greatest(0, reactions_fire - 1) where id = p_user_id returning reactions_fire into v_new_count;
  elsif p_reaction_type = 'eyes' then
    update users set reactions_eyes = greatest(0, reactions_eyes - 1) where id = p_user_id returning reactions_eyes into v_new_count;
  elsif p_reaction_type = 'heart' then
    update users set reactions_heart = greatest(0, reactions_heart - 1) where id = p_user_id returning reactions_heart into v_new_count;
  elsif p_reaction_type = 'laugh' then
    update users set reactions_laugh = greatest(0, reactions_laugh - 1) where id = p_user_id returning reactions_laugh into v_new_count;
  end if;

  return jsonb_build_object('success', true, 'reaction', p_reaction_type, 'count', v_new_count);
end;
$$;

revoke execute on function remove_user_reaction from public, anon;
grant execute on function remove_user_reaction to authenticated, service_role;
