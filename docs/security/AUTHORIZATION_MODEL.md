# BumpOne — Authorization Model

**Status**: verified 2026-10-05 (Phase 2). Companion to `PRODUCTION_HARDENING_LOG.md` (findings/fixes) and `FINANCIAL_SECURITY.md` (money invariants).
**Scope**: how every request is authenticated, how every table/row/column write is authorized, and which test proves each rule. Migrations 001–018; DB suite `supabase/tests/` (10 + 11).

---

## 1. Authentication architecture

| Element | Implementation | Notes |
| --- | --- | --- |
| Identity provider | Supabase Auth (email magic link, Google OAuth, One-Tap) | No local password storage |
| Session transport | `@supabase/ssr` cookies (`createBrowserClient` / `createServerClient`) | Cookies are **not HttpOnly** (library default; accepted trade-off — SEC-013) with `SameSite=Lax`; CSP (SEC-011) is the planned backstop |
| Session refresh | `src/middleware.ts` | Refresh only + admin path policy (below) |
| Edge gating | `src/middleware.ts` | Unauthenticated → `/api/admin/*`: 401 JSON; `/admin`: redirect `/`; session/env failure → **fail closed** (deny) |
| Admin model | `requireAdmin()` (`src/lib/adminAuth.ts`) | `ADMIN_EMAILS` env match **or** `app_metadata.role === 'admin'`; no admin DB table (dropped in 013). Mandatory second layer on every admin handler — the edge is defense-in-depth, not the boundary |
| Server trust | Route handlers verify the session with `supabaseAdmin.auth.getUser()` (or equivalent) before acting | Client-supplied ids/roles are never trusted |
| Service role | `SUPABASE_SERVICE_ROLE_KEY`, server-only | Never in `NEXT_PUBLIC_*` or client bundles (verified); bypasses RLS — used only behind session/ownership checks or for signed-webhook paths |

## 2. Authorization layers (defense in depth)

Every write passes through as many of these as apply; a failure at any layer stops the write:

1. **Edge middleware** — authentication presence for `/admin` and `/api/admin/*` (fail closed).
2. **Route handler** — session verification, payload validation (zod), **ownership in the WHERE clause** (`.eq('id', …).eq('user_id', session.id)` → 404 on miss), business pre-checks (handle cooldown, uniqueness, scheme allowlists).
3. **PostgreSQL grants (privileges)** — table/column-level `GRANT`/`REVOKE` (e.g. `018` revokes client DML on `users`/`projects` outright).
4. **Row Level Security** — per-table policies; no policy of the matching type ⇒ no access.
5. **Triggers** — identity binding in RPCs, server-authoritative stamping, scheme/format/cooldown validation, author spoofing prevention, financial immutability (Phase 1).
6. **Constraints** — CHECK/UNIQUE/FK (e.g. `chk_payments_currency_usd`, one payment per quote).

**Key RLS semantic** (proven in suite 11): with RLS enabled and *no policy of the matching type*, an UPDATE/DELETE affects **0 rows silently** (no error); INSERT fails with `42501`; table/column grant absence fails with `insufficient_privilege` *before* RLS. Routes therefore rely on ownership-scoped WHERE + explicit checks, not on RLS raising errors.

## 3. Principals

| Principal | Identity | Reachable from |
| --- | --- | --- |
| `anon` | public key, no session | Browser; read-mostly; RPC execute denied for reaction functions |
| `authenticated` | valid Supabase JWT (`sub` = user id) | Browser with session; grants below; `auth.uid()` derived from verified claims by PostgREST |
| `service_role` | server-only key | Next.js route handlers, webhook path; exempt from reaction identity binding; RLS bypass in production |
| `postgres` (owner) | DB owner | Migrations, triggers (SECURITY DEFINER), test harness |
| Admin | **not a DB role** | `ADMIN_EMAILS` / `app_metadata.role` checked in app code only |

## 4. Per-table authorization matrix (current, 001–018)

Client grants below reflect **production Supabase defaults** (ALL privileges to `anon`/`authenticated` minus explicit revokes in 003/016/018); the harness mirrors them in `11_authorization.sql` setup. “Deny” under RLS means no policy of that type.

