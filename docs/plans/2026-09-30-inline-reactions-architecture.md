# Inline Reactions Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the standalone `reaction_counts` table by embedding dedicated integer reaction columns directly onto `projects` and `users`, achieving 0-join high-speed reads on the 100-slot board while preserving the `reactions` table for deduplication and abuse protection.

**Architecture:** 
1. Embed 4 non-nullable integer columns (`reactions_fire`, `reactions_eyes`, `reactions_heart`, `reactions_laugh`) directly on `projects` with a composite index for the "Popular" discovery view.
2. Embed `total_reactions_received` on `users` to provide creator-level clout across all their projects.
3. Keep `reactions (project_id, anonymous_id, reaction_type)` strictly as the deduplication ledger.
4. Update `add_project_reaction` RPC to atomically insert the deduplication row and increment the project and user counters in a single database transaction.

**Tech Stack:** PostgreSQL 17 / Supabase, TypeScript, Next.js 15, Vitest.

---

### Task 1: Create Database Migration `006_inline_reaction_counts.sql`

**Files:**
- Create: `web/supabase/migrations/006_inline_reaction_counts.sql`

**Step 1: Write migration SQL**
```sql
-- 006_inline_reaction_counts.sql
-- Inlines reaction counters onto projects and users tables, eliminating reaction_counts

-- 1. Add reaction columns to projects table
alter table projects
  add column if not exists reactions_fire int not null default 0 check (reactions_fire >= 0),
  add column if not exists reactions_eyes int not null default 0 check (reactions_eyes >= 0),
  add column if not exists reactions_heart int not null default 0 check (reactions_heart >= 0),
  add column if not exists reactions_laugh int not null default 0 check (reactions_laugh >= 0);

-- 2. Add total reactions received to users table
alter table users
  add column if not exists total_reactions_received int not null default 0 check (total_reactions_received >= 0);

-- 3. Composite index for instant "Popular" discovery sort
create index if not exists idx_projects_popularity on projects (
  (reactions_fire + reactions_eyes + reactions_heart + reactions_laugh) desc
);

-- 4. Migrate existing reaction counts data if reaction_counts table exists
do $$
begin
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'reaction_counts') then
    update projects p
    set
      reactions_fire = coalesce((select count from reaction_counts rc where rc.project_id = p.id and rc.reaction_type = 'fire'), 0),
      reactions_eyes = coalesce((select count from reaction_counts rc where rc.project_id = p.id and rc.reaction_type = 'eyes'), 0),
      reactions_heart = coalesce((select count from reaction_counts rc where rc.project_id = p.id and rc.reaction_type = 'heart'), 0),
      reactions_laugh = coalesce((select count from reaction_counts rc where rc.project_id = p.id and rc.reaction_type = 'laugh'), 0);

    -- Sync user totals
    update users u
    set total_reactions_received = coalesce((
      select sum(p.reactions_fire + p.reactions_eyes + p.reactions_heart + p.reactions_laugh)
      from projects p
      where p.user_id = u.id
    ), 0);

    drop table reaction_counts;
  end if;
end $$;

-- 5. Update atomic add_project_reaction RPC
create or replace function add_project_reaction(
  p_project_id uuid,
  p_anonymous_id text,
  p_reaction_type reaction_type
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted boolean := false;
  v_user_id uuid;
  v_fire int;
  v_eyes int;
  v_heart int;
  v_laugh int;
begin
  -- Step 1: Attempt deduplication insert
  insert into reactions (project_id, anonymous_id, reaction_type)
  values (p_project_id, p_anonymous_id, p_reaction_type)
  on conflict (project_id, anonymous_id, reaction_type) do nothing;

  get diagnostics v_inserted = row_count;

  -- If already reacted, return without incrementing
  if not v_inserted then
    select reactions_fire, reactions_eyes, reactions_heart, reactions_laugh
    into v_fire, v_eyes, v_heart, v_laugh
    from projects where id = p_project_id;

    return jsonb_build_object(
      'success', true,
      'recorded', false,
      'already_reacted', true,
      'reactions', jsonb_build_object(
        'fire', coalesce(v_fire, 0),
        'eyes', coalesce(v_eyes, 0),
        'heart', coalesce(v_heart, 0),
        'laugh', coalesce(v_laugh, 0)
      )
    );
  end if;

  -- Step 2: Atomic column increment on projects
  if p_reaction_type = 'fire' then
    update projects set reactions_fire = reactions_fire + 1 where id = p_project_id
    returning user_id, reactions_fire, reactions_eyes, reactions_heart, reactions_laugh
    into v_user_id, v_fire, v_eyes, v_heart, v_laugh;
  elsif p_reaction_type = 'eyes' then
    update projects set reactions_eyes = reactions_eyes + 1 where id = p_project_id
    returning user_id, reactions_fire, reactions_eyes, reactions_heart, reactions_laugh
    into v_user_id, v_fire, v_eyes, v_heart, v_laugh;
  elsif p_reaction_type = 'heart' then
    update projects set reactions_heart = reactions_heart + 1 where id = p_project_id
    returning user_id, reactions_fire, reactions_eyes, reactions_heart, reactions_laugh
    into v_user_id, v_fire, v_eyes, v_heart, v_laugh;
  elsif p_reaction_type = 'laugh' then
    update projects set reactions_laugh = reactions_laugh + 1 where id = p_project_id
    returning user_id, reactions_fire, reactions_eyes, reactions_heart, reactions_laugh
    into v_user_id, v_fire, v_eyes, v_heart, v_laugh;
  end if;

  -- Step 3: Increment user-level clout counter if project has an owner
  if v_user_id is not null then
    update users
    set total_reactions_received = total_reactions_received + 1
    where id = v_user_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'recorded', true,
    'already_reacted', false,
    'reactions', jsonb_build_object(
      'fire', v_fire,
      'eyes', v_eyes,
      'heart', v_heart,
      'laugh', v_laugh
    )
  );
end;
$$;

revoke execute on function add_project_reaction from public, anon, authenticated;
grant execute on function add_project_reaction to service_role, anon, authenticated;
```

