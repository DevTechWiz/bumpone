# BumpOne.lol — Implementation Contract

> **Production naming override:** [25_PRODUCTION_ARCHITECTURE.md](25_PRODUCTION_ARCHITECTURE.md) supersedes planning-era `profiles`, `purchases`, `rank_events`, `admin_actions`, `admin_users`, `system_state`, `reaction_counts`, `rank_mutations`, and `realtime_outbox` names.

## Purpose

This document turns the product documentation into an implementation-ready contract.

An implementation agent must follow explicit rules in this document and must not infer product behavior from examples, mock data, or UI copy. All build decisions have been resolved and locked by the product owner.

---

## 1. Build Boundary

### MVP is in scope

- public global and category boards with three discovery views: Power (paid), Popular (reactions), Trending (momentum)
- user authentication (Supabase Auth) with multi-profile ownership (users can own and manage multiple slots)
- profile creation, editing, and destination link
- image upload pipeline (5MB, JPEG/PNG/WebP, EXIF stripping via sharp)
- concentric 100-slot board (King 3x3 center, Champions #2-#5 as 2x2 anchors, Elite #6-#15, Vanguard #16-#40, Contenders #41-#100) + Graveyard (#101+)
- exact-position purchase flow with informational 10-minute quotes
- Dodo Payments Hosted Checkout and webhook processing
- live board and bump feed updates via Supabase Realtime (`postgres_changes`)
- public profile passport with rank journey and lifetime spend transparency (`total_paid`)
- authenticated reactions with abuse controls (per-user rate limits)
- reporting, moderation, and an admin dashboard (`/admin`)

### Explicitly out of scope

- notifications
- historical-board browsing
- multiple independent boards
- paid visual enhancements
- advanced user analytics
- public write API
- multi-currency support (MVP is USD only)

Do not add an out-of-scope feature without a new approved specification.

---

## 2. Purchase and Ranking Model — RESOLVED

The product owner has resolved the purchase and ranking model as follows. These are canonical; all other docs defer to this section on these points.

### Canonical ranking source

- Ordering is `current_active_value_minor DESC` (integer USD cents is the sole monetary representation).
- Ties are broken by earliest rank-event sequence (monotonic `global_event_sequence`; the profile that first reached the value ranks higher).
- `current_active_value_minor` both calculates the top-up AND determines ordering.
- `current_rank` may exist as a materialized cache for performance, but it is never the source of truth. It must always be recomputed from value DESC + sequence order, never independently assigned.
- **Zero Payment Rejection**: No confirmed payment is ever cancelled due to race conditions. If two users buy for the same slot simultaneously (e.g. Alice and Bob both pay $110 for #1), the 1st processed payment receives Rank #1 and the 2nd receives Rank #2. Both payments are credited in full.

### Target selection and final position

- A buyer selects a target (a rank or profile to exceed); the server quotes the top-up required to exceed it.
- "Above the target" means the highest position the buyer's resulting active value qualifies for at payment-confirmation time, not necessarily immediately one rank above the target.
- An existing profile may target any higher position; at confirmation its final position is recomputed the same way.

### Quote validity and staleness

- Quote validity window: **10 minutes** (`expires_at` = creation + 10 min).
- The quote is informational and does not reserve a rank.
- At successful payment confirmation, recompute the resulting position against the current ranking state using the amount actually paid. If the board changed during checkout, the buyer receives the highest position their resulting active value qualifies for, even if it differs from the quoted expectation.
- An expired quote does not block payment; only the displayed expectation goes stale.

### Payment edge handling

- Insufficient payment (top-up below the $10 minimum): reject with no ranking change.
- Duplicate/delayed webhooks: Dodo event idempotency (unique `(provider, provider_event_id)` in `payment_events`).
- Disputed payments: admin can manually suspend the project, triggering `recalculate_board_ranks()`. See `10_PAYMENT_FLOW.md`.

### Minimum amount

- Genesis pricing: empty slots start at face values $10–$109 (#1 = $109 … #100 = $10), seeded by `004_seed.sql`.
- Once a slot is filled, every takeover adds +$10: minimum top-up **$10**, minimum increment **$10**, whole USD only.

### Payment policy

All payments are final. BumpOne does not support application-level refunds because payments purchase rank positions that immediately affect other users. Gateway-level chargebacks are handled externally by the payment provider. If a chargeback occurs, an admin can manually suspend the project via the moderation endpoint.

---

## 3. Product State Machines — RESOLVED

### Profile lifecycle

| State | Public board | Can purchase | Allowed transition |
| --- | --- | --- | --- |
| draft | no | no | draft → pending_payment, deleted |
| pending_payment | no | no | pending_payment → approved, expired, cancelled |
| approved | yes | yes | approved → suspended, archived |
| suspended | no | no | suspended → approved, archived |
| archived | no | no | terminal, except explicit admin restore |

**Moderation Model (RESOLVED):**
- **Instant Live Publishing with Post-Moderation**: Upon verified `payment.succeeded` from Dodo Payments, the profile is immediately set to `approved` and appears live on the board.
- When an admin suspends a profile via `/admin`, `is_active` becomes `false`, `moderation_status = 'suspended'`, and the profile is removed from the active board. Ranks below shift up by 1 to fill the vacant slot.

### Purchase lifecycle

`draft → quoted → checkout_open → payment_processing → paid → ranking_processed`

Terminal states: `expired`, `cancelled`, `payment_failed`, `processing_failed`, `disputed`, `administratively_cancelled`.

Quotes expire 10 minutes after creation (`expires_at`). An expired quote moves toward `expired` for display purposes but never blocks a completed payment from being recomputed at confirmation.

Each transition must record `occurred_at`, actor/source, and an immutable audit record. Only a verified Dodo webhook (`payment.succeeded`) may transition a purchase to `paid`.

### Report lifecycle

`open → under_review → resolved_no_action | resolved_actioned | dismissed`

Reports must retain reporter ID, reason, free-text details, timestamps, and the resolving admin action.

---

## 4. Database Contract

Use PostgreSQL migrations. Every migration must be reversible where safely possible and must include indexes required by its query paths.

### Required tables

- `users`: application-level user metadata keyed to Supabase Auth `auth.users.id` (handle, display_name, avatar, inlined reaction counts).
- `projects`: id, user_id (1-to-many: one user owns many projects/slots), title, handle, image_path, destination_url, category_id, current_rank (1-100 or null for Graveyard), current_active_value_minor, total_paid_minor, ranking_sequence, is_active, moderation_status, created_at, updated_at.
- `categories`: id, name, slug, display_order.
- `purchase_quotes`: project, buyer, target_rank, quoted_amount_minor, expected_rank, expiry (creation + 10 minutes), status.
- `payments`: id, project_id, user_id, quote_id, provider, provider_payment_id (unique), amount_minor, currency, previous/new active value and rank, status, timestamps.
- `payment_events`: provider, unique `(provider, provider_event_id)`, payment_id, event type, payload, processed timestamp (webhook idempotency ledger).
- `board_events`: monotonic `event_sequence`, project + title/handle snapshots, previous/new rank and value, `profiles_displaced`, `event_type` (the rank journey journal; replaces planning-era `rank_events` / `rank_mutations`).
- `reactions`: project_id or target_user_id, user_id, reaction_type, created_at. Unique constraint on `(project_id, user_id, reaction_type)`. Counts are inlined on `projects`/`users` (no `reaction_counts` table).
- `messages`: War Room chat rows with anti-spoof author fill.
- `reports`: project_id, reporter identity hash, reason, details, status, admin_notes, created_at.
- `admin_audit_log`: admin action journal (replaces planning-era `admin_actions`).

There is no `admin_users`, `system_state`, `realtime_outbox`, `profiles`, `purchases`, `rank_events`, `rank_mutations`, or `reaction_counts` table.

### Required fields and constraints

- All identifiers use UUIDs unless an external provider supplies the ID.
- Monetary values are integer values (USD cents / minor units); never use floating point.
- All timestamps are `timestamptz` in UTC.
- `projects.user_id` is a foreign key to `users(id)` (1-to-many: one user can own and manage multiple projects/slots, each with its own independent active value).
- `projects.category_id` is a foreign key to `categories`.
- `payments.provider_payment_id` is unique when present.
- `payment_events` is unique on `(provider, provider_event_id)`.
- Use foreign keys with explicitly selected delete behavior; never rely on defaults.

### Ranking transaction

The final purchase model must be implemented as one trusted database transaction/RPC (`process_dodo_purchase`) with:

1. idempotency check by Dodo event ID (`(provider, provider_event_id)` in `payment_events`);
2. transaction-level serialization via `pg_advisory_xact_lock` before any ranking read/write;
3. verification of the approved quote rules (existence, status, expiry, amount match, project binding, suspended-project guard);
4. payment and project state changes (`current_active_value_minor`, `ranking_sequence`);
5. atomic rank recomputation for ranks 1..100 plus `payments`, `board_events`, and `payment_events` history rows;
6. metrics/event records.

Realtime consumers subscribe to committed `board_events` rows via `postgres_changes`; there is no outbox table.

Do not update ranks from browser code or with multiple independently committed queries.

### Row Level Security (RLS)

- Public: read only approved, public-safe profiles (`is_active = true`, `moderation_status = 'approved'`) and public aggregate data.
- Owner: read/update only their own draft/profile fields explicitly permitted by policy.
- Owner must never directly write rank, active value, purchase status, metrics, moderation status, aggregate reaction counts, or admin records.
- Admin: use server-side authorization (`ADMIN_EMAILS` env var or Supabase Auth `app_metadata.role`), not a client-provided flag.
- Dodo webhook: execute via server-side service role only.

---

## 5. API Contract

All endpoints must specify a Zod request schema, response schema, authentication requirement, authorization rule, rate limit, and error response.

### Standard response rules

- JSON only; use ISO-8601 UTC timestamps and UUID strings.
- Validation error: `400` with field-level errors.
- Unauthenticated: `401`.
- Unauthorized: `403`.
- Missing resource: `404`.
- State/version conflict: `409`.
- Rate limited: `429`, including `Retry-After`.
- Unexpected server failure: `500`, with a request ID but no sensitive detail.
- List endpoints use cursor pagination and a bounded default/max limit.

### Core Endpoints

- `GET /api/board`: Returns top 100 profiles (optional `category` and `sort` params).
- `GET /api/profile/[id]`: Returns profile passport, reactions, and embedded `board_events` rank history (no separate journey/bump-feed/categories endpoints).
- `GET /api/war-room/events`: Returns recent rank movement events.
- `POST /api/purchase/create`: Validates target, creates informational quote, creates Dodo Hosted Checkout session, returns `checkout_url`.
- `POST /api/webhooks/dodo`: Verifies standard webhook signature, enforces idempotency, recomputes rank via `process_dodo_purchase`, invalidates board cache.
- `POST /api/reactions`: Adds a reaction for the authenticated user via `add_project_reaction_auth`.
- `DELETE /api/reactions`: Removes the user's reaction via `remove_project_reaction_auth` (query params `projectId`, `reaction`).
- `POST /api/uploads/image`: Uploads and validates image file (max 5MB, JPEG/PNG/WebP, min 400x400), strips EXIF, resizes, uploads to Cloudflare R2.
- `POST /api/reports`: Submits abuse/content report for a project.
- Admin Endpoints:
  - `GET /api/admin/overview`: Revenue, active profiles, open reports, kill-switch state.
  - `POST /api/admin/moderate`: Suspend or restore a project; calls `recalculate_board_ranks()`.
  - `POST /api/admin/emergency`: Records the purchase-pause action in `admin_audit_log`.

---

## 6. Upload, Link, and Moderation Contract — RESOLVED

### Image upload specifications (RESOLVED)

- **Maximum upload size**: 5 MB.
- **Allowed MIME types**: `image/jpeg`, `image/png`, `image/webp`. (SVGs and animated GIFs are strictly prohibited).
- **Pixel dimensions**: Minimum 400×400 px, Maximum 2560×2560 px. Aspect ratio: square (1:1) recommended; letterboxed with blurred fill if non-square.
- **Server-side processing**: Using `sharp` to strip all EXIF metadata and re-encode, then write to Cloudflare R2 (bucket `bumpone-assets`, path prefixes `projects/` and `profiles/`).
- Unvalidated original files are never exposed publicly.

### Destination links

- Permit only `https://` URLs.
- Normalize and validate URLs server-side.
- Render on the frontend with `rel="noopener noreferrer"`.

---

## 7. Reactions and Identity — RESOLVED

- **Identity Mechanism**: Authenticated Supabase session (`user_id`); one reaction per `(project_id, user_id, reaction_type)`.
- **Abuse Controls**:
  - One reaction per project, user, and reaction type (enforced by unique constraint + RPC).
  - Rate-limiting: max 60 reactions per minute per authenticated user.
  - Reaction counts never affect ranking.

---

## 8. Realtime Contract

Realtime delivery uses Supabase Realtime `postgres_changes` subscriptions over published tables (`projects`, `users`, `board_events`, `messages`) — there is no outbox table and no background broadcast worker.

Every `board_events` row carries a monotonically increasing `event_sequence`. Clients:
- deduplicate by row `id`,
- refetch authoritative board state on reconnect or detected sequence gaps,
- treat animation as presentation only (the database ordering is authoritative).

---

## 9. Operations and Security Contract

### Infrastructure Architecture (Cloudflare)
- **Edge + Compute Layer**: Cloudflare Workers via OpenNext (`opennextjs-cloudflare build/deploy`) running the Next.js 15 App Router app and sharp image processing, behind Cloudflare DNS Proxy, WAF, Bot Fight Mode, and CDN caching (routes `bumpone.lol` + `www.bumpone.lol`).
- **Object Storage**: Cloudflare R2 bucket `bumpone-assets` (R2 binding `bumpone_assets`).
- **Database Layer**: Supabase PostgreSQL (Connection pooled, RLS-enforced).
- **Payment Layer**: Dodo Payments (Merchant of Record / Hosted Checkout).
- **Traffic Scaling & Database Protection**:
  - All public reads (`/api/board`) must use HTTP Cache-Control headers (`public, s-maxage=5, stale-while-revalidate=10`).
  - Viral traffic spikes of 100k+ spectators are absorbed by Cloudflare Edge CDN without crashing PostgreSQL.
  - Active viewers receive real-time bump updates via lightweight Supabase Realtime WebSocket messages.
- **Cost Profile**: Baseline operating cost is $0/month across free tiers; scales smoothly with zero surprise bandwidth charges.

### Environment variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (secret)
- `DODO_PAYMENTS_API_KEY` (secret)
- `DODO_PAYMENTS_WEBHOOK_SECRET` (secret)
- `DODO_PAYMENTS_ENVIRONMENT` (`test_mode` or `live_mode`)
- `APP_URL`
- `ANON_COOKIE_SECRET` (secret)

### Security checklist
- Verify Dodo webhook signatures against raw request body using Svix / HMAC headers.
- Enforce RLS on all Supabase tables.
- Rate-limit checkout creation, quotes, reactions, uploads, and reports.
- Redact payment secrets and PII from logs.
- Audit every administrative action in `admin_audit_log`.
