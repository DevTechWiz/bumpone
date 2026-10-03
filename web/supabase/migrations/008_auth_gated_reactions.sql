-- 008_auth_gated_reactions.sql
-- Transition reactions ledger to strictly authenticated users on projects
-- Automatically aggregates total reactions received onto creator profiles

-- 1. Ensure user_id column exists on reactions table
alter table reactions
  add column if not exists user_id uuid references users(id) on delete cascade;

-- Allow anonymous_id to be nullable for pure authenticated reactions
alter table reactions
  alter column anonymous_id drop not null;

-- Ensure total_reactions_received column exists on users table
alter table users
  add column if not exists total_reactions_received int not null default 0 check (total_reactions_received >= 0);

-- Drop legacy anonymous unique constraints & partial indexes
alter table reactions
  drop constraint if exists uq_project_reaction,
  drop constraint if exists uq_user_reaction,
  drop constraint if exists reactions_project_id_anonymous_id_reaction_type_key,
  drop constraint if exists uq_project_user_reaction;

drop index if exists uq_project_user_reaction;
drop index if exists uq_user_user_reaction;

-- 2. Authenticated unique constraint (Option A: 1 reaction per emoji per user per project)
-- Standard table constraint so ON CONFLICT (project_id, user_id, reaction_type) works seamlessly
alter table reactions
  add constraint uq_project_user_reaction unique (project_id, user_id, reaction_type);

-- 3. Atomic Auth-Gated Project Reaction RPC (Add)
create or replace function add_project_reaction_auth(
  p_project_id uuid,
  p_user_id uuid,
  p_reaction_type text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_new boolean := false;
  v_new_count int := 0;
  v_project_owner_id uuid;
  v_project_handle text;
begin
  -- Validate reaction type enum values
  if p_reaction_type not in ('fire', 'eyes', 'heart', 'laugh') then
    return jsonb_build_object('success', false, 'error', 'Invalid reaction type');
  end if;

  -- Ensure project exists and obtain owner user_id (with handle fallback)
  select user_id, handle into v_project_owner_id, v_project_handle from projects where id = p_project_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Project not found');
  end if;

  if v_project_owner_id is null and v_project_handle is not null then
    select id into v_project_owner_id from users where lower(replace(handle, '@', '')) = lower(replace(v_project_handle, '@', '')) limit 1;
  end if;

  -- Insert into ledger (Option A: unique per project, user, emoji)
  with inserted as (
    insert into reactions (project_id, user_id, reaction_type)
    values (p_project_id, p_user_id, p_reaction_type::reaction_type)
    on conflict (project_id, user_id, reaction_type) do nothing
    returning id
  )
  select exists (select 1 from inserted) into v_is_new;

  -- If user already reacted with this emoji, return current count without incrementing
  if not v_is_new then
    if p_reaction_type = 'fire' then select reactions_fire into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'eyes' then select reactions_eyes into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'heart' then select reactions_heart into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'laugh' then select reactions_laugh into v_new_count from projects where id = p_project_id;
    end if;

    return jsonb_build_object(
      'success', true,
      'reaction', p_reaction_type,
      'count', coalesce(v_new_count, 0),
      'already_reacted', true
    );
  end if;

  -- Increment the specific project counter
  if p_reaction_type = 'fire' then
    update projects set reactions_fire = reactions_fire + 1 where id = p_project_id returning reactions_fire into v_new_count;
  elsif p_reaction_type = 'eyes' then
    update projects set reactions_eyes = reactions_eyes + 1 where id = p_project_id returning reactions_eyes into v_new_count;
  elsif p_reaction_type = 'heart' then
    update projects set reactions_heart = reactions_heart + 1 where id = p_project_id returning reactions_heart into v_new_count;
  elsif p_reaction_type = 'laugh' then
    update projects set reactions_laugh = reactions_laugh + 1 where id = p_project_id returning reactions_laugh into v_new_count;
  end if;

  -- Increment creator's combined clout if project owner is assigned
  if v_project_owner_id is not null then
    update users set total_reactions_received = total_reactions_received + 1 where id = v_project_owner_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'reaction', p_reaction_type,
    'count', v_new_count,
    'already_reacted', false
  );
end;
$$;

-- 4. Atomic Auth-Gated Project Reaction RPC (Remove / Toggle Off)
create or replace function remove_project_reaction_auth(
  p_project_id uuid,
  p_user_id uuid,
  p_reaction_type text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted boolean := false;
  v_new_count int := 0;
  v_project_owner_id uuid;
  v_project_handle text;
begin
  if p_reaction_type not in ('fire', 'eyes', 'heart', 'laugh') then
    return jsonb_build_object('success', false, 'error', 'Invalid reaction type');
  end if;

  -- Ensure project exists and obtain owner user_id (with handle fallback)
  select user_id, handle into v_project_owner_id, v_project_handle from projects where id = p_project_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Project not found');
  end if;

  if v_project_owner_id is null and v_project_handle is not null then
    select id into v_project_owner_id from users where lower(replace(handle, '@', '')) = lower(replace(v_project_handle, '@', '')) limit 1;
  end if;

  with deleted as (
    delete from reactions
    where project_id = p_project_id
      and user_id = p_user_id
      and reaction_type = p_reaction_type::reaction_type
    returning id
  )
  select exists (select 1 from deleted) into v_deleted;

  if not v_deleted then
    if p_reaction_type = 'fire' then select reactions_fire into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'eyes' then select reactions_eyes into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'heart' then select reactions_heart into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'laugh' then select reactions_laugh into v_new_count from projects where id = p_project_id;
    end if;

    return jsonb_build_object('success', true, 'reaction', p_reaction_type, 'count', coalesce(v_new_count, 0));
  end if;

  -- Decrement project counter (never below 0)
  if p_reaction_type = 'fire' then
    update projects set reactions_fire = greatest(0, reactions_fire - 1) where id = p_project_id returning reactions_fire into v_new_count;
  elsif p_reaction_type = 'eyes' then
    update projects set reactions_eyes = greatest(0, reactions_eyes - 1) where id = p_project_id returning reactions_eyes into v_new_count;
  elsif p_reaction_type = 'heart' then
    update projects set reactions_heart = greatest(0, reactions_heart - 1) where id = p_project_id returning reactions_heart into v_new_count;
  elsif p_reaction_type = 'laugh' then
    update projects set reactions_laugh = greatest(0, reactions_laugh - 1) where id = p_project_id returning reactions_laugh into v_new_count;
  end if;

  -- Decrement creator's combined clout (never below 0)
  if v_project_owner_id is not null then
    update users set total_reactions_received = greatest(0, total_reactions_received - 1) where id = v_project_owner_id;
  end if;

  return jsonb_build_object('success', true, 'reaction', p_reaction_type, 'count', v_new_count);
end;
$$;

revoke execute on function add_project_reaction_auth from public, anon;
grant execute on function add_project_reaction_auth to authenticated, service_role;
revoke execute on function remove_project_reaction_auth from public, anon;
grant execute on function remove_project_reaction_auth to authenticated, service_role;

-- 5. Backfill user total_reactions_received from existing projects
update users u
set total_reactions_received = coalesce((
  select sum(p.reactions_fire + p.reactions_eyes + p.reactions_heart + p.reactions_laugh)
  from projects p
  where p.user_id = u.id and p.is_active = true
), 0);
