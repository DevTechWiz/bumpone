# BumpOne.lol — Production Readiness Report

**Date**: 2026-10-06  
**Scope**: Comprehensive production audit across all 10 hardening phases (Phase 0–9). Read-only review of `docs/security/*`, active implementation, migrations 020–022, and freshly executed gates. Nothing in this report is claimed without empirical execution.

---

## Executive Summary

BumpOne.lol completed a comprehensive, ten-phase hardening program: baseline audit (0), payments (1), identity/authorization (2), HTTP/API boundary (3), content/XSS/uploads (4), admin control plane + incident response (5), adversarial test suite (6), production audit (7), production residual hardening & CI automation (8), and post-cross-check truth hardening — DB-proven moderation lifecycle, migration 020/021/022, URL-change re-pending, CSP `frame-src`, lint gate, docs truth-sync (9).

**32 findings (SEC-001…SEC-032) were cataloged. 29 are fully resolved and verified, 2 are partially resolved with explicitly accepted, non-exploitable residuals, and 0 open CRITICAL, HIGH, or MEDIUM findings remain.** Only 1 low operational configuration item (SEC-029 live mode toggle in deploy variables) remains as part of standard deployment.

All gates are green, executed after all code and migration changes:

| Gate | Result |
| --- | --- |
| `npm test` | **exit 0 — 24 files, 296 tests, 0 failures** (incl. `src/__tests__/security/` adversarial suite, rewritten moderation/realtime/cookie suites) |
| `npx tsc --noEmit` | **exit 0 — 0 errors** |
| `npm run lint` | **exit 0 — 0 errors**, 6 warnings (`react-hooks/exhaustive-deps`, non-failing) |
| `npm run build` | **exit 0 — all 34 app routes built cleanly** |
| DB security suite (`supabase/tests/run-db-tests.ps1`, migrations 001–022) | **ALL DB SECURITY TESTS PASSED** (financial invariants, 5 concurrency scenarios, authorization, system_state, moderation M0–M3) |
| Dependency Audit (`npm audit`, full incl. dev) | **0 vulnerabilities** (PostCSS override `^8.5.29` + lockfile dedupe) |
| CI Pipeline (`.github/workflows/ci.yml`) | **Active GitHub Actions workflow enforcing audit + lint + secret tripwires + typecheck + build + unit tests + fresh-Postgres DB suites** |
| Distributed Rate Limiting | **Upstash Redis REST pipeline + Cloudflare WAF rulesets (`cloudflare/waf-rulesets.json`)** |

**Verdict: CONDITIONAL GO.** All code, database, authentication, realtime, moderation, and test gates are verified green in this report. GO on real traffic is conditional on the production deployment checklist below — most importantly applying migrations 020/021/022 (three separate transactions) and completing the environment/edge items.

---

## Security Posture

| Class | State |
| --- | --- |
| Findings resolved | 29 / 32 (SEC-001–014, 016–022, 024–028, 030–032) |
| Partial + accepted residual | 2 (SEC-015 UPDATE-path `auth.role()` condition — Supabase GUC, not client-writable; SEC-023 sharp-failure raw-buffer upload fallback — magic-byte validated, dimension-bounded, isolated origin) |
| Open code issues | 0 |
| Operational config items | 1 (SEC-029 deploy checklist item: set `DODO_PAYMENTS_ENVIRONMENT=live_mode` in Cloudflare production environment variables) |
| Migrations shipped (new files, 001–016 untouched) | `017` financial boundary, `018` identity boundary, `019` killswitch, `020` residual controls (rewritten Phase 9), `021` moderation default pending, `022` payments.new_rank nullable |
| Test evidence | 296 unit/adversarial tests across 24 suites + Docker DB security suites (migrations 001–022, incl. moderation M0–M3) |