| Table | RLS | SELECT policy | INSERT | UPDATE | DELETE | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `categories` | on | public `using (true)` | deny (no policy) | deny | deny | read-only reference data |
| `users` | on | public `using (true)` | **grant revoked** (018) — signup goes through `handle_new_user` trigger | **grant revoked** (018) — profile writes via `POST /api/profile/update` (service_role, `.eq('id', session.id)`); 003 self-policies remain but are unreachable | **grant revoked** (018) | No client DML at all; fields enforced by `trg_enforce_user_profile_fields` |
| `projects` | on | public: `approved and is_active`; authenticated: own row any status | **grant revoked** (018) + INSERT trigger guard (017) + default `'pending'` (020) | **grant revoked** (018) — metadata via `PATCH /api/project/update` (ownership WHERE → 404); 003 owner policy unreachable | **grant revoked** (018) | Authoritative fields additionally trigger-protected (001/017); metadata enforced by `trg_enforce_project_metadata` (018); moderation status state machine (020) |
| `purchase_quotes` | on | authenticated: own rows (`auth.uid() = user_id`) | deny | deny (suite C6: 0 rows; commercial terms immutable via 017 trigger for holders of a grant) | deny | Created/consumed only by server RPCs |
| `payments` | on | authenticated: own rows | deny (server only) | deny (017 immutability trigger) | deny | Ledger; service_role inserts only |
| `payment_events` | on | **no policy — deny-all** | deny | deny (append-only trigger, 017) | deny | Idempotency ledger; service_role only |
| `board_events` | on | public `using (true)` | deny | deny | deny (suite C13: 0 rows) | Public audit journal; written by RPCs |
| `reactions` | on | **no policy — deny-all** (counts read from inline columns on `projects`/`users`) | RLS deny (suite C5) — only via identity-bound RPCs | deny | deny | Direct table access not used by the app |
| `messages` | on | public: `is_deleted = false` | **grant revoked** (020) — client writes routed strictly via `POST /api/war-room/messages` (service_role) | deny (suite C12b: 0 rows) | deny | `trg_populate_message_author` overrides `user_id = auth.uid()` and forces `is_official = false` (020); direct client INSERT blocked at privilege layer (020) |
| `reports` | on | **no policy — deny-all** (suite C3) | RLS deny (suite C4); route uses service_role | deny | deny | Reported via `POST /api/reports` (service_role insert) |
| `admin_audit_log` | on | **no policy — deny-all** (suite C2) | **grant revoked** (020) — written by service_role only | **grant revoked** (020) | **grant revoked** (020) | Written by server code only; client privileges completely revoked (020) |

Dropped tables (013, not in matrix): `admin_users`, `reaction_counts`, `system_state`.

**Column-level grants** (beyond table revokes): `messages` insert restricted to 4 columns (003); `016` re-scoped projects update columns and **`018` then revoked client UPDATE on both `users` and `projects` entirely**, so the column lists are now vestigial.

**Realtime publication** `supabase_realtime`: `projects`, `board_events`, `messages` only — `users` removed in 018 (SEC-024; suite 11 F1/F2).

## 5. API route authorization rules

| Route | AuthN | Ownership / authorization | Input validation |
| --- | --- | --- | --- |
| `GET /api/profile/[id]` | optional session | moderated/inactive rows → 404 unless session user owns the row | id UUID regex; handle `^[a-z0-9_]{1,30}$` before `.or()` filters (SEC-006/020) |
| `POST /api/profile/update` | required | `service_role` update with `.eq('id', session.id)` — cross-user target impossible | zod partial schema; handle format + 30-day cooldown + uniqueness → 400/409; website `https://`; avatar scheme allowlist |
| `PATCH /api/project/update` | required | `WHERE id = :id AND user_id = :session.id` → **404** on miss (IDOR-safe) | zod: title ≤100, `destination_url` `https://`, `image_path` `https://` or `data:image/(png\|jpeg\|webp);base64,`; trigger errors mapped |
| `GET/POST/DELETE /api/reactions` | GET public; writes required | RPC binds `p_user_id` to `auth.uid()` (or service_role) | UUID validation on all ids → 400 |
| `POST /api/reports` | required | service_role insert; reporter = session | targetId UUID → 400 |
| `POST /api/purchase/create` | required | quote `user_id` filter = session user → 403 otherwise; draft project inserts as `'pending'`, `is_active: false` (020) | zod + server-computed price floor (Phase 1) |
| `POST /api/war-room/messages` | required | author identity derived strictly from session user and `users` table; `is_official: false` enforced unless verified admin | zod: 1–200 chars, control-char strip (SEC-031); rate limit 5/30s (distributed + local); spoofing attempts logged via `securityLog` |
| `POST /api/auth/sync` | required | syncs the **session user only** (`.eq('id', session.id)`) | generic `Sync failed` on 500 (SEC-019) |
| `/api/admin/*` | `requireAdmin()` (+ edge 401) | admin only | — |
| `POST /api/webhooks/dodo` | Svix HMAC signature | service_role RPC only | fail-closed verification (Phase 1) |

## 6. RPC / SECURITY DEFINER trust boundary

