# Auth-Gated Project Reactions & Aggregated Creator Clout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a production-grade, abuse-proof reactions system where:
1. **Reactions are placed strictly on Projects** (not profiles).
2. **Non-logged-in users clicking any emoji are prompted to log in** via Google / AuthModal.
3. **Logged-in users can toggle reactions (Option A):** up to 1 of each emoji (🔥, 👀, ❤️, 😂) per project.
4. **Creator Profiles automatically aggregate and display their Combined Clout** (sum of all reactions earned across all their projects on the wall).

**Architecture:**
- **Reaction Target:** Exclusively `project_id`. Users cannot react directly to profiles.
- **Database Ledger:** `reactions (id, project_id, user_id, reaction_type, created_at)` with `unique (project_id, user_id, reaction_type)`.
- **Inlined Project Counters:** `reactions_fire`, `reactions_eyes`, `reactions_heart`, `reactions_laugh`, and generated stored `total_reactions` on `projects`.
- **Inlined Creator Clout:** `total_reactions_received` on `users` automatically incremented/decremented in the same atomic RPC transaction when a project is reacted to.
- **Frontend Sync:** `SlotDetailModal` prompts login if `!user`, highlights active user reactions, and toggles on/off. `ProfileView` displays the creator's aggregated community clout.

**Tech Stack:** Next.js 15 (App Router), Supabase Auth & PostgreSQL 17 RPCs, TypeScript, TailwindCSS, Vitest.

---

### Task 1: Database Migration `008_auth_gated_reactions.sql`

**Files:**
- Create: `web/supabase/migrations/008_auth_gated_reactions.sql`

**Step 1: Write Migration SQL**
```sql
-- 008_auth_gated_reactions.sql
-- Transition reactions ledger to strictly authenticated users on projects
-- Automatically aggregates total reactions received onto creator profiles

-- 1. Ensure user_id column exists on reactions table
alter table reactions
  add column if not exists user_id uuid references users(id) on delete cascade;

-- Allow anonymous_id to be nullable
alter table reactions
  alter column anonymous_id drop not null;

-- Ensure total_reactions_received column exists on users table
alter table users
  add column if not exists total_reactions_received int not null default 0 check (total_reactions_received >= 0);

-- Drop legacy anonymous unique constraints
alter table reactions
  drop constraint if exists uq_project_reaction,
  drop constraint if exists uq_user_reaction,
  drop constraint if exists reactions_project_id_anonymous_id_reaction_type_key;

-- 2. Authenticated unique constraint (Option A: 1 reaction per emoji per user per project)
create unique index if not exists uq_project_user_reaction 
  on reactions (project_id, user_id, reaction_type) 
  where user_id is not null and project_id is not null;

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
begin
  if p_reaction_type not in ('fire', 'eyes', 'heart', 'laugh') then
    return jsonb_build_object('success', false, 'error', 'Invalid reaction type');
  end if;

  select user_id into v_project_owner_id from projects where id = p_project_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'Project not found');
  end if;

  with inserted as (
    insert into reactions (project_id, user_id, reaction_type)
    values (p_project_id, p_user_id, p_reaction_type::reaction_type)
    on conflict (project_id, user_id, reaction_type) do nothing
    returning id
  )
  select exists (select 1 from inserted) into v_is_new;

  if not v_is_new then
    if p_reaction_type = 'fire' then select reactions_fire into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'eyes' then select reactions_eyes into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'heart' then select reactions_heart into v_new_count from projects where id = p_project_id;
    elsif p_reaction_type = 'laugh' then select reactions_laugh into v_new_count from projects where id = p_project_id;
    end if;

    return jsonb_build_object('success', true, 'reaction', p_reaction_type, 'count', coalesce(v_new_count, 0), 'already_reacted', true);
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

  -- Increment creator's combined clout if owner is assigned
  if v_project_owner_id is not null then
    update users set total_reactions_received = total_reactions_received + 1 where id = v_project_owner_id;
  end if;

  return jsonb_build_object('success', true, 'reaction', p_reaction_type, 'count', v_new_count, 'already_reacted', false);
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
begin
  if p_reaction_type not in ('fire', 'eyes', 'heart', 'laugh') then
    return jsonb_build_object('success', false, 'error', 'Invalid reaction type');
  end if;

  select user_id into v_project_owner_id from projects where id = p_project_id;

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

  -- Decrement project counter
  if p_reaction_type = 'fire' then
    update projects set reactions_fire = greatest(0, reactions_fire - 1) where id = p_project_id returning reactions_fire into v_new_count;
  elsif p_reaction_type = 'eyes' then
    update projects set reactions_eyes = greatest(0, reactions_eyes - 1) where id = p_project_id returning reactions_eyes into v_new_count;
  elsif p_reaction_type = 'heart' then
    update projects set reactions_heart = greatest(0, reactions_heart - 1) where id = p_project_id returning reactions_heart into v_new_count;
  elsif p_reaction_type = 'laugh' then
    update projects set reactions_laugh = greatest(0, reactions_laugh - 1) where id = p_project_id returning reactions_laugh into v_new_count;
  end if;

  -- Decrement creator's combined clout
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
```