Defense in depth operates at four independent layers:
1. **Edge & Middleware**: Fail-closed admin gating, Cloudflare WAF rate limiting rulesets, strict CSP + HSTS, and secure cookie transport.
2. **Route-Level Handlers**: `requireAdmin()` authentication, session verification, ownership-bound queries, distributed rate limiting with atomic Redis counters, body caps, control-character stripping, and zero-PII structured security logging.
3. **Database Layer**: Service-role-only transactional RPCs (`process_dodo_purchase`), mandatory quote matching, advisory locking, trigger-enforced authoritative fields, RLS default deny, client write revokes on `messages` and `admin_audit_log`, and explicit `auth.uid()` author binding.
4. **Output & Client Containment**: CSP blocking script execution and frame hijacking, React text escaping, and `safeExternalUrl` scheme whitelisting.

---

## Financial Security

- **Absolute Invariant**: No entity can create, alter, duplicate, or destroy Active Value or ranking except through a verified, legitimate payment.
- **Quote Integrity**: `process_dodo_purchase` (migrations 017 & 020) makes quotes mandatory, enforces exact match against `quoted_amount_minor`, respects the $10 minimum floor, validates forward-only quote states (`checkout_open`), and verifies user/project ownership before any mutation.
- **Transactional Atomicity**: Payment processing, value recalculation, rank realignment, ledger creation (`payments`), and audit journals (`board_events`, `payment_events`) occur within a single database transaction protected by `pg_advisory_xact_lock(733100, 1)`.
- **Idempotency & Replay Defense**: Webhook event IDs are uniquely constrained in `payment_events`. Advisory locks and post-lock idempotency re-checks ensure duplicate or concurrent webhook deliveries result in exactly 1 credit, returning `already_processed` safely without cache invalidation.
- **Provider Authentication**: Dodo Payments webhooks are verified using Svix/standardwebhooks HMAC-SHA256 with timestamp tolerance and timing-safe comparison. Unsigned bypasses are impossible in production.
- **Sandbox Testing**: `scripts/verify-dodo-sandbox.ts` provides a repeatable staging verification harness testing checkout creation and webhook signatures against Dodo's test environment without exposing production secrets.

---

## Authentication, Session & Authorization

- **Session Cookies (SEC-013)**: Hardened with `sameSite: 'lax'`, `secure: true` (in production), and `path: '/'` across `middleware.ts` and `src/lib/supabase/server.ts`. Client script access is shielded by CSP headers preventing token exfiltration. Server-authoritative cookies (such as anonymous reporter IDs) enforce `httpOnly: true`.
- **War Room Realtime Identity (SEC-012)**: Peer-to-peer client broadcast (`send({ type: 'broadcast' })`) has been completely removed. Clients subscribe exclusively to database `postgres_changes` on the `messages` table. Client `INSERT` permissions on `messages` are revoked in migration 020. Messages are authored exclusively through `/api/war-room/messages`, which validates session identity, derives handles and avatars directly from `users`, and forces `is_official: false` unless caller is a verified admin.
- **Admin Control Plane**: Admin authorization is fail-closed. Edge middleware blocks unauthenticated requests to `/admin` and `/api/admin/*`. Handler functions call `requireAdmin()`, validating against `ADMIN_EMAILS` or `app_metadata.role` (`admin`/`super_admin`). Client-writable `user_metadata` is completely ignored.
- **Audit Logging**: `admin_audit_log` permissions are revoked from `anon` and `authenticated`. All entries are written server-side with actor, action, reason, and structured metadata. Audit writes follow state changes to prevent phantom logs.
- **Emergency Killswitch**: The database `system_state` table enforces emergency purchase pausing. Gated in `/api/purchase/create` before any body parsing or checkout creation.

---

## Project Moderation Lifecycle (SEC-018)