| Function | Callable by | Binding / rules | Suite |
| --- | --- | --- | --- |
| `process_dodo_purchase` | `service_role` only | Phase 1 invariants (quote mandatory, exact amount, advisory lock) | 10 + concurrency |
| `add_project_reaction_auth` / `remove_project_reaction_auth` (and user variants) | `authenticated` (own uid) or `service_role` (any uid) | `p_user_id null` → `42501`; `auth.uid() distinct from p_user_id` → `42501` | 11-A (A1–A4) |
| Legacy `add/remove_project_reaction`, `add/remove_user_reaction` (006) | **dropped** (018) | — | 11-A5 (absent), A6 (anon EXECUTE denied) |
| Trigger functions (`set_updated_at`, `populate_message_author`, `handle_new_user`, `protect_project_authoritative_fields*`, `enforce_*`) | `service_role` only (EXECUTE revoked from `public`/`anon`/`authenticated`; `security definer`; `search_path = public, pg_temp`) | Fire inside definer/owner context | 11-G |

## 7. DB-side validation triggers (identity & metadata)

| Trigger | Table | Enforces | Error |
| --- | --- | --- | --- |
| `trg_enforce_user_profile_fields` (018) | `users` (UPDATE only) | handle `^[a-z0-9_]{2,30}$`; 30-day handle cooldown with **server-stamped** `handle_last_changed_at`; stamp tamper revert when handle unchanged; website must be `https://` **when changed** (legacy values survive unrelated edits) | `23514` check / `55000` cooldown |
| `trg_enforce_project_metadata` (018) | `projects` (INSERT or UPDATE, change-aware) | `destination_url` `^https://`; `image_path` `^https://` or `data:image/…;base64,`; title non-empty ≤100; handle format on change | `23514` |
| `trg_populate_message_author` (003) | `messages` (INSERT) | `author_name`/`author_handle` from `users`; `is_official` forced false unless service_role/owner | — |
| `trg_protect_project_fields` / `_insert` (001/017) | `projects` | authoritative/financial fields only by service_role | exception |
| `trg_purchase_quotes_integrity`, `trg_payments_immutability`, `trg_payment_events_append_only` (017) | money tables | immutability / state machine | exception |

## 8. Test coverage map

| Rule | Proven by |
| --- | --- |
| Reaction identity binding, legacy RPCs gone, anon EXECUTE denied | `11_authorization.sql` §A |
| No client DML on `users`/`projects` (grant layer) | §B (B1–B4); `authorization_security.test.ts` (API layer) |
| Full RLS matrix incl. own-vs-other (IDOR at row level), spoofed author, silent 0-row semantics | §C (C0–C13) |
| Handle format / cooldown / stamp / website schemes | §D (D1–D6); `authorization_security.test.ts` |
| Project metadata scheme/title/handle triggers | §E (E1–E4) |
| Realtime publication membership | §F |
| Trigger-function hygiene (search_path, EXECUTE) | §G |
| Moderation filter + owner exception + filter-injection | `authorization_security.test.ts` (profile) |
| Middleware fail-closed admin gating | `middleware.test.ts` (7 cases) |
| Session-scoped reaction RPC + UUID validation | `authorization_security.test.ts` (reactions) |
| Ownership 404 / cooldown / uniqueness / schemes on new APIs | `authorization_security.test.ts` (profile/project update) |

Runner: `powershell -ExecutionPolicy Bypass -File supabase\tests\run-db-tests.ps1` — fresh `postgres:16-alpine` → shim → 001→018 → seed → §10 financial → 5 concurrency scenarios → verify → **§11 authorization (A–G + FINAL)**.

## 9. Operational notes

1. **Deploy order**: migration `018` first, then app code (cooldown stamping is DB-side; the API pre-check reads it). Code alone against a pre-018 DB leaves client grants intact — ship both together.
2. **Shim vs production**: the suite approximates `auth.uid()`/`auth.role()` via `request.jwt.claims` and mirrors Supabase default grants explicitly (production has `ALTER DEFAULT PRIVILEGES`; the harness does not — see SEC-027). Run once against staging Supabase before relying on this as prod proof, including the `ALTER PUBLICATION … DROP TABLE` step.
3. **Future tables**: enable RLS + add explicit policies + consider `alter default privileges … revoke` (SEC-027); new trigger functions need `search_path = public, pg_temp` + EXECUTE revoked from client roles and granted to `service_role` (pattern in 018).
4. **Resolved & Residual Items**: SEC-012 (War Room broadcast spoofing) **resolved Phase 8** (client broadcast removed, `postgres_changes` on messages, client insert revoked in 020); SEC-013 (cookies) **mitigated Phase 8** (SameSite=Lax, Secure=true, strict CSP token shield); SEC-018 (project moderation lifecycle) **resolved Phase 8** (pending default, RPC preserves pending, board/profile filtering, 020); SEC-005 (kill switch) **resolved Phase 5**; SEC-022 (`purchase/create` imageUrl scheme) **resolved Phase 4**; SEC-011 residual (CSP `'unsafe-inline'` retained for Next.js hydration scripts).
