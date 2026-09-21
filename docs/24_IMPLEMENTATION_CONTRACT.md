# Bumped.lol — Implementation Contract

## Purpose

This document turns the product documentation into an implementation-ready contract.

An implementation agent must follow explicit rules in this document and must not infer product behavior from examples, mock data, or UI copy. A section marked **Decision required** blocks implementation of the affected feature until the product owner defines it.

---

## 1. Build Boundary

### MVP is in scope

- public global and category boards
- one owned profile per user
- profile creation and editing
- image upload and destination link
- exact-position purchase flow
- Stripe Checkout and webhook processing
- live board and bump feed updates
- public profile passport and rank history
- anonymous reactions with abuse controls
- reporting, moderation, and an admin dashboard

### Explicitly out of scope

- notifications
- historical-board browsing
- multiple independent boards
- paid visual enhancements
- advanced user analytics
- public write API
- multi-currency support

Do not add an out-of-scope feature without a new approved specification.

---

## 2. Purchase and Ranking Model — RESOLVED

The product owner has resolved the purchase and ranking model as follows. These are canonical; all other docs defer to this section on these points.

### Canonical ranking source

- Ordering is `current_active_value DESC`.
- Ties are broken by earliest rank-event sequence (monotonic `global_event_sequence`; the profile that first reached the value ranks higher).
- `current_active_value` both calculates the top-up AND determines ordering.
- `current_rank` may exist as a materialized cache for performance, but it is never the source of truth. It must always be recomputed from value DESC + sequence order, never independently assigned.

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

- Insufficient payment (top-up below the $1 minimum): reject with no ranking change.
- Duplicate/delayed webhooks: Stripe event idempotency (unique `stripe_event_id`).
- Disputed payments: refund/chargeback rollback mechanism in `10_PAYMENT_FLOW.md`.

### Minimum amount