- **State Machine**: Enum `project_moderation_status` supports `'pending'`, `'approved'`, and `'suspended'`. Default is `'pending'` (migration `021`; label added in `020` — applied as separate transactions).
- **Creation Flow**: New projects created via `/api/purchase/create` are inserted as `moderation_status: 'pending'`, `is_active: false`.
- **Payment Interaction**: `process_dodo_purchase` leaves pending projects in `'pending'` status upon payment. Paying for a project does not bypass moderation or place it on the public board. A pending project that is paid for is credited (ledger rows written) but never ranked (`payments.new_rank` NULL via migration `022`), never activates, and emits zero `board_events`.
- **DB-Level Proof**: `supabase/tests/13_moderation.sql` proves the lifecycle on a fresh `postgres:16` container (M0 column default; M1a–M1g pending-payment invariants incl. idempotency; M2 approved activation; M3 suspended/rejected refusal without quote consumption). Not asserted in prose — executed on every `run-db-tests.ps1` run and in CI.
- **Board Visibility**: The public board (`/api/board`), server-rendered board, and public profiles (`/api/profile/[id]`) return 404 / omit projects unless `moderation_status='approved'` **and** `is_active` (owner exception for viewing own drafts).
- **Owner URL Changes**: Changing `destination_url` on an approved project re-pends it (`moderation_status='pending'`, `is_active=false`), recalculates board ranks, and writes a `MODERATION_ACTION` security log — approved listings can no longer be swapped to arbitrary content while staying live (`/api/project/update`).
- **Admin Review**: Admins review and moderate projects via `/api/admin/moderate`, transitioning status with mandatory audit logging and automatic board rank recalculation.

---

## API Security & Distributed Rate Limiting (SEC-007)

- **Distributed Layer**: `allowRequestDistributed` in `src/lib/rateLimit.ts` integrates an atomic Upstash Redis REST pipeline (`INCR` + `PEXPIRE`), preventing rate-limit bypasses across distributed Cloudflare Worker isolates. Falls back gracefully to a bounded in-memory sliding window if Redis is unconfigured.
- **Cloudflare WAF Rulesets**: Declarative WAF rate-limiting rules defined in `cloudflare/waf-rulesets.json` enforce edge-level rate limiting on checkout (5/min), auth sync (10/min), webhooks (120/min), chat (5/30s), reactions (60/min), reports (5/hour), project updates (30/min), and admin endpoints (30/min).
- **Body Caps & Streaming Guards**: `readJsonWithLimit` enforces strict body caps (4 KB to 2.2 MB depending on route) with automatic 413/415/400 mapping. Uploads are pre-checked at 6 MB before multipart parsing.
- **Input Sanitization**: Control characters (C0, bidi, invisible unicode) are stripped from user-supplied titles, bios, display names, messages, and reports before persistence (SEC-031).

---

## Security Observability (SEC-032)

- **Structured Security Logger**: Shipped in `src/lib/securityLogger.ts`.
- **Event Standard**: Standardized JSON events: `AUTH_FAILURE`, `AUTHZ_FAILURE`, `ADMIN_ACTION`, `PURCHASE_ATTEMPT`, `PAYMENT_SUCCESS`, `PAYMENT_FAILURE`, `PAYMENT_REPLAY`, `RATE_LIMIT_EXCEEDED`, `MODERATION_ACTION`, `SUSPICIOUS_REALTIME`, `KILLSWITCH_CHANGE`, `FINANCIAL_ERROR`.
- **Zero-Secret Guarantee**: Automated recursive redaction strips passwords, bearer tokens, cookies, authorization headers, credit cards, and webhook secrets from log payloads.
- **Integrated Routes**: Active across `/api/webhooks/dodo`, `/api/war-room/messages`, `/api/purchase/create`, `/api/admin/emergency`, and `/api/admin/moderate`.

---

## CI / Security Regression Gate (SEC-028)