**Step 2: Commit Migration**
```bash
git add web/supabase/migrations/008_auth_gated_reactions.sql
git commit -m "feat(reactions): create 008_auth_gated_reactions with creator clout roll-up"
```

---

### Task 2: Auth-Gated Project Reactions API Route (`/api/reactions`)

**Files:**
- Modify: `web/src/app/api/reactions/route.ts`
- Test: `web/src/__tests__/reactions_inlined.test.ts`

**Context:**
Strictly gate reactions behind Supabase session auth. Remove legacy anonymous cookies and in-memory rate limit maps.

**Step 1: Update `/api/reactions/route.ts`**
1. Read user session with `const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();`.
2. If `!user`, return `401 Unauthorized: { error: 'Authentication required to react' }`.
3. Extract `projectId` and `reaction`.
4. In `POST`: Call `supabaseAdmin.rpc('add_project_reaction_auth', { p_project_id: projectId, p_user_id: user.id, p_reaction_type: reaction })`.
5. In `DELETE`: Call `supabaseAdmin.rpc('remove_project_reaction_auth', { p_project_id: projectId, p_user_id: user.id, p_reaction_type: reaction })`.
6. In `GET ?projectId=...`: Query `reactions` for the user's active reactions on this project:
   `supabaseAdmin.from('reactions').select('reaction_type').eq('project_id', projectId).eq('user_id', user.id)`.
   Returns `{ userReactions: string[] }`.

**Step 2: Update Tests & Commit**
```bash
git add web/src/app/api/reactions/route.ts web/src/__tests__/reactions_inlined.test.ts
git commit -m "feat(reactions): update API route for auth-gated project reactions"
```

---

### Task 3: Login Prompt & Active Toggle in `SlotDetailModal`

**Files:**
- Modify: `web/src/components/SlotDetailModal.tsx`
- Modify: `web/src/app/page.tsx:1435-1445`

**Step 1: Update `SlotDetailModal.tsx`**
1. Accept `user` and `onRequireAuth` in `SlotDetailModalProps`.
2. Add `activeUserReactions: Set<string>` state.
3. If `user` is logged in, fetch `GET /api/reactions?projectId=${slot.id}` to hydrate active emojis.
4. In `handleReaction`:
   - If `!user`: call `soundEngine.playClick(); onRequireAuth?.(); return;` (triggers login modal immediately).
   - If `user`:
     - If `activeUserReactions.has(type)`:
       - Optimistically decrement `localReactions[type]`.
       - Remove `type` from `activeUserReactions`.
       - Call `DELETE /api/reactions?projectId=${slot.id}&reaction=${type}`.
     - Else:
       - Optimistically increment `localReactions[type]`.
       - Add `type` to `activeUserReactions`.
       - Call `POST /api/reactions` with `{ projectId: slot.id, reaction: type }`.
     - Reconcile local state with server response count.
5. Visually highlight active buttons with an illuminated border/glow.

**Step 2: Connect in `web/src/app/page.tsx`**
Ensure `<SlotDetailModal>` receives `user={user}` and `onRequireAuth={() => setIsAuthOpen(true)}`.

**Step 3: Commit**
```bash
git add web/src/components/SlotDetailModal.tsx web/src/app/page.tsx
git commit -m "feat(reactions): prompt login and enable toggle reactions in SlotDetailModal"
```

---

### Task 4: Creator Profile Combined Clout Display in `ProfileView`

**Files:**
- Modify: `web/src/components/ProfileView.tsx`

**Context:**
Users cannot react directly to profiles. Instead, the creator profile displays their **Combined Clout** aggregated across all their active projects on the wall.

**Step 1: Compute and Render Aggregated Clout**
1. In `ProfileView.tsx`, compute aggregated reactions across all `creatorProjects`:
   ```typescript
   const totalReactionsReceived = creatorProjects.reduce(
     (sum, p) => sum + (p.reactions?.fire || 0) + (p.reactions?.eyes || 0) + (p.reactions?.heart || 0) + (p.reactions?.laugh || 0),
     0
   );
   ```
2. In the portfolio stats section (around line 1300), add a prominent **Community Clout** metric card:
   - Metric: `totalReactionsReceived` (e.g. `🔥 148 Reactions`).
   - Label: `"Total Community Hype"`.
   - Subtitle: `"Reactions earned across all projects on the wall"`.
3. In the project details view (when `isViewingUser === false`), render the project's own interactive reaction bar with login prompts & active states.

**Step 2: Commit**
```bash
git add web/src/components/ProfileView.tsx
git commit -m "feat(profile): display combined creator reaction clout across projects"
```

---

### Task 5: Decouple Trollbox & Debounced Realtime Sync

**Files:**
- Modify: `web/src/app/page.tsx`

**Step 1: Trollbox Cleanup**
In `handleTriggerReaction`, emit floating particle without mutating Slot #1 when untargeted.

**Step 2: Realtime Listener**
Add `UPDATE` event handler on `projects` in the Supabase channel to update live counts across connected users.

**Step 3: Build & Test Verification**
Run: `npm test` and `npm run build`.

**Step 4: Commit**
```bash
git add web/src/app/page.tsx
git commit -m "feat(reactions): decouple war room reactions and add realtime listeners"
```
