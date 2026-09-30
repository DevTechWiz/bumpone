# BumpOne.lol — Development Plan

## Phase 0 — Rules Lock

Before coding:

- finalize ranking mechanics
- finalize top-up/quote mechanics
- finalize stale-quote behavior
- finalize profile ownership
- finalize moderation rules

No UI/backend implementation should begin until these are fixed.

---

# Phase 1 — Static Prototype

Build:

- homepage
- board
- variable tile sizes
- fake profiles
- fake active values
- bump animation

No database.

Goal:

Validate the visual concept.

---

# Phase 2 — Database

Implement:

- profiles
- purchases
- rank events
- system state
- reports

Seed fake data.

---

# Phase 3 — Real Ranking Engine

Implement:

- insertion
- downward shifting
- infinite ranks
- top-100 query
- active-value-based sorting
- top-up calculation
- strict-exceed validation
- transaction safety

Write automated tests before Dodo Payments integration.

---

# Phase 4 — Authentication

Implement:

- sign in (Supabase Auth: Magic Link + Social OAuth)
- multi-profile ownership (1 account can own and manage multiple slots)
- profile creation and claim
- profile editing & top-up

---

# Phase 5 — Image Upload

Implement:

- upload
- validation
- resizing
- storage
- preview

---

# Phase 6 — Dodo Payments

Implement:

- checkout session (Dodo Hosted Checkout)
- webhook verification (standard webhook headers)
- payment verification
- idempotency (payment_events)
- atomic ranking transaction RPC

---

# Phase 7 — Realtime

Implement:

- purchase event
- board update
- activity feed
- reconnect handling

---

# Phase 8 — Animation

Connect real events to:

- bump animation
- active value animation
- profile entrance
- profile exit

---

# Phase 9 — Moderation

Implement:

- reports
- admin queue
- profile suspension
- image moderation

---

# Phase 10 — Production

Test:

- concurrent purchases
- failed payments
- webhook retries
- race conditions
- mobile
- desktop
- accessibility
- security

---

# Phase 11 — Launch

Soft launch with a controlled number of users.

Monitor:

- purchase conversion
- average purchase amount
- repeat purchases
- board activity
- errors
- moderation issues

---

# Appendix — Pre-Launch Compliance Gaps (UI Port Audit)

Tracked deviations between the shipped UI prototype and the canonical docs. All must close before real-money launch.

- [ ] **GAP-1 — Admin system missing.** `15_ADMIN_SYSTEM` mandates a dashboard (top-100, revenue, purchases, reports, chargebacks, moderation queue, audit log, pause-purchases). Removed during the reference-UI port by owner decision. Restore as `/admin` before launch.
- [ ] **GAP-2 — No authentication.** Buying/top-up uses free-text handles. `05` requires auth for create/claim/buy/top-up/edit/manage. Closes with Supabase Auth (Phase 4).
- [ ] **GAP-3 — Post-bump result screen partial.** `05`/`06` require previous → new rank plus the displaced-profiles list. Currently covered fragmentarily (BumpNotification + highlight + feed). Restore a dedicated result step in the purchase flow.
- [ ] **GAP-4 — Server authority is mocked.** Ranking mutates client-side in the prototype. Production requires the webhook-authoritative transaction, RLS, and idempotency per `09`/`10`/`24` (Phase 6).
- [ ] **GAP-5 — LeaderboardModal subtitle.** FIXED: now reads "Ranked by active value…" instead of the reference's "amount paid" wording.
- [ ] **GAP-6 — `07_BOARD_LAYOUT` tiers.** FIXED: rank groups now describe the adopted concentric tiers (king / elite #2–13 / vanguard / contenders / #100 drop brink).