# Endpoint Audit & HTTP Boundary Hardening — Phase 3

**Date**: 2026-10-05
**Scope**: every route handler under `src/app/api/**` (16 routes), global HTTP headers (`next.config.ts`, `src/middleware.ts`), CORS posture, error responses, cache-control posture, and the rate-limiting architecture.
**Related findings**: SEC-007, SEC-008, SEC-009, SEC-011, SEC-021, SEC-023 (see `PRODUCTION_HARDENING_LOG.md`).
**Method**: static audit of every route file + live verification against `next build` + `next start` (curl for status/header behavior, Playwright for CSP/hydration) + 23 new abuse tests (`src/__tests__/api_abuse.test.ts`).

---

## 1. Endpoint audit table

Budgets are per **window of 60 s** unless noted. "Identity" is the rate-limit key: `user.id` = per-session (unspoofable), `ip` = `CF-Connecting-IP` (falls back to first `x-forwarded-for` hop only when the CF header is absent, i.e. direct-to-origin; see §2).

| # | Route | Methods | Auth | Rate limit (key → budget) | Body cap | Request validation | Cache posture | Expensive work per hit | Primary abuse scenario → control |
| - | ----- | ------- | ---- | ------------------------- | -------- | ------------------ | ------------- | ---------------------- | -------------------------------- |
| 1 | `/api/board` | GET | public | `board:{ip}` → 240/min | n/a (query) | `sort` ∈ {power,popular,trending} → else 400; `category` matches `^[\\p{L}\\p{N} &_-]{1,50}$` → else 400; `limit` integer floor | public data; default | 1 service-role query on cache miss (cache ≤100 keys, see §6) | key-space spray → invalid values rejected before cache/DB; per-IP 240/min |
| 2 | `/api/reactions` | GET | public (session optional; `userReactions` only when signed in) | `reactions_read:{ip}` → 120/min | n/a | `projectId`/`profileId` must match `UUID_RE` → else 400 | `private, no-store` on **every** GET response (200/400/429/500) | 1–2 queries (counts + own reactions) | scraping / reaction-count enumeration → per-IP 120/min + no-store |
| 3 | `/api/reactions` | POST, DELETE | session required | `reaction_write:{user}` → 60/min (shared by POST+DELETE) | n/a | `UUID_RE` + `VALID_REACTIONS` enum → else 400; writes go through `add/remove_project_reaction_auth` RPCs (auth.uid binding, SEC-004) | mutations not cacheable | 1 RPC + 1–2 queries | reaction spam → 60/min per user |
| 4 | `/api/reports` | POST | anonymous (anon-cookie) | `report:{ip}` → **5/hour** | 16 KB (`readJsonWithLimit`) | zod: `reason` enum, `details` 10–500 chars, optional UUIDs; rejection details = **field names only** | `private, no-store` on error paths | anon-cookie HMAC + 1 insert | report spam / DoS → 5/hour per IP (CF-Connecting-IP, SEC-021) |
| 5 | `/api/purchase/create` | POST | session required | `checkout:{user}` → 5/min | 64 KB | zod: `mode` enum, UUIDs, integer amount/rank bounds, title/handle/category lengths, `imageUrl` ≤2048 | not cacheable | DB tx + Dodo API call | checkout flood → 5/min per user; `PURCHASES_PAUSED` checked **before** body read |
| 6 | `/api/uploads/image` | POST | session required | `upload:{user}` → 10/**hour** | 6 MB (`bodyTooLarge` on declared `content-length` → 413 before `formData()`) | magic-byte sniff + sharp re-encode + forced content-type (existing SEC-024 controls) | not cacheable | sharp re-encode (CPU) | memory/CPU exhaustion → size pre-check + 10/hour |
| 7 | `/api/war-room/messages` | GET | public | `war_room_read:{ip}` → 120/min | n/a | n/a (50-row limit) | default (public chat) | 1 service-role query | chat scraping → per-IP 120/min |
| 8 | `/api/war-room/messages` | POST | session required | `war_room_msg:{user}` → 5/**30 s** | 4 KB | zod: `text` 1–200 chars, `slotTag` 1–100 int | not cacheable | 1 insert + author trigger | chat flood → 5/30s per user |
| 9 | `/api/war-room/events` | GET | public | `war_room_events:{ip}` → 120/min | n/a | n/a | default (public events) | 1 service-role query | event-feed scraping → per-IP 120/min |
| 10 | `/api/profile/check-handle` | GET | public | `check_handle:{ip}` → 60/min (before any DB read) | n/a | handle `^[a-z0-9_]{2,30}$` (after `@`-strip/lowercase); `userId` must be UUID → else 400 | `private, no-store` on **every** response (caller-specific when `userId` present) | 1 query | handle enumeration → 60/min/IP + validation before DB |
| 11 | `/api/profile/[id]` | GET | public (moderation-filtered) | `profile_read:{ip}` → 120/min | n/a | path id must be UUID or `^[a-z0-9_]{1,30}$` handle → else 404 before query (SEC-020) | `private, no-store` on 200/404/429/500 | 1–2 service-role queries | profile scraping / moderated-content retrieval → 120/min + approved+active filter (Phase 2) |
| 12 | `/api/profile/update` | POST | session required | `profile_update:{user}` → 30/min | 2.2 MB | zod `ProfileUpdateSchema` (name ≤100, handle ≤50, bio ≤500, avatar ≤2 M chars, URL scheme checks via DB triggers) | not cacheable | 1–2 queries (+ trigger validation) | data-URI body flood → size cap + 30/min |
| 13 | `/api/project/update` | POST | session required (ownership in WHERE, IDOR) | `project_update:{user}` → 30/min | 7.2 MB | zod `ProjectUpdateSchema` (UUID projectId, title ≤100, URL ≤2048, image ≤7 M chars) | not cacheable | 1–2 queries | data-URI body flood → size cap + 30/min |
| 14 | `/api/auth/sync` | POST | session required | `auth_sync:{user}` → 10/min | n/a (no body) | n/a (server-derived from session) | `private, no-store` | 1 upsert | auto-provision flood → 10/min per user |
| 15 | `/api/admin/overview` | GET | `requireAdmin` (middleware + route) | `admin_overview:{user}` → 60/min | n/a | n/a | `private, no-store` | several admin queries | admin fan-out → 60/min per admin |
| 16 | `/api/admin/emergency` | POST | `requireAdmin` | `admin_emergency:{user}` → 30/min | 8 KB | zod: `paused: boolean` + `reason` 3–500 (Phase 5) | not cacheable | `system_state` upsert **then** `admin_audit_log` insert (Phase 5) | admin API abuse → 30/min; malformed body → 400 (was 500) |
| 17 | `/api/admin/moderate` | POST | `requireAdmin` | `admin_moderate:{user}` → 60/min | 8 KB | zod: UUID `projectId`, `status` enum, `reason` 3–500 | not cacheable | update + `admin_audit_log` insert | admin API abuse → 60/min |
| 18 | `/api/webhooks/dodo` | POST | **HMAC signature** (`verifyDodoWebhook`, 401 on mismatch) | none at app layer (see §2 note) | 1 MB (`bodyTooLarge` → 413 before `request.text()`) | signature over raw body; event schema parsed in `lib/dodo` | n/a (provider does not cache) | DB tx | signature-spray → HMAC check is cheap and constant-time; **WAF rule #4** (§3) covers volumetric hits; no app-level 429 to avoid throttling legitimate payment events |

Middleware additionally gates `/api/admin/*` and `/admin/*`: unconfigured-Supabase and unauthenticated requests → `401` with `Cache-Control: private, no-store` (or redirect for pages).

**Coverage statement**: all 16 route files have at least one abuse control (auth gate, rate limit, body cap, signature, or WAF rule); all 12 state-changing endpoints (POST/DELETE) have an explicit rate budget or signature; all JSON body endpoints have a size cap or documented no-body design.

---

## 2. Rate-limiting architecture (Cloudflare-appropriate)

### Decision

Three layers, chosen for how the app actually deploys (`@opennextjs/cloudflare` on Cloudflare Workers):

| Layer | What | Where | Status |
| ----- | ---- | ----- | ------ |
| 1 | **Cloudflare WAF rate-limiting rules** — volumetric, per-IP, before request reaches the Worker | Cloudflare Edge / Zone Ruleset | Declarative rules committed in `cloudflare/waf-rulesets.json` (Phase 8) |
| 2 | **Distributed rate limiter** (`src/lib/rateLimit.ts` → `allowRequestDistributed`) | Upstash Redis REST pipeline | Atomic `INCR` + `PEXPIRE` shared across isolates; graceful local fallback (Phase 8) |
| 3 | **Hardened in-process limiter** (`src/lib/rateLimit.ts` → `allowRequest`) — per-user/per-IP quotas | Every route (table above) | Implemented + tested + LRU/eviction |

The rate limiting system was hardened in Phase 3 and Phase 8:

- **Distributed ceiling via Redis**: `allowRequestDistributed(key, max, windowMs)` uses an atomic Redis pipeline (`INCR` + `PEXPIRE`), eliminating the per-isolate multiply across distributed Cloudflare Workers.
- **Edge WAF Rulesets**: `cloudflare/waf-rulesets.json` provides reproducible, exportable Cloudflare WAF rate-limiting rules covering checkout (5/min), chat (5/30s), auth sync (10/min), webhooks (120/min), reactions (60/min), reports (5/hour), and admin (30/min).
- **Eviction sweep** on write: expired entries pruned every N ops (no monotonically growing Map).
- **Hard cap** `MAX_RATE_LIMIT_KEYS = 10_000`: on overflow, oldest entries evicted first → bounded memory regardless of key spray.
- **Key design**: money/chat/write budgets key on `user.id` (attacker cannot mint identities cheaply); read budgets key on IP (attacker must rotate IPs, which layer 1 makes expensive).
- **Dev bypass**: `NODE_ENV === 'development'` → always allow (local DX); enforced in test + production (verified by tests).
- `resetRateLimits()` / `rateLimitKeyCount()` test hooks.

### Implementation evaluation

- **Distributed Redis Pipeline**: Atomic HTTP REST pipeline (`INCR` + `PEXPIRE`) requires zero node TCP socket dependencies, executing in ~10-15ms within Cloudflare Worker limits. If unconfigured or offline, it gracefully falls back to the in-process sliding window.
- **Cloudflare WAF rulesets**: Edge-level rules in `cloudflare/waf-rulesets.json` block malicious floods before Worker invocations are billed.
- **Trusting `x-forwarded-for`**: Rejected (SEC-021): `clientIp()` prefers `CF-Connecting-IP`; XFF is only the fallback for direct-to-origin requests.

### Residual (Phase 8 update)

Distributed rate limits are enforced across isolates whenever `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured, supplemented by Cloudflare WAF rulesets at the edge. If Redis is unavailable, the system safely falls back to local per-isolate budgets without dropping traffic. Deploy checklist: configure the committed WAF rules from `cloudflare/waf-rulesets.json` and set Redis credentials.

### Webhook note

`/api/webhooks/dodo` has no app-level limiter by design: the HMAC check is constant-time and cheap, the body is capped at 1 MB, and a 429 on a payment webhook would risk legitimate event loss. Volumetric protection = WAF rule #4.

---

## 3. Cloudflare WAF rate-limiting rules (zone config — manual)

These live in the Cloudflare dashboard (or Terraform), not in this repo. Configure before production traffic:

| # | Expression | Counting | Mitigation | Purpose |
| - | ---------- | -------- | ---------- | ------- |
| 1 | `http.request.uri.path in {"/api/board" "/api/profile/check-handle" "/api/profile"}` and `eq(http.request.uri.path, "/api/profile/")` covered by prefix rule below | 1 min | 300 / 5 min | Public-read scrape ceiling (backstops layer 2) |
| 2 | `starts_with(http.request.uri.path, "/api/war-room/")` | 1 min | 240 / 5 min | Chat/event read ceiling |
| 3 | `starts_with(http.request.uri.path, "/api/") and http.request.method in {"POST" "DELETE" "PATCH"}` | 1 min | 60 / 5 min | Unauthenticated write flood ceiling (per-IP; user budgets still apply in-app) |
| 4 | `eq(http.request.uri.path, "/api/webhooks/dodo")` | 1 min | 120 / 5 min | Volumetric webhook spam without touching legitimate bursts |
| 5 | `not starts_with(http.request.uri.path, "/api/")` (optional, HTML) | 1 min | 600 / 5 min | Origin-shield for prerendered pages |

Notes:
- WAF counts are per-IP at the edge → they neutralize the per-isolate multiply for IP-keyed traffic.
- Keep WAF limits **above** the in-app limits so the app's `429 + Retry-After` (which clients can act on) remains the behavior users see in normal operation; WAF `429` is the outer backstop.
- Exclusions: your own monitoring IPs / health checks if they would trip rule 5.

---

## 4. Request validation summary

- **Every JSON endpoint** parses through `readJsonWithLimit()` (`src/lib/requestGuard.ts`): declared `content-length` → **413**; header absent/lying → streamed read aborts at the cap → **413**; wrong `content-type` → **415**; malformed JSON → **400**. Verified live: `oversized=413`, `badtype=415`, `malformed=400`.
- **Binary/multipart endpoints** pre-check with `bodyTooLarge()` (uploads 6 MB, webhook 1 MB) before buffering.
- **Structural validation** is zod everywhere a schema exists (reports, checkout, profile/project update, admin emergency/moderate, war-room POST); remaining routes use explicit regex whitelists (`VALID_SORTS`, `CATEGORY_RE`, `UUID_RE`, `HANDLE_RE`, `VALID_REACTIONS`) with enumerated errors.
- **Validation failures return field-name lists only** — `zodError.flatten()` / `format()` output (which echoes attacker-supplied values) was removed from responses; server error paths never serialize `err.message` or stacks (user-facing domain messages in `/api/war-room` and checkout responses are intentional copy, not leakages).

---

## 5. Security headers (SEC-011) — implemented and verified live

Enforced **only when `NODE_ENV === 'production'`** (dev/test never blocked).

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:;
  font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co
  <project-origin>; object-src 'none'; base-uri 'self'; form-action 'self';
  frame-src 'self' https://accounts.google.com; frame-ancestors 'none'; manifest-src 'self';
  worker-src 'self'; upgrade-insecure-requests
Strict-Transport-Security: max-age=31536000; includeSubDomains   (production only)
X-XSS-Protection: 0   (modern browsers: the header's auditor mode is deprecated; 0 prevents legacy-parser quirks)
X-Frame-Options: DENY · X-Content-Type-Options: nosniff · Referrer-Policy: strict-origin-when-cross-origin · Permissions-Policy: camera=(), microphone=(), geolocation=()   (pre-existing, kept)
```

> **Phase 9 (2026-10-06)**: `frame-src` relaxed from `'none'` to `'self' https://accounts.google.com` so the Google Identity Services button can render its iframe. This is the *outbound* framing direction only — `frame-ancestors 'none'` + `X-Frame-Options: DENY` (inbound clickjacking protection) are unchanged. Asserted by `middleware.test.ts` and `api_abuse.test.ts`.

**Why `script-src` is `'self' 'unsafe-inline'` and not nonce + `strict-dynamic`** (the SEC-001 backstop we wanted): HTML pages are **prerendered at build time**; the inline `self.__next_f` bootstrap scripts (14+ per page) are baked into static bytes, so a per-request nonce generated in middleware can never appear in them, and `'strict-dynamic'` would block every script on every static page (verified: Next reads the nonce from the request header only at render time — impossible for static HTML). `'unsafe-inline'` would likewise be *ignored* if a nonce were present. What the shipped policy still blocks: cross-origin script injection, `javascript:` URLs, `<object>`, `<base>` rewriting, framing (`frame-ancestors 'none'` + `X-Frame-Options: DENY`), cross-origin form posts, `http:` subresources, and non-`self` `connect-src`.

**Upgrade path (tracked as SEC-011 residual)**: `export const dynamic = 'force-dynamic'` in the root layout → nonce + `'strict-dynamic'` becomes viable → real inline-script backstop. Deliberately not taken: it converts all static HTML to per-request SSR, which needs a Workers CPU budget review first.

**Live verification (this phase)**:
- `curl -D` on `/`: CSP + HSTS present, exact directives above.
- Playwright, production server: page title/board render, **0 console errors**, controlled search input accepts input (hydration healthy) → no CSP regressions.
- Negative check performed: with the nonce variant, `nonceAttrs=0` on static HTML → page would have been bricked (that is why the policy shape changed before shipping).

---

## 6. CORS, errors, cache — audit results

- **CSP** (§5) · **HSTS** (§5) · **error leakage** (§4) · **rate limits** (§1–2).
- **CORS**: no `Access-Control-Allow-*` header exists anywhere in `src/` (grep-verified), and no route reflects an `Origin`. Decision: **keep CORS absent** — the API is same-origin-only (cookies + `SameSite=Lax`); adding any `Access-Control-Allow-Origin` would widen the credentialed surface for zero product need. Documented posture: cross-origin XHR/FDCORS requests are simply not authorized to read responses.
- **Cache audit**: responses that can differ per caller now carry `Cache-Control: private, no-store`:
  - `/api/reactions` GET — all paths (200/400/429/500) [userReactions is session-specific].
  - `/api/profile/[id]` GET — all paths (200/404/429/500) [moderation/session-dependent].
  - `/api/profile/check-handle` GET — all paths [caller-specific when `userId` present].
  - `/api/auth/sync` POST, `/api/admin/overview` GET, middleware admin 401 JSONs.
  - Mutation responses (POST/DELETE) are not cacheable by intermediaries by definition; GET error paths on public routes (board/war-room) intentionally left as-is (public data, no per-caller content).
- **Board cache bounds (SEC-009)**: `setBoardCache()` enforces `MAX_CACHE_ENTRIES = 100` (expired-first, then oldest); invalid `sort`/`category` → 400 before cache/DB, so key spray cannot grow the Map.

---

## 7. Abuse tests (new: `src/__tests__/api_abuse.test.ts`, 23 tests)

| Area | Assertions |
| ---- | ---------- |
| Limiter hardening | window expiry; concurrent-key spray hits cap with oldest-first eviction; `resetRateLimits`; dev bypass only under `development` |
| `clientIp` | `CF-Connecting-IP` wins over `x-forwarded-for`; XFF first hop fallback |
| `readJsonWithLimit` | 413 (declared), 415 (wrong content-type), 400 (malformed/empty) |
| Board | invalid `sort`/`category` → 400 (and never reach DB); valid → 200; cache never exceeds 100 entries under key spray |
| Checkout flood | 6th request in a minute → 429; different users have independent budgets |
| Reactions | 61st write/min → 429 (shared POST+DELETE budget) |
| Chat POST | 6th message/30 s → 429 |
| Reports | 6th/hour → 429; XFF spoof does **not** reset the CF-Connecting-IP key; malformed JSON → 400 |
| Admin | malformed emergency body → 400 (previously 500) |
| CSP | absent outside production; in production: exact directives, **no** `nonce-`/`strict-dynamic`, `upgrade-insecure-requests`, `img-src` keeps `https:` |

Plus **live** checks against `next start` (this phase): `413/415/400` body guards; reports → `429` on 6th; reactions GET → exactly `120×200` then `429`; `private, no-store` present on reactions 200/400 and profile 404; Playwright console clean with enforced CSP.

---

## 8. Gate results (Phase 3)

| Command | Result |
| ------- | ------ |
| `npm test` (`vitest run`) | exit 0 — **15 files, 142 tests, 0 failures** (119 → 142: +23 abuse tests) |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` (`next build`) | exit 0 — compiled successfully |
| `next start` + curl/Playwright | CSP/HSTS live, hydration healthy, 0 console errors, 413/415/400/429 behaviors verified |
| `powershell -ExecutionPolicy Bypass -File supabase\tests\run-db-tests.ps1` | exit 0 — ALL DB SECURITY TESTS PASSED (no migrations in Phase 3; suite still run as gate) |
| ESLint / `npm run lint` | **not available** — no eslint dependency or lint script exists (SEC-028) |

---

## 9. Content & XSS audit (Phase 4)

Full write-up in `PRODUCTION_HARDENING_LOG.md` (Phase 4 section). Audit table:

| Sink / surface | Result | Mechanism verified |
| -------------- | ------ | ------------------ |
| `dangerouslySetInnerHTML` (site-wide) | **safe** — exactly one site, static JSON-LD (WebSite/Organization, no user data) | `src/app/layout.tsx:186` |
| `destination_url` → `href`/`window.open` (4 render sites) | **hardened** — read-time `safeExternalUrl()` (https-only) at all 5 read sites; renderers guard `''` | SEC-001 Resolved (Phase 4) |
| Server-side fetches of user URLs (SSRF) | **none in-app** — all 23 `fetch()` calls are same-origin `/api/...`; dodo/R2 SDKs use fixed endpoints; `image_url` is passed to Dodo, never fetched by us | repo-wide fetch audit |
| Social metadata (`generateMetadata` on share/project) | **safe** — titles/descriptions render as React elements → HTML-escaped | `next/dist/lib/metadata/generate/basic.js:98` |
| Moderation bypass via `/project/[id]` + `/share/[id]` | **closed** — `is_active` + `moderation_status='approved'` filters added (profile API already had it) | SEC-006 parity |
| PostgREST `.or()` handle filters (getProject, share) | **closed** — `UUID_RE`/`HANDLE_RE` validated pre-construction | SEC-020 addendum |
| Chat messages / report details | **hardened** — control/bidi chars stripped before length validation; React text rendering as base | `contentSchemas.ts`, `textSanitize.ts` |
| Upload pipeline | **hardened** — auth, 10/h, 6 MB pre-check + 5 MB cap, MIME allowlist, magic bytes, sharp `limitInputPixels` + 64–4096 bounds, **header-dimension bounds in the sharp fallback**, uuid filenames, sanitized R2 keys, `immutable` caching, re-encode strips metadata | `uploads/image/route.ts`, `imageDimensions.ts` |
| `purchase/create` `imageUrl` scheme | **hardened** — `IMAGE_RE` refine (https or data:image), aligned with DB trigger | SEC-022 Resolved |
| `checkout_url` navigation | **hardened** — https or same-origin only | SEC-025 Resolved |
| `auth/callback?next=` (open redirect) | **safe (pre-existing guard)** — must start with `/`, `//` rejected, always origin-prefixed | `auth/callback/route.ts:9` |
| Query-param sinks (`sort`, `category`, `limit`, `projectId`, `handle`) | **safe** — whitelists/regex/UUID validation from Phases 2–3; no param flows into HTML/JS sinks | route code |
| Profile `website`/`twitter`/`github` hrefs | **safe** — `startsWith('http') ? raw : 'https://'+raw` neutralizes script schemes; socials appended to fixed hosts | `ProfileView.tsx:1398` |
| Rendered titles/bios/handles (React text) | **safe** — escaped by React everywhere (no raw HTML sinks found) | repo-wide sink audit |

---

## 10. Gate results (Phase 4)

| Command | Result |
| ------- | ------ |
| `npm test` | exit 0 — **16 files, 164 tests, 0 failures** (+22 content-safety tests) |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| `next start` live checks | `/share/<handle>`, `/share/@<handle>`, `/share/%40<handle>`, `/share/<uuid>`, `/project/<handle>` → 200; malformed handles → 404; `/api/board` linkUrl = normalized https; CSP present |
| DB suite | ALL DB SECURITY TESTS PASSED (3rd attempt — transient container startup race; no data failures) |

---

## 11. Admin control plane (Phase 5)

| Endpoint / surface | AuthZ | Rate limit | Validation | State written | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET /api/admin/overview` | middleware session + `requireAdmin` | 60/min/admin | n/a | none (read-only) | `private, no-store`; `purchasesPaused` = env OR `system_state` |
| `POST /api/admin/moderate` | middleware session + `requireAdmin` | 60/min/admin | zod UUID/status/reason | `projects` update → `recalculate_board_ranks` → `admin_audit_log` (with `metadata`) | unknown project → **404** with no audit/rank side effects |
| `POST /api/admin/emergency` | middleware session + `requireAdmin` | 30/min/admin | zod `paused` + `reason` 3–500 | `system_state` upsert → `admin_audit_log` (reason + `metadata`) | state change **before** audit; state failure → 500, no audit row |
| `/admin` page | middleware session; data gated by `requireAdmin` 403s | n/a | client min-3 reason | none directly | reloads server truth after toggle (no optimistic flip) |
| `requireAdmin` (`src/lib/adminAuth.ts`) | — | — | — | — | `ADMIN_EMAILS` (trim/lower) OR `app_metadata.role`; `user_metadata` never read; fail-closed 401/403 |
| `admin_audit_log` | service-role insert only (no update/delete API) | — | — | append-only | RLS enabled, zero policies → invisible/immutable to anon+authenticated (suite 11 C2; no delete policy) |
| `system_state` (killswitch, 019) | service-role only | — | — | `purchases_paused` | RLS zero policies: anon/authenticated → 0 rows read, 0-row update, insert denied (suite 12); env `PURCHASES_PAUSED` ORed first |

Public surfacing: `GET /api/board` reports `purchasesPaused` from the same helper (15 s cache + `s-maxage=15` display lag; enforcement fresh per-request in `purchase/create` → 503).

## 12. Gate results (Phase 5)

| Command | Result |
| ------- | ------ |
| `npm test` | exit 0 — **17 files, 191 tests, 0 failures** (+27 admin control-plane tests) |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| DB suite | ALL DB SECURITY TESTS PASSED — migrations 001–019 (new `019` killswitch), `12_system_state.sql` 10/10 (RLS matrix + service-role path + trigger) |
| Secrets audit | no `.env` in tree **or git history** (only placeholder `.env.example`); no secret names in `.next/static` client assets; no secret logging in `src/`; `wrangler.jsonc` carries only the public anon key |

## 13. Adversarial suite & gates (Phase 6)

New `src/__tests__/security/` — 6 files, 83 tests (brief categories → suite):

| Category | Suite | Key invariants |
| --- | --- | --- |
| Financial attacks | `financial.test.ts` | forged/modified webhook → no credit, no cache invalidation, **route never touches tables**; DB RPC is the only credit authority; refund/dispute ignored |
| Race conditions | `concurrency.test.ts` | 10× checkout → exactly 5 pass limiter; 10× duplicate webhook → exactly 1 credit; parallel moderation → 2 audits, state-before-audit; 70-reaction flood → 60 RPC/10 blocked |
| Authorization bypass | `authorization.test.ts` | 8-route unauth matrix → 401 **with zero service-role contact**; role-forgery/lookalike-email matrix → 403 pre-DB; RPC identity bound to session, not body |
| API abuse | `api_abuse.test.ts` | hostile amounts/ranks/reasons/protocols → 400/413/415 with **no table work**; board limit clamp asserted on the actual query args |
| Content injection | `content.test.ts` | SEC-031 strip on profile/purchase/admin write payloads; control-only → 400 pre-DB; audit reasons clean + ordering |
| Database attacks | `database.test.ts` | migration tripwires (017 quote/amount/floor/idempotency, 018 `auth.uid()` + revokes, 019 & 003 RLS-zero-policies, 001 field-protection trigger); runtime invariants remain in `supabase/tests/01–12` |

SEC-031 fixed in the same phase (strip-then-pipe on `bio`/`display_name`/`title`/admin `reason`).

### Gate results (Phase 6)

| Command | Result |
| ------- | ------ |
| `npm test` | exit 0 — **23 files, 274 tests, 0 failures** (+83 security-suite tests) |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| DB suite | ALL DB SECURITY TESTS PASSED — migrations 001–019 |