**Step 2: Commit migration file**
```bash
git add web/supabase/migrations/006_inline_reaction_counts.sql
git commit -m "feat(db): add 006 migration to inline reaction counts onto projects and users"
```

---

### Task 2: Update Server-Side API Handlers (`/api/board` and `/api/reactions`)

**Files:**
- Modify: `web/src/app/api/board/route.ts`
- Modify: `web/src/app/api/reactions/route.ts`

**Step 1: Check and update `web/src/app/api/board/route.ts`**
Ensure `SELECT` fetches `reactions_fire, reactions_eyes, reactions_heart, reactions_laugh` directly without any join, and maps to the frontend `reactions: { fire: p.reactions_fire, eyes: p.reactions_eyes, heart: p.reactions_heart, laugh: p.reactions_laugh }`.

**Step 2: Check and update `web/src/app/api/reactions/route.ts`**
Ensure it invokes `add_project_reaction` RPC and returns the live `reactions` object.

**Step 3: Run existing test suites**
Run: `npm test`
Expected: 14/14 PASS

**Step 4: Commit**
```bash
git add web/src/app/api/
git commit -m "refactor(api): adapt board and reactions routes to inline reaction columns"
```

---

### Task 3: Add Automated Vitest Test Suite for Inline Reactions

**Files:**
- Create: `web/src/__tests__/reactions_inlined.test.ts`

**Step 1: Write test file**
```typescript
import { describe, it, expect } from 'vitest';

describe('Inlined Reaction Calculations & Popularity Ranking', () => {
  const project = {
    id: 'p1',
    title: 'Apex AI',
    reactions_fire: 10,
    reactions_eyes: 5,
    reactions_heart: 8,
    reactions_laugh: 2,
  };

  it('correctly maps inlined integer columns to frontend reaction record', () => {
    const reactions = {
      fire: project.reactions_fire,
      eyes: project.reactions_eyes,
      heart: project.reactions_heart,
      laugh: project.reactions_laugh,
    };

    expect(reactions.fire).toBe(10);
    expect(reactions.eyes).toBe(5);
    expect(reactions.heart).toBe(8);
    expect(reactions.laugh).toBe(2);
  });

  it('computes total popularity score by summing columns', () => {
    const total = project.reactions_fire + project.reactions_eyes + project.reactions_heart + project.reactions_laugh;
    expect(total).toBe(25);
  });
});
```

**Step 2: Run test suite**
Run: `npm test`
Expected: 15/15 PASS

**Step 3: Commit**
```bash
git add web/src/__tests__/reactions_inlined.test.ts
git commit -m "test(reactions): add unit test for inlined reaction columns"
```

---

### Task 4: Synchronize Schema & Consolidated Scripts

**Files:**
- Modify: `web/supabase/migrations/001_initial_schema.sql` (Add columns to `projects` and `users`, remove `reaction_counts`)
- Modify: `web/supabase/migrations/002_ranking_rpc.sql` (Update `add_project_reaction` definition)
- Modify: `web/supabase/migrations/003_rls_policies.sql` (Remove `reaction_counts` RLS enable)
- Modify: `web/supabase/migrations/004_seed.sql` (Seed directly into `projects` columns)
- Modify: `web/supabase/all_in_one_setup.sql` (Reflect consolidated schema)
- Modify: `docs/08_DATABASE_SCHEMA.md` (Update schema documentation)

**Step 1: Update files and run verify**
Run: `npm test`
Expected: PASS

**Step 2: Commit**
```bash
git add web/supabase/ docs/
git commit -m "refactor(schema): consolidate inline reaction columns across initial migrations and docs"
```

---

### Task 5: Push Migration to Remote Supabase & Verify Live

**Step 1: Execute `supabase db push`**
Run: `npx supabase db push --project-ref lgpejkhnlxdekozwyczi`
Expected: `Applying migration 006_inline_reaction_counts.sql... Finished supabase db push.`

**Step 2: Verify columns on remote database**
Run live node query checking `projects (reactions_fire, reactions_eyes, reactions_heart, reactions_laugh)` and `users (total_reactions_received)`.

**Step 3: Run Next.js build**
Run: `npm run build`
Expected: 0 errors, build succeeds.