- **Workflow**: Implemented in `.github/workflows/ci.yml`.
- **Automated Steps**:
  1. Clean dependency installation (`npm ci`).
  2. Dependency vulnerability audit (`npm audit --audit-level=critical` — locally verified at 0 vulnerabilities full-spectrum, incl. dev).
  3. ESLint static analysis (`npm run lint` — flat config `eslint.config.mjs`; 0 errors gate).
  4. Static secret scanning tripwires (scanning for committed service keys, webhook secrets, and private keys).
  5. TypeScript compilation check (`npm run typecheck` / `tsc --noEmit`).
  6. Production Next.js build verification (`npm run build`).
  7. Vitest security and adversarial regression test execution (`npm test`).
  8. Database security suites on a fresh `postgres:16` container (`shell: pwsh` → `supabase/tests/run-db-tests.ps1`: migrations 001–022, financial invariants, concurrency scenarios, authorization, system_state, moderation M0–M3).
  9. Build-artifact secret scan (scanning `.next` for service-role keys and `whsec_` prefixes).

---

## Remaining Risks & Accepted Residuals

1. **CSP `'unsafe-inline'` for Scripts (LOW)**: Next.js App Router inline hydration scripts currently require `'unsafe-inline'`. Upgrading to strict nonces is blocked until pages are made dynamic. Mitigated by strict `object-src 'none'`, `frame-src 'self' https://accounts.google.com` (Google Identity Services button origin), `frame-ancestors 'none'` + `X-Frame-Options: DENY`, sanitized external links, and React text escaping.
2. **Supabase Auth Browser Token Access (LOW)**: Supabase `@supabase/ssr` requires client JavaScript to read auth tokens from cookies during initial page load. Mitigated by `SameSite=Lax`, `Secure=true`, path isolation, and strict CSP protection.
3. **Sharp Upload Fallback (LOW)**: In environments where native sharp binaries are unavailable, the image upload pipeline falls back to storing raw buffers on an isolated asset origin. Mitigated by magic-byte verification, content-type enforcement, and raw header dimension parsing (64–4096px bounds).

---

## Production Deployment Checklist

Before routing live production traffic:

1. **Database Migration**:
   - Apply `supabase/migrations/020_harden_production_residual_controls.sql`, `021_moderation_status_default_pending.sql`, and `022_payments_new_rank_nullable.sql` to production Supabase — **as three separate SQL transactions** (Postgres forbids using a newly added enum label in the same transaction that adds it; there is no `supabase/config.toml`, so application is manual/SQL-editor based).
   - Staging verification before GO: migrations 020+021+022 applied; enum label `'pending'` exists and is the `projects.moderation_status` default; `payments.new_rank` is nullable; `run-db-tests.ps1` prints `ALL DB SECURITY TESTS PASSED` against the same migration set.
2. **Environment Variables**:
   - `DODO_PAYMENTS_ENVIRONMENT=live_mode` (switched from `test_mode`).
   - `DODO_PAYMENTS_API_KEY`: Live production API key.
   - `DODO_PAYMENTS_WEBHOOK_KEY`: Live Svix webhook signing secret (`whsec_...`).
   - `ADMIN_EMAILS`: Authorized admin emails (comma-separated, lowercase).
   - `ANON_COOKIE_SECRET`: Strong random 32+ character secret for report tracking.
   - `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`: Configured for distributed rate limiting.
3. **Edge WAF Rules**:
   - Import or configure rate limiting rules from `cloudflare/waf-rulesets.json` in the Cloudflare Zone dashboard.
4. **Post-Deployment Smoke Verification**:
   - Verify security response headers on `/` (`Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`).
   - Verify unauthenticated `/admin` redirects to `/` and `/api/admin/overview` returns 401.
   - Verify unsigned webhook call to `/api/webhooks/dodo` returns 401.
   - Verify War Room messages require valid session.

---

## Final Recommendation

**STATUS: CONDITIONAL GO**

The platform is hardened against adversarial financial attacks, realtime spoofing, moderation circumvention, and distributed abuse. All required security controls are implemented and verified by executed gates (296/296 unit, tsc 0, lint 0, build 0, audit 0 vulnerabilities, full DB suites 001–022). GO is conditional on completing the Production Deployment Checklist above — applying migrations 020/021/022 as separate transactions, the environment variables (`live_mode`, live Dodo keys, `ADMIN_EMAILS`, `ANON_COOKIE_SECRET`, Upstash), the Cloudflare WAF rules, and the post-deploy smoke verification.
