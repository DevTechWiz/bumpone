# BumpOne.lol — Implementation Contract

> **Production naming override:** [25_PRODUCTION_ARCHITECTURE.md](25_PRODUCTION_ARCHITECTURE.md) supersedes planning-era `profiles`, `purchases`, `payment_events`, `rank_events`, `admin_actions`, and `realtime_outbox` names.

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
- concentric 100-slot board (King 4x4, Elites 2x2, Vanguard, Contenders) + Graveyard (#101+)
- exact-position purchase flow with informational 10-minute quotes
- Dodo Payments Hosted Checkout and webhook processing
- live board and bump feed updates via Supabase Realtime
- public profile passport with rank journey and lifetime spend transparency (`total_paid`)
- anonymous reactions with abuse controls (HttpOnly signed cookie)
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

- Ordering is `current_active_value DESC`.
- Ties are broken by earliest rank-event sequence (monotonic `global_event_sequence`; the profile that first reached the value ranks higher).
- `current_active_value` both calculates the top-up AND determines ordering.
- `current_rank` may exist as a materialized cache for performance, but it is never the source of truth. It must always be recomputed from value DESC + sequence order, never independently assigned.
- **Zero Payment Rejection**: No confirmed payment is ever cancelled or refunded due to race conditions. If two users buy for the same slot simultaneously (e.g. Alice and Bob both pay $110 for #1), the 1st processed payment receives Rank #1 and the 2nd receives Rank #2. Both payments are credited in full.

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
- Duplicate/delayed webhooks: Dodo event idempotency (unique `event_id` in `payment_events`).
- Disputed payments: refund/chargeback rollback mechanism in `10_PAYMENT_FLOW.md`.

### Minimum amount

- Genesis pricing: empty slots start at face values $1–$100 (#1 = $100 … #100 = $1).
- Once a slot is filled, every takeover adds +$10: minimum top-up **$10**, minimum increment **$10**, whole USD only.

### Payment policy

The documented refund policy is the rollback mechanism in `10_PAYMENT_FLOW.md`: a refunded purchase is marked `refunded`, the profile's active value is restored to its pre-purchase amount, rank is recalculated, and a `refund_event` is recorded without rewriting history. Chargebacks follow the same mechanism and create an administrative event.

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

Terminal states: `expired`, `cancelled`, `payment_failed`, `processing_failed`, `disputed`, `refunded`, `administratively_cancelled`.

Quotes expire 10 minutes after creation (`expires_at`). An expired quote moves toward `expired` for display purposes but never blocks a completed payment from being recomputed at confirmation.

Each transition must record `occurred_at`, actor/source, and an immutable audit record. Only a verified Dodo webhook (`payment.succeeded`) may transition a purchase to `paid`.

### Report lifecycle

`open → under_review → resolved_no_action | resolved_actioned | dismissed`

Reports must retain reporter ID, reason, free-text details, timestamps, and the resolving admin action.

---

## 4. Database Contract

Use PostgreSQL migrations. Every migration must be reversible where safely possible and must include indexes required by its query paths.

### Required tables

- `users`: application-level user metadata keyed to Supabase Auth `auth.users.id`.
- `profiles`: id, user_id (unique, 1 profile per user), display_name, handle, image_path, destination_url, category_id, current_rank, current_active_value, is_active, moderation_status, created_at, updated_at.
- `categories`: id, name, slug, display_order.
- `purchase_quotes`: buyer profile, target profile/rank, calculation inputs, quoted amount, expiry (creation + 10 minutes), quote version, and status.
- `purchases`: id, profile_id, user_id, quote_id, dodo_payment_id, dodo_checkout_session_id, amount_minor, currency, previous_active_value_minor, new_active_value_minor, previous_rank, new_rank, status, created_at.
- `payment_events`: unique event ID (`webhook-id`), payment ID, event type, received timestamp, processing status, payload reference/hash, processed timestamp.
- `rank_mutations`: immutable operation ID, initiating purchase/admin action, sequence number, before/after references, and timestamp.
- `rank_events`: one immutable row per profile whose rank changes, including old and new global rank, reason, sequence number, mutation ID, and timestamp.
- `reactions`: profile_id, anonymous_id, reaction_type, created_at. Unique constraint on `(profile_id, anonymous_id, reaction_type)`.
- `reaction_counts`: profile_id, reaction_type, count.
- `reports`: profile_id, reporter_ip_hash/anon_id, reason, details, status, admin_notes, created_at.
- `admin_users`: explicit administrator authorization source (`user_id`, `role`).
- `realtime_outbox`: id, event_type, payload, status, created_at.

### Required fields and constraints

- All identifiers use UUIDs unless an external provider supplies the ID.
- Monetary values are integer values (USD cents / minor units); never use floating point.
- All timestamps are `timestamptz` in UTC.
- `profiles.user_id` is a foreign key to `auth.users(id)` (1-to-many: one user can own and manage multiple profiles/slots, each with its own independent active value).
- `profiles.category_id` is a foreign key to `categories`.
- `purchases.dodo_payment_id` is unique when present.
- `payment_events.event_id` is unique.
- Use foreign keys with explicitly selected delete behavior; never rely on defaults.

### Ranking transaction

The final purchase model must be implemented as one trusted database transaction/RPC with:

1. idempotency check by Dodo event ID (`webhook-id`);
2. transaction-level serialization/locking (`SELECT ... FOR UPDATE`) for affected ranking rows;
3. verification of the approved quote rules;
4. payment and profile state changes;
5. rank mutation and all affected history rows;
6. metrics/event records;
7. an outbox row for post-commit realtime publishing.

Do not update ranks from browser code or with multiple independently committed queries.

### Row Level Security (RLS)

- Public: read only approved, public-safe profiles (`is_active = true`, `moderation_status = 'approved'`) and public aggregate data.
- Owner: read/update only their own draft/profile fields explicitly permitted by policy.
- Owner must never directly write rank, active value, purchase status, metrics, moderation status, aggregate reaction counts, or admin records.
- Admin: use an explicit server-side role (`admin_users`), not a client-provided flag.
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

- `GET /api/board`: Returns top 100 profiles (optional `category` filter).
- `GET /api/categories`: Returns categories and profile counts.
- `GET /api/profile/:id`: Returns profile passport, metrics, rank history, and reactions.
- `GET /api/bump-feed`: Returns recent rank movement events.
- `POST /api/purchase/create`: Validates target, creates informational quote, creates Dodo Hosted Checkout session, returns `checkout_url`.
- `POST /api/webhooks/dodo`: Verifies standard webhook signature, enforces idempotency, recomputes rank, updates DB, writes outbox event.
- `POST /api/reactions`: Adds reaction using HttpOnly signed cookie anonymous identity.
- `DELETE /api/reactions/:id`: Removes reaction for the identity.
- `POST /api/uploads/image`: Uploads and validates image file (max 5MB, JPEG/PNG/WebP, min 400x400), strips EXIF, resizes, uploads to Supabase Storage.
- `POST /api/reports`: Submits abuse/content report for a profile.
- Admin Endpoints:
  - `GET /api/admin/overview`: Revenue, purchases, top 100, active value stats.
  - `POST /api/admin/profiles/:id/moderate`: Approve, suspend, or restore profile.
  - `POST /api/admin/emergency/pause`: Toggle purchase emergency pause.

---

## 6. Upload, Link, and Moderation Contract — RESOLVED

### Image upload specifications (RESOLVED)

- **Maximum upload size**: 5 MB.
- **Allowed MIME types**: `image/jpeg`, `image/png`, `image/webp`. (SVGs and animated GIFs are strictly prohibited).
- **Pixel dimensions**: Minimum 400×400 px, Maximum 2560×2560 px. Aspect ratio: square (1:1) recommended; letterboxed with blurred fill if non-square.
- **Server-side processing**: Using `sharp` to strip all EXIF metadata, re-encode to high-efficiency WebP (quality: 85), and write to Supabase Storage bucket `profile-images`.
- Unvalidated original files are never exposed publicly.

### Destination links

- Permit only `https://` URLs.
- Normalize and validate URLs server-side.
- Render on the frontend with `rel="noopener noreferrer"`.

---

## 7. Anonymous Reactions and Identity — RESOLVED

- **Identity Mechanism**: Signed, HttpOnly first-party cookie (`bumped_anon_id`) containing a cryptographically random UUIDv4 signed with an application secret.
- **Abuse Controls**:
  - One reaction per profile, anonymous identity, and reaction type.
  - In-memory / Redis / DB rate-limiting: max 30 reactions per minute per identity.
  - Identity tokens are never exposed in public APIs.

---

## 8. Realtime Contract

Publish realtime events only from the outbox after the ranking transaction commits.

Every event must include:
- `event_id` UUID
- monotonically increasing `sequence`
- `event_type` (`board.updated`, `bump.feed`, `reaction.updated`)
- `occurred_at`
- minimal public payload

Clients deduplicate by `event_id` and refetch authoritative state on reconnect or detected sequence gaps.

---

## 9. Operations and Security Contract

### Infrastructure Architecture (Cloudflare + Vercel Hybrid)
- **Edge Layer**: Cloudflare (Free DNS Proxy, WAF, Bot Fight Mode, and Unlimited Free Bandwidth CDN caching).
- **Compute Layer**: Vercel (Next.js 15 App Router serverless execution and sharp image processing).
- **Database Layer**: Supabase PostgreSQL (Connection pooled, RLS-enforced).
- **Payment Layer**: Dodo Payments (Merchant of Record / Hosted Checkout).
- **Traffic Scaling & Database Protection**:
  - All public reads (`/api/board`) must use HTTP Cache-Control headers (`public, s-maxage=5, stale-while-revalidate=10`).
  - Viral traffic spikes of 100k+ spectators are absorbed by Cloudflare Edge CDN without crashing PostgreSQL or triggering Vercel bandwidth fees.
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
- Audit every administrative action in `admin_actions`.
