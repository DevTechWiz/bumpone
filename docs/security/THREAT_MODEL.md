# BumpOne Threat Model

Companion to [PRODUCTION_HARDENING_LOG.md](PRODUCTION_HARDENING_LOG.md). Scope: worldwide production, financially adversarial users. Date: 2026-10-05 (Phase 0 baseline).

---

## 1. Assets

| Asset | Value | Impact if compromised |
| --- | --- | --- |
| **Ranking integrity** (`projects.current_active_value_minor`, `ranking_sequence`, `current_rank`, `board_events`) | Core product truth; money determines order | Platform loses credibility; financial disputes; legal exposure |
| **Payment ledger** (`payments`, `payment_events`, `purchase_quotes`) | Source of revenue and audit trail | Double-crediting, forged revenue, chargeback fraud, irreversible money movement |
| **Dodo webhook endpoint** | Sole trust root for crediting value | Full board takeover if forgeable/replayable |
| **Service-role key** (`SUPABASE_SERVICE_ROLE_KEY`) | Bypasses all RLS; only path into money RPC | Total database compromise |
| **Admin control plane** (`requireAdmin`, `ADMIN_EMAILS`, `app_metadata.role`, `admin_audit_log`) | Moderation, kill switch, audit | Content abuse, silent pause tampering, evidence destruction |
| **User accounts** (Supabase Auth sessions, cookies) | Identity for ownership, purchases, reactions | Squatting, fraud purchases, reaction forgery |
| **Creator content** (titles, handles, links, images, chat) | Rendered to all visitors | XSS, phishing, brand damage, illegal content distribution |
| **R2 bucket / asset origin** (`assets.bumpone.lol`) | Served images for all visitors | Malware hosting, stored XSS if origin misconfigured |
| **Availability of `/api/board`** | The product surface | Downtime = no purchases, reputational loss |
| **Secrets/config** (Dodo API key + webhook secret, R2 keys, `ANON_COOKIE_SECRET`, `CRON_SECRET`) | Gateway and storage trust | Payment API abuse, forged webhooks, storage takeover |

---

## 2. Attackers

| Adversary | Capability | Motive |
| --- | --- | --- |
| **Anonymous visitor** | Unlimited requests via public endpoints; anon Supabase key (public by design); browser JS | Disruption, defacement, free rides |
| **Authenticated free user** | Supabase session, direct PostgREST access under RLS/grants, RPCs granted to `authenticated`, realtime subscriptions | Climb the board without paying; reaction manipulation |
| **Paying competitor** | Everything above + quote creation; financial resources | Buy rank, grief rivals by front-running quotes, target specific projects |
| **Malicious creator** | Owns project rows; content fields; destination links | Phishing/XSS against visitors; SEO spam; impersonation |
| **Automation/bot operator** | Multi-account signup (OAuth/magic link), distributed IPs, parallel Workers isolates | Bulk squatting, chat spam, rate-limit bypass, cache/rate-limit memory exhaustion |
| **Webhook attacker** | Can POST to `/api/webhooks/dodo`; may observe valid payloads if secret leaks | Forge credits, replay events |
| **Privileged insider / compromised admin account** | Admin email or `app_metadata.role` | Manipulate moderation, forge audit entries |
| **Supply-chain attacker** | npm dependencies, compromised package updates | Backdoor builds (build-time) |
| **Network attacker** | MITM, downgrade, DNS manipulation | Session theft, checkout interception |

---

## 3. Trust Boundaries

