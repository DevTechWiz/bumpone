-- 018_harden_identity_boundary.sql
-- Phase 2: Identity & authorization hardening (DB layer).
--   SEC-004  Bind add/remove_project_reaction_auth to auth.uid(); drop forgeable legacy RPCs.
--   SEC-010  Remove direct client UPDATE on users/projects (all writes go through validated APIs).
--   SEC-024  Remove users from the realtime publication (profile-change reconnaissance).
--   SEC-026  Enforce handle format + 30-day cooldown at the database; server-authoritative stamping.
--   SEC-016  Harden trigger functions (search_path + execute revokes).
--   Write-path value validation for project metadata (scheme/length) as defense in depth.

-- =============================================================================
-- 1. Reaction identity binding (SEC-004)
--    The legacy RPCs trusted caller-supplied identity; the *_auth variants now
--    verify it. service_role (verified server routes) may still act on behalf of
--    a user; everyone else must match auth.uid(), and a null identity is never
--    accepted (null would bypass the unique constraint and allow count forging).
-- =============================================================================

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
  -- SEC-004 identity binding
  if p_user_id is null then
    raise exception 'reaction identity mismatch' using errcode = '42501';
  end if;
  if coalesce(auth.role(), 'anon') <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'reaction identity mismatch' using errcode = '42501';
  end if;

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

  -- Insert into ledger (unique per project, user, emoji)
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

revoke execute on function add_project_reaction_auth from public, anon;
grant execute on function add_project_reaction_auth to authenticated, service_role;

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
  -- SEC-004 identity binding
  if p_user_id is null then
    raise exception 'reaction identity mismatch' using errcode = '42501';
  end if;
  if coalesce(auth.role(), 'anon') <> 'service_role' and auth.uid() is distinct from p_user_id then
    raise exception 'reaction identity mismatch' using errcode = '42501';
  end if;

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

revoke execute on function remove_project_reaction_auth from public, anon;
grant execute on function remove_project_reaction_auth to authenticated, service_role;

-- =============================================================================
-- 2. Drop legacy identity-forgeable reaction RPCs (SEC-004)
--    No application code calls them (verified by grep); they trusted caller-supplied
--    p_anonymous_id / p_user_id and were executable by any authenticated client.
-- =============================================================================

drop function if exists public.add_project_reaction(uuid, text, text);
drop function if exists public.remove_project_reaction(uuid, text, text);
drop function if exists public.add_user_reaction(uuid, text, text);
drop function if exists public.remove_user_reaction(uuid, text, text);

-- =============================================================================
-- 3. Remove direct client write paths (SEC-010)
--    ProfileView was the only remaining client-side writer; profile and project
--    edits now go through /api/profile/update and /api/project/update, which
--    authenticate the session and scope the update to the session user.
--    RLS update policies remain in place as the second layer, but without a
--    column grant they can never be exercised by anon/authenticated.
-- =============================================================================

revoke update on public.users from authenticated;
revoke insert on public.users from authenticated;
revoke delete on public.users from authenticated;
revoke update on public.projects from authenticated;
revoke insert on public.projects from authenticated;
revoke delete on public.projects from authenticated;

-- =============================================================================
-- 4. Realtime publication: remove users (SEC-024)
--    The application never subscribes to postgres_changes (verified by grep);
--    publishing users only leaks profile-change events to anonymous subscribers
--    for reconnaissance (handle/display_name churn, impersonation timing).
-- =============================================================================

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime drop table public.users;
    exception when undefined_object then null;
    end;
  end if;
end $$;

-- =============================================================================
-- 5. User profile validation trigger (SEC-026 + scheme hardening)
--    Role-agnostic: applies to service_role API writes too. Handle cooldown and
--    stamping are server-authoritative; clients can no longer touch
--    handle_last_changed_at (column grant removed above).
--    Length/content checks for display_name/bio are app-layer (zod) to avoid
--    breaking OAuth signups that insert long names.
-- =============================================================================

