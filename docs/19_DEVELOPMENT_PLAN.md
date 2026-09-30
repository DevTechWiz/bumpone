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

- [x] **GAP-1 — Admin system missing.** RESOLVED: Full `/admin` dashboard restored with overview metrics, moderation controls, and emergency purchase pause toggle.
- [x] **GAP-2 — No authentication.** RESOLVED: Supabase Auth integration, multi-profile ownership, Google One-Tap, and user session handling implemented.
- [x] **GAP-3 — Post-bump result screen partial.** RESOLVED: Dedicated `BumpResultModal` displaying trajectory (#X -> #Y), number of profiles displaced, live cascade details, and one-click `/share/:id` action.
- [x] **GAP-4 — Server authority is mocked.** RESOLVED: Webhook-authoritative transaction via `process_dodo_purchase`, webhook idempotency via `payment_webhook_events`, advisory locking, and RLS policies.
- [x] **GAP-5 — LeaderboardModal subtitle.** RESOLVED: Updated to "Ranked by active value…".
- [x] **GAP-6 — `07_BOARD_LAYOUT` tiers.** RESOLVED: Adopted concentric 5-batch arena geometry engine (#1 King, #2-#5 Champions, #6-#15 Elite Council, #16-#40 Vanguard, #41-#100 Drop Brink).