```
Browser (UNTRUSTED: all inputs, all JS, all headers)
   │  every value manipulable; frontend protects nothing
   ▼
Cloudflare (semi-trusted: WAF, bot rules, cache, IP attribution via CF-Connecting-IP)
   │  request shape still attacker-controlled; rate limits per-isolate behind it
   ▼
Next.js middleware (session refresh + path gating — fail-closed on `/api/admin/*` + `/admin` since Phase 2; SEC-017 resolved)
   │
   ▼
Next.js API routes (TRUSTED CODE, but 11/14 use service_role → RLS bypassed;
   │  route logic is the sole authorization layer — see `AUTHORIZATION_MODEL.md`)
   │  trusts: Supabase session (verified server-side), request JSON (Zod on some routes)
   │  untrusted: everything else (query params, headers, bodies on unvalidated routes)
   ▼
Supabase PostgREST / RPC layer
   │  trusts: service_role key (server-only), anon key + JWT (client-direct access
   │           possible with column grants — clients CAN write title/handle/URL — SEC-010)
   ▼
PostgreSQL (RLS + column grants + triggers + CHECK constraints = last line of defense)
   │  trusts: SECURITY DEFINER RPCs (must not trust caller params blindly — SEC-003/004)
   ▼
Dodo Payments (TRUSTED ONLY AS FAR AS THE SIGNATURE: HMAC over raw body, 5-min window;
   │            event metadata is attacker-influenced only if the secret leaks — SEC-002)
   ▼
Cloudflare R2 (push-only from server; separate origin; content-type enforced)
   ▼
Supabase Realtime (RLS-filtered reads for anon; broadcast channel ELIMINATED
                   — War Room uses authoritative postgres_changes on messages;
                   direct client INSERT revoked via migration 020 — SEC-012 RESOLVED)
```

**Rule of thumb for future phases:** data originating from the browser is untrusted until validated inside a route handler or a database constraint; data originating from a signed Dodo webhook is trusted for *authenticity* but not for *shape*; RPC parameters are untrusted even from the app server.

---

## 4. Attack Surfaces

### Pages (public unless noted)
`/`, `/profile/[id]`, `/project/[id]`, `/share/[id]`, `/contact`, `/privacy`, `/terms`, `/refund`, `/robots.txt`, `/sitemap.xml`, `/opengraph-image`, `/manifest.webmanifest`, `/auth/callback` (code exchange + `next` redirect), `/admin` (client UI unguarded; data APIs enforce `requireAdmin`).

### API endpoints

| Endpoint | Auth | Rate limit | Validation | Notes |
| --- | --- | --- | --- | --- |
| `GET /api/board` | none | none | `limit` clamped; `sort`/`category` free-form | service_role; unbounded cache keys (SEC-009) |
| `GET /api/profile/[id]` | none | none | UUID regex / unvalidated handle | no moderation filter (SEC-006); `.or()` injection (SEC-020) |
| `GET /api/profile/check-handle` | none | none | handle format checked; `userId` raw | enumeration |
| `POST /api/purchase/create` | session | 5/min/user (in-memory) | Zod | money path; client-set amount with floor only (see §5) |
| `POST /api/webhooks/dodo` | Svix HMAC + 5-min tolerance | n/a | manual integer checks; no `>0` check (SEC-028/RPC) | raw body verified; dev bypass SEC-002 |
| `GET/POST/DELETE /api/reactions` | GET none; POST/DELETE session | POST 60/min/user; DELETE none | reaction whitelist; no UUID check | RPCs trust `p_user_id` (SEC-004) |
| `POST /api/auth/sync` | session | none | n/a (no input) | leaks `err.message` (SEC-019) |
| `GET/POST /api/war-room/messages` | GET none; POST session | POST 5/30s/user | Zod 1–200 chars | `is_official` enforced DB-side |
| `GET /api/war-room/events` | none | none | n/a | exposes destination_url of events |
| `POST /api/reports` | none (anonymous by design) | 5/hour/IP (spoofable key) | Zod | keyed IP hash (SEC-021) |
| `POST /api/uploads/image` | session | 10/hour/user | MIME + magic bytes + dims + sharp | buffers body first (SEC-008) |
| `GET /api/admin/overview`, `POST /api/admin/moderate`, `POST /api/admin/emergency` | `requireAdmin()` (env allowlist OR `app_metadata.role`; `user_metadata` never trusted) | 30–60/min/admin | Zod (moderate + emergency require `reason`) | emergency pause is runtime-backed via `system_state` + env killswitch (SEC-005 resolved, Phase 5) |

### Webhooks / callbacks / redirects / integrations
- `POST /api/webhooks/dodo` (Svix/standardwebhooks) — the single money ingress.
- `GET /auth/callback` — code exchange; `next` restricted to same-origin paths (verified no open redirect).
- Dodo Hosted Checkout `return_url` → `/?status=pending_payment&quote_id=…` (client-side, informational only).
- OAuth: Google (client id public in `wrangler.jsonc`), Supabase magic link; OAuth `redirectTo` fixed to `/auth/callback`.
- External: Supabase (DB/Auth/Realtime), Dodo API (outbound), R2 S3 API (outbound), Unsplash images (static allowlist).

### Realtime channels
- `postgres_changes` on `projects` (RLS: approved+active), `board_events` (public), `messages` (public non-deleted).
- Direct client broadcast channel `war_room` was completely removed (SEC-012 resolved). Chat streaming relies solely on server-written `postgres_changes`.
- Not published: `users` (dropped in 018), `payments`, `purchase_quotes`, `payment_events`, `reports`, `admin_audit_log`.

### Authentication surface
Magic link, Google OAuth, Google One-Tap, session cookies (`SameSite=Lax`, `Secure=true`, path `/`, protected by strict CSP — SEC-013), `POST /api/auth/sync` provisioning, `users` row updates strictly via validated API `/api/profile/update` (client direct writes revoked in 018), admin via `ADMIN_EMAILS`/`app_metadata.role`.

---

## 5. Financial Attack Scenarios

| # | Scenario | Existing control | Residual risk |
| --- | --- | --- | --- |
| F1 | Forge `payment.succeeded` without paying | Svix HMAC + timing-safe + 5-min window; prod fail-closed | SEC-002 dev bypass; secret leakage = total loss |
| F2 | Replay a valid webhook | event-id idempotency + `payment_events` unique + quote single-use + `provider_payment_id` unique | SEC-014 TOCTOU surfaces as 500s, not double-credit (verified constraint backstop) |
| F3 | Pay less than quoted | RPC amount == quote amount (`014:63`) | quote-less path (SEC-003) skips this entirely |
| F4 | Manipulate quoted amount pre-checkout | amount = client `topUpAmount` but floor enforced server-side (`purchase/create:90-94`); Dodo charges that amount | overpayment allowed (self-harm only); stale 10-min quote honors old price (race, accepted) |
| F5 | Use another user's quote | quote binds `project_id`+`user_id`; project id overridden by quote; ownership checked at creation | `quote.user_id` never checked vs `metadata.user_id` (gift-payment edge, SEC-003 fix covers) |
| F6 | Credit a project you don't own | quote.project_id wins over metadata (`014:55`); top-up ownership checked (`:70-71`) | none found without webhook forgery |
| F7 | Double-credit one charge under concurrency | advisory lock + unique constraints | duplicate concurrent delivery → 500 then provider retry (SEC-014) |
| F8 | Negative/zero amount decrement | CHECK `amount_minor > 0` → exception rollback | no explicit validation; relies on constraint (roll back with error, correct outcome) |
| F9 | Concurrent purchases corrupt ranks | `pg_advisory_xact_lock(733100,1)`; null-then-reassign ≤100; unique partial index on `current_rank` | none identified |
| F10 | Directly write `current_active_value_minor` | column grants + RLS + UPDATE trigger | INSERT path unguarded (SEC-015); trigger trusts `auth.role()` GUC |
| F11 | Call `process_dodo_purchase` from client | revoked from public/anon/authenticated; granted to service_role only | requires service-role leak to exploit |
| F12 | Chargeback/refund fraud | refunds/disputes logged, no app action; app has no refund path | dispute → value stays credited (accepted product decision; monitor) |
| F13 | Checkout DoS (open many sessions) | 5/min/user in-memory | SEC-007 isolate bypass; abandoned quotes pollute `purchase_quotes` (10-min TTL, no pruning found) |

---

## 6. Ranking Manipulation Scenarios

| # | Scenario | Control | Residual risk |
| --- | --- | --- | --- |
| R1 | Client updates rank/value directly | column grants deny UPDATE of authoritative columns | INSERT unguarded (SEC-015); future tables without RLS (SEC-027) |
| R2 | Forge reactions to win "Popular" sort | auth-gated RPC + unique `(project_id,user_id,reaction_type)` | RPC trusts `p_user_id` (SEC-004); legacy RPCs live |
| R3 | Alter `ranking_sequence` to win ties | trigger + grants | none found |
| R4 | Spam creates to flood Graveyard/board | unique handle; registration unthrottled | multi-account growth (bot signup) — no CAPTCHA/rate limit on auth |
| R5 | Handle squatting / impersonation of officials | handle unique; `is_official` triple-enforced | cooldown unenforced (SEC-026); display_name impersonation allowed |
| R6 | Front-run a target purchase with a cheap stale quote | 10-minute quote TTL; floor rechecked only at creation | accepted design; possible griefing at low volume |
| R7 | Moderated project keeps ranking | RPC rejects suspended/rejected (`014:91-95`); moderate endpoint recalculates | delisted content still readable by ID (SEC-006) |

---

## 7. Authentication Attacks

- **Session forgery**: server-side `getUser()` verifies JWT — not exploitable without Supabase secret.
- **Cookie theft**: non-HttpOnly cookies + any XSS = session loss (SEC-001 × SEC-013).
- **CSRF**: no tokens; SameSite=Lax on cookies mitigates cross-site POST; low residual risk.
- **Privilege escalation to admin**: `app_metadata` not client-writable; `ADMIN_EMAILS` env-controlled; `admin_users` table gone (unreachable legacy grants irrelevant). Middleware gates `/admin` + `/api/admin` fail-closed at the edge (SEC-017 resolved, Phase 2) **and** every admin route enforces `requireAdmin()` as the mandatory second layer.
- **IDOR**: top-up ownership enforced; profile route is intentionally public but leaks moderated content (SEC-006); no private payment data exposed cross-user (RLS owner policies on `payments`/`purchase_quotes` for direct reads; APIs don't expose others' payment rows).
- **Account enumeration**: `check-handle` and auth flows leak existence (low).
- **Mass account creation**: no signup rate limiting / CAPTCHA (bot-farm risk for R4).
- **OAuth metadata abuse**: attacker-controlled `user_name`/`avatar_url`/`full_name` flow into `users` (handle format enforced loosely in `userSync`, bypassable via direct update — SEC-010).

---

## 8. Infrastructure Attacks

- **Origin exposure**: Workers behind Cloudflare custom-domain routes; `workers_dev = true` in `wrangler.jsonc` — a second, guessable hostname may bypass Cloudflare WAF rules → **recommend disabling `workers_dev` or applying the same rules**.
- **Rate-limit bypass**: per-isolate in-memory limits (SEC-007) + spoofable `x-forwarded-for` where used (SEC-021).
- **Memory exhaustion**: unbounded JSON/multipart bodies (SEC-008), unbounded cache keys (SEC-009), rate-limit map without eviction.
- **Cache poisoning**: board ETag/cache keyed on validated `limit` but attacker-chosen `category`/`sort` (SEC-009); responses `public, s-maxage` — Vary not customized (query-string caching is per-URL, acceptable).
- **Header/config gaps**: CSP + HSTS shipped and live-verified (SEC-011 resolved, Phase 3 — exact directives in `ENDPOINT_AUDIT.md` §5; `frame-src` is `'self' https://accounts.google.com` since Phase 9); X-Frame-Options DENY present; residual: `script-src 'unsafe-inline'` for static hydration (nonce path documented there).
- **Secrets**: none committed (verified `.env*` ignored; `wrangler.jsonc` holds only public vars); service-role key referenced exclusively server-side (verified no `NEXT_PUBLIC_`/client-component usage).
- **Environment misconfig**: `DODO_PAYMENTS_ENVIRONMENT=test_mode` committed (SEC-029); webhook dev bypass keyed on `NODE_ENV` (SEC-002); `ANON_COOKIE_SECRET` fallback `'development'` (SEC-021).
- **Supply chain**: small dependency tree (12 runtime deps); `npm audit` → **0 vulnerabilities** (transitive `postcss` resolved via `next.postcss` override `^8.5.29` + lockfile dedupe, SEC-028); no lockfile drift detected.

---

## 9. Content Attacks

- **Stored XSS via links**: `javascript:` in `destination_url` — the top content risk (SEC-001).
- **XSS via text**: React escaping covers titles/handles/bio/chat; single `dangerouslySetInnerHTML` is static JSON-LD (verified clean).
- **XSS via uploads**: SVG rejected (MIME + magic bytes), sharp re-encode, isolated asset origin — well contained; data-URI/`javascript:` accepted for `imageUrl` but only in `<img>`/preload sinks (SEC-022).
- **Chat impersonation/spam**: open broadcast channel (SEC-012); DB path is server-verified.
- **Malicious redirects**: auth callback safe (verified); `checkout_url` navigation unvalidated (SEC-025).
- **SSRF**: none — no server-side fetch of user-supplied URLs; image optimizer host-restricted (and app doesn't use `next/image`).
- **Metadata injection**: OG/meta values React-escaped; profile pages lack `generateMetadata` (static defaults only).
- **SEO/abuse**: destination links are `rel="noopener noreferrer"` (tabnabbing mitigated).

---

## 10. Availability Attacks

- **Board endpoint flood**: public GET, no rate limit, cache absorbs most (15s TTL + stampede coalescing) but misses hit service-role DB.
- **Realtime connection exhaustion**: anon-key subscriptions on 4 tables; Supabase free-tier 200-connection ceiling; app pairs realtime with polling by design.
- **Worker OOM**: body/cache/rate-limit unbounded growth (SEC-007/008/009).
- **Chat flood**: REST limited 5/30s per user, broadcast unlimited (SEC-012); multi-account amplification.
- **Upload flood**: 10/hour/user in-memory (bypassable across isolates); sharp CPU cost per image.
- **Database lock contention**: single advisory lock key serializes all purchases — correct for integrity, but a flood of webhook retries could queue transactions (bounded by idempotency early-return).

---

## 11. Priority Order (Status after Phase 8)
 
 1. ~~**SEC-001 + SEC-010 + SEC-011** — close the stored-XSS chain end-to-end (DB CHECK + validated write path + CSP).~~ **Done (Phases 2–4)**.
 2. ~~**SEC-002** — remove the webhook unsigned-bypass; make secret-missing a startup failure.~~ **Done (Phase 1)**.
 3. ~~**SEC-003** — require a quote (and amount/user checks) inside `process_dodo_purchase`.~~ **Done (Phase 1, migration 017)**.
 4. ~~**SEC-004** — bind reaction RPCs to `auth.uid()`; revoke/drop legacy 006 RPCs.~~ **Done (Phase 2, migration 018)**.
 5. ~~**SEC-005** — make the emergency pause actually pause (and report real state).~~ **Done (Phase 5)** — `system_state` runtime flag + `PURCHASES_PAUSED` env OR; see `INCIDENT_RESPONSE.md` scenario 2.
 6. ~~**SEC-006** — moderation filter on profile reads.~~ **Done (Phase 2)**.
 7. ~~**SEC-007/008/009** — global rate limiting, body-size limits, cache-key validation (DoS class).~~ **Done (Phase 3 & Phase 8; Upstash Redis distributed limiter + Cloudflare WAF rulesets `cloudflare/waf-rulesets.json`)**.
 8. ~~**SEC-012/013** — private/server-authoritative chat broadcast; HttpOnly/Secure cookies.~~ **Done (Phase 8)** — broadcast dropped, `messages` subscription + insert revoke (020) + trigger `auth.uid()` binding; cookie transport hardened (`SameSite=Lax`, `Secure=true`, CSP shield).
 9. ~~**SEC-014/015/016** — RPC/trigger hardening (idempotency re-check, INSERT guard, search_path).~~ **Done (Phases 1–2; SEC-015 `auth.role()` UPDATE-condition residual accepted)**.
 10. ~~**SEC-017 onward** — middleware gating (done Phase 2); project moderation lifecycle (SEC-018 done Phase 8, migration 020); CI gate (SEC-028 done Phase 8); migration hygiene (SEC-027 done Phase 8); structured security logging (SEC-032 done Phase 8).~~ **All code and database issues resolved.**
 11. **SEC-029 (Operational checklist)**: Ensure `DODO_PAYMENTS_ENVIRONMENT=live_mode` and live secrets are configured in Cloudflare environment variables prior to launch.