- Genesis pricing: empty slots start at face values $1–$100 (#1 = $100 … #100 = $1).
- Once a slot is filled, every takeover adds +$10: minimum top-up **$10**, minimum increment **$10**, whole USD only.

### Still open

- Fraudulent charges and payment-provider disputes beyond the standard rollback.
- Legal or administrative cancellation language and customer-facing receipt/support copy (see payment policy below).

Do not implement fallback behavior for any item still marked open.

### Payment policy

The documented refund policy is the rollback mechanism in `10_PAYMENT_FLOW.md`: a refunded purchase is marked `refunded`, the profile's active value is restored to its pre-purchase amount, rank is recalculated, and a `refund_event` is recorded without rewriting history. Chargebacks follow the same mechanism and create an administrative event. The policy still needs definitions for:

- duplicate Stripe charges
- fraudulent charges and payment-provider disputes
- payment completed but ranking transaction failed
- legal or administrative cancellation
- customer-facing receipt/support language

---

## 3. Product State Machines

### Profile lifecycle

| State | Public board | Can purchase | Allowed transition |
| --- | --- | --- | --- |
| draft | no | no | draft → pending_payment, deleted |
| pending_payment | no | no | pending_payment → pending_moderation, expired, cancelled |
| pending_moderation | no | no | pending_moderation → approved, rejected |
| approved | yes | yes | approved → suspended, archived |
| suspended | no | no | suspended → approved, archived |
| rejected | no | no | rejected → draft, archived |
| archived | no | no | terminal, except explicit admin restore |

**Decision required:** confirm whether moderation is pre-publication, post-publication, or both; and whether an approved profile can remain unranked.

### Purchase lifecycle

`draft → quoted → checkout_open → payment_processing → paid → ranking_processed`

Terminal states: `expired`, `cancelled`, `payment_failed`, `processing_failed`, `disputed`, `administratively_cancelled`.

Quotes expire 10 minutes after creation (`expires_at`). An expired quote moves toward `expired` for display purposes but never blocks a completed payment from being recomputed at confirmation.

Each transition must record `occurred_at`, actor/source, and an immutable audit record. Only a verified Stripe webhook may transition a purchase to `paid`.

### Report lifecycle

`open → under_review → resolved_no_action | resolved_actioned | dismissed`

Reports must retain reporter ID, reason, free-text details, timestamps, and the resolving admin action.

---

## 4. Database Contract

Use PostgreSQL migrations. Every migration must be reversible where safely possible and must include indexes required by its query paths.

### Required tables beyond the current outline

- `users`: application-level user metadata keyed to Supabase Auth user ID.
- `purchase_quotes`: buyer profile, target profile/rank, calculation inputs, quoted amount, expiry (creation + 10 minutes), quote version, and status.
- `stripe_events`: unique Stripe event ID, event type, received timestamp, processing status, payload reference/hash, error, and processed timestamp.
- `rank_mutations`: immutable operation ID, initiating purchase/admin action, sequence number, before/after references, and timestamp.
- `profile_rank_history`: one immutable row per profile whose rank changes, including old and new global rank, reason, mutation ID, and timestamp.
- `rate_limit_events` or an external rate-limit store: identity key, action, timestamp, and decision.
- `admin_users` or a role claim policy: explicit administrator authorization source.

### Required fields and constraints

- All identifiers use UUIDs unless an external provider supplies the ID.
- Monetary values are integer values; never use floating point.
- All timestamps are `timestamptz` in UTC.
- `profiles.user_id` is unique for non-archived owned profiles, enforcing one active profile per user.
- `profiles.category_id` is a foreign key to `categories`; do not store a free-text category.
- `purchases.stripe_checkout_session_id` and `purchases.stripe_payment_intent_id` are unique when present.
- `stripe_events.stripe_event_id` is unique.
- Reactions have a unique identity constraint appropriate to the approved anonymous-identity design.
- Every status field is a database enum or checked value set.
- Use foreign keys with explicitly selected delete behavior; never rely on defaults.

### Ranking transaction

The final purchase model must be implemented as one trusted database transaction/RPC with:

1. idempotency check by Stripe event ID;
2. transaction-level serialization/locking for the affected ranking state;
3. verification of the approved quote rules;
4. payment and profile state changes;
5. rank mutation and all affected history rows;
6. metrics/event records;
7. an outbox row for post-commit realtime publishing.

Do not update ranks from browser code or with multiple independently committed queries.

### Row Level Security

- Public: read only approved, public-safe profiles and public aggregate data.
- Owner: read/update only their own draft/profile fields explicitly permitted by policy.
- Owner must never directly write rank, active value, purchase status, metrics, moderation status, aggregate reaction counts, or admin records.
- Admin: use an explicit server-side role, not a client-provided flag.
- Stripe webhook: use server-side credentials only.

Every RLS policy requires an automated authorization test.

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

### Required endpoints not yet specified

- authenticated profile create/update/delete/archive
- upload-initiate, upload-complete, and image processing status
- current-user profile and purchase status
- purchase quote creation, quote status, and Checkout-session creation
- post-purchase result lookup
- moderation/report administration endpoints
- admin purchase/profile/report search with cursor pagination
- health/readiness endpoint restricted appropriately

### Idempotency

Every state-changing client request must accept an idempotency key. Store the key, actor, request hash, response, and expiry. Retrying the same key must return the original successful result, not repeat the mutation.

---

## 6. Upload, Link, and Moderation Contract

### Image upload

Before launch, specify exact values for:

- maximum upload bytes
- minimum and maximum pixel dimensions
- permitted formats
- output format and dimensions
- animation/metadata handling
- image-processing timeout and failure behavior
- temporary object expiry

The server must validate file signature, decoded image, dimensions, and size. It must strip metadata, generate server-owned derivatives, and never make an unvalidated original publicly addressable.

### Destination links

- Permit only `https` for the MVP unless HTTP is explicitly approved.
- Normalize and validate URLs server-side.
- Do not fetch arbitrary URLs from a privileged server context.
- Use an interstitial or appropriate `rel` attributes for external links if needed.

### Moderation behavior — Decision required

Define whether a suspended/rejected profile is removed from ranking and all profiles below shift up, or whether it remains ranked but is hidden. Also define appeal handling, enforcement SLA, and whether prior public share cards remain viewable.

---

## 7. Anonymous Reactions and Profile Views

Anonymous reactions are permitted for the MVP.

Before implementation, select the anonymous identity mechanism: signed, HttpOnly first-party cookie; privacy-preserving device token; or authenticated account. Do not use raw IP address as the unique identity.

Required protections:

- one reaction per profile, anonymous identity, and reaction type;
- server-side rate limits by identity and coarse abuse signal;
- CSRF protection for cookie-authenticated mutations;
- reaction removal for the same identity;
- no exposure of identity keys in public APIs;
- reviewable abuse telemetry.

Profile-view counting must define a deduplication window, bot exclusion method, and privacy notice before implementation.

---

## 8. Realtime Contract

Publish realtime events only from the outbox after the ranking transaction commits.

Every event must include:

- `event_id` UUID
- monotonically increasing `sequence`
- `event_type`
- `occurred_at`
- schema version
- affected global/category board identifiers
- minimal public payload

Clients must deduplicate by `event_id`, detect sequence gaps, and refetch authoritative board/feed data after reconnect or a gap. Clients may animate an event only after rendering the authoritative state.

Define payload schemas for `board.updated`, `bump.feed`, `reaction.updated`, `profile.moderated`, and `purchase.result` before coding clients.

---

## 9. UI and Accessibility Acceptance Criteria

Every screen must define: loading, empty, error, offline, signed-out, pending-payment, success, and permission-denied states.

Required accessibility behavior:

- full keyboard navigation and visible focus state;
- semantic labels for rank, profile, reaction, external link, and purchase controls;
- screen-reader announcement strategy for live board changes without excessive interruption;
- WCAG AA color contrast;
- `prefers-reduced-motion` disables nonessential wall movement;
- no interaction depends on hover, drag, color alone, or animation alone;
- responsive acceptance at mobile, tablet, and desktop widths.

Do not claim a UI complete until these states have component and end-to-end tests.

---

## 10. Operations and Security Contract

### Environment and deployment

Document required environment variables by name, purpose, environment, and secret owner. Never commit values.

The repository must provide:

- local setup instructions
- migration and seed commands
- test Stripe configuration instructions
- production deployment procedure
- rollback and migration-failure procedure
- backup/restore procedure and recovery target

### Monitoring and alerts

Monitor and alert on:

- failed/lagging webhook processing
- unprocessed outbox events
- ranking-transaction failures
- payment/Checkout error rate
- upload processing failures
- moderation backlog
- authentication/rate-limit abuse spikes
- database errors and resource saturation

Specify owners and actionable thresholds before launch.

### Security requirements

- verify Stripe webhook signatures against the raw request body;
- enforce RLS and server-side authorization;
- rate-limit uploads, quotes, Checkout creation, reactions, reports, profile edits, and authentication;
- apply content-security policy and secure headers;
- protect mutating cookie-authenticated routes from CSRF;
- redact secrets and payment data from logs;
- audit every administrative mutation;
- perform dependency and secret scanning in CI.

---

## 11. Test Contract

Before implementation, select the unit, integration, and end-to-end test tools and add commands to the repository README.

Required coverage:

- database/RPC tests for every rank and payment state transition;
- race tests for serialized purchases and webhook replays;
- webhook signature and idempotency tests using Stripe fixtures;
- RLS and authorization tests for every table/endpoint;
- upload validation tests with malformed and oversized files;
- anonymous-reaction identity, duplicate, removal, and rate-limit tests;
- realtime duplicate, out-of-order, missed-event, and reconnect tests;
- end-to-end flows for create profile, payment success/failure, moderation, reporting, and accessibility;
- regression tests for every resolved purchase/ranking decision.

All CI checks must pass before deployment. Tests must use separate development/test Stripe and Supabase credentials from production.

---

## 12. Legal and Support Launch Requirements

Before public launch, provide and link:

- terms of service;
- privacy and cookie notice;
- acceptable-use/content policy;
- reporting and appeal process;
- copyright/DMCA contact and process where applicable;
- refund/cancellation policy (rollback mechanism defined in `10_PAYMENT_FLOW.md`);
- support contact;
- data retention/deletion policy.

Have qualified legal and tax advice review the final product, payment, user-generated-content, and marketing flows before launch.

---

## 13. Autonomous Build Gate

An AI may autonomously implement a feature only when its relevant decisions are no longer marked **Decision required** and it has:

1. an approved data model and migration;
2. API schemas and authorization rules;
3. state transitions and error behavior;
4. UI acceptance criteria;
5. automated test cases; and
6. operational/monitoring requirements.

Until then, the AI must ask the product owner rather than choose a workflow.