create or replace function enforce_user_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.handle is distinct from old.handle then
    if new.handle is null or new.handle !~ '^[a-z0-9_]{2,30}$' then
      raise exception 'invalid_handle' using errcode = '23514';
    end if;
    if old.handle_last_changed_at is not null
       and old.handle_last_changed_at > now() - interval '30 days' then
      raise exception 'handle_cooldown_active' using errcode = '55000';
    end if;
    new.handle_last_changed_at := now();
  else
    -- Stamping is derived from handle changes only; direct tampering is reverted.
    new.handle_last_changed_at := old.handle_last_changed_at;
  end if;

  if new.website is distinct from old.website
     and coalesce(new.website, '') <> ''
     and new.website !~ '^https://' then
    raise exception 'invalid_website_scheme' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function enforce_user_profile_fields() from public, anon, authenticated;

drop trigger if exists trg_enforce_user_profile_fields on users;
create trigger trg_enforce_user_profile_fields
  before update on users
  for each row execute function enforce_user_profile_fields();

-- =============================================================================
-- 6. Project metadata validation trigger (SEC-010 write half / SEC-001)
--    Change-aware: legacy rows with odd stored values can still be edited for
--    unrelated fields; only the value being changed must be valid.
--    Financial/moderation fields remain guarded by trg_protect_project_fields.
-- =============================================================================

create or replace function enforce_project_metadata_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.destination_url is distinct from old.destination_url then
    if new.destination_url is null or new.destination_url !~ '^https://' then
      raise exception 'invalid_destination_url' using errcode = '23514';
    end if;
  end if;

  if new.image_path is distinct from old.image_path then
    if new.image_path is null
       or not (new.image_path ~ '^https://'
               or new.image_path ~ '^data:image/(png|jpeg|webp);base64,') then
      raise exception 'invalid_image_path' using errcode = '23514';
    end if;
  end if;

  if new.title is distinct from old.title then
    if new.title is null or char_length(new.title) < 1 or char_length(new.title) > 100 then
      raise exception 'invalid_title' using errcode = '23514';
    end if;
  end if;

  -- Project handle changes are app-layer only; enforce format when it changes.
  if tg_op = 'UPDATE' and new.handle is distinct from old.handle then
    if new.handle is null or new.handle !~ '^[a-z0-9_]{1,30}$' then
      raise exception 'invalid_project_handle' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function enforce_project_metadata_fields() from public, anon, authenticated;

drop trigger if exists trg_enforce_project_metadata on projects;
create trigger trg_enforce_project_metadata
  before insert or update on projects
  for each row execute function enforce_project_metadata_fields();

-- =============================================================================
-- 7. Trigger-function hygiene (SEC-016 residual)
--    Pin search_path (no unqualified pg_temp resolution) and remove the default
--    PUBLIC execute grant; trigger execution privilege is checked at CREATE
--    TRIGGER time, so existing triggers are unaffected.
-- =============================================================================

alter function handle_new_user() set search_path = public, pg_temp;
alter function populate_message_author() set search_path = public, pg_temp;
alter function set_updated_at() set search_path = public, pg_temp;
alter function protect_project_authoritative_fields() set search_path = public, pg_temp;

revoke execute on function handle_new_user() from public, anon, authenticated;
revoke execute on function populate_message_author() from public, anon, authenticated;
revoke execute on function set_updated_at() from public, anon, authenticated;
revoke execute on function protect_project_authoritative_fields() from public, anon, authenticated;

-- Server-side writes (service_role via PostgREST) must keep executing the
-- triggers that guard identity and financial fields.
grant execute on function handle_new_user() to service_role;
grant execute on function populate_message_author() to service_role;
grant execute on function set_updated_at() to service_role;
grant execute on function protect_project_authoritative_fields() to service_role;
grant execute on function enforce_user_profile_fields() to service_role;
grant execute on function enforce_project_metadata_fields() to service_role;
