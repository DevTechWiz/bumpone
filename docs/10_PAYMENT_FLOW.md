# BumpOne.lol — Payment Flow

> **Canonical persistence names:** `purchase_quotes`, `projects`, `payments`, `payment_events`, and `board_events`. See [25_PRODUCTION_ARCHITECTURE.md](25_PRODUCTION_ARCHITECTURE.md).

## Payment Provider

**Dodo Payments** (Merchant of Record / Hosted Checkout).

### Provider Setup
* Integration: Dodo Payments REST API / `@dodopayments/dodopayments` SDK.
* Checkout Mode: **Dodo Hosted Checkout**.
* Currency: USD (minor units: cents).
* Webhook Delivery: Standard Webhook signatures (`webhook-id`, `webhook-timestamp`, `webhook-signature`).

---

# Flow

User chooses position.

↓

Frontend sends purchase request (`POST /api/purchase/create`).

↓

Server validates the target, verifies profile ownership via Supabase Auth, and computes the required top-up (server-side quote).

↓

Server creates quote with `expires_at` (creation + 10 minutes) in `purchase_quotes`.
* The quote is informational and does not reserve a rank.

↓

Server calls Dodo Payments API to create a checkout session with:
* Amount in minor units (`quoted_amount_minor`).
* Currency: `USD`.
* Metadata: `{ quote_id, project_id, user_id, mode }`.
* `return_url`: `https://bumpone.lol/?status=pending_payment&quote_id={quote_id}` (informational only).

↓

**No `payments` row is written yet.** `payments`, `board_events`, and `payment_events` are created exclusively by the `process_dodo_purchase` RPC when the verified webhook arrives.

↓

Frontend redirects user to Dodo Hosted Checkout page.

↓

User completes payment on Dodo.

↓

Dodo Payments sends `payment.succeeded` webhook to `https://bumpone.lol/api/webhooks/dodo`.

↓

Server verifies webhook signature using Dodo Webhook Secret (`webhook-id`, `webhook-timestamp`, `webhook-signature`).

↓

Server checks idempotency against `payment_events` table using Dodo `webhook_id` / `payment_id`.
* If already processed, immediately return HTTP 200.

↓

Server executes atomic PostgreSQL transaction / RPC (`process_dodo_purchase`):
1. Recomputes final position against live ranking state using amount actually paid (`amount_minor`).
2. Increments `current_active_value_minor = current_active_value_minor + amount_minor` and sets `ranking_sequence`.
3. Materializes updated ranks for the buyer (`ORDER BY current_active_value_minor DESC, ranking_sequence ASC`) and shifts intermediate profiles down.
4. If a profile falls past rank #100, shifts it to the off-board archive (Graveyard) with a `left_top_100` board event.
5. Inserts immutable rows into `payments`, `payment_events`, and `board_events` (monotonic `event_sequence`).
6. Updates purchase status to `paid`.

↓

The route invalidates the server board cache. Clients pick up the change through their realtime subscription (`postgres_changes` on `board_events`) and polling loop — there is no `realtime_outbox` table or background broadcast worker.

---

# Critical Rule

**Do NOT mutate ranking when the frontend returns from Dodo.**

The Dodo Payments webhook is authoritative.

## Payment Authorization

The webhook is the sole source of truth:
* Do not update `rank`
* Do not update `current_active_value`
* Do not transfer profile ownership

based only on the frontend `return_url` redirect.

---

# Zero Payment Rejection Principle

**Every successful payment processed by Dodo Payments is accepted and placed on the board.**

* **No Payment Is Ever Rejected for Timing Reasons**: A buyer's payment is never cancelled or rejected simply because another user completed checkout a few seconds earlier.
* **100% Value Credited**: 100% of the dollars paid are permanently added to the buyer's profile `current_active_value`.
* **Dynamic Placement**: The buyer is placed at the highest position their resulting active value qualifies for on the live board at the exact millisecond their webhook is processed.

---

# Simultaneous Purchases (Alice & Bob Scenario)

When two users purchase for the same slot (e.g. #1 at $100) at the same time:

1. **Both Pay $110**: Both Alice and Bob are quoted $110 (`$100 - $0 + $10` minimum increment) and complete payment on Dodo.
2. **Database Advisory Lock Queues Them**: When both webhooks arrive, PostgreSQL's `pg_advisory_xact_lock` executes them sequentially (e.g., Alice's webhook runs 5ms before Bob's).
3. **1st Successful Payment (Alice)**:
   * Acquires lock first.
   * Gets monotonic `global_event_sequence = 1042`.
   * Active value becomes **$110**.
   * Takes **Slot #1** (King).
   * Transaction commits.
4. **2nd Successful Payment (Bob)**:
   * Acquires lock next.
   * Gets monotonic `global_event_sequence = 1043`.
   * Active value becomes **$110**.
   * Recomputes against live board: Alice has $110 with earlier sequence 1042.
   * **Earliest sequence wins ties**: Alice retains **Slot #1**, and Bob takes **Slot #2**.
   * Profiles below Bob shift down by 1.
   * Transaction commits.
5. **Outcome**:
   * **Zero rejections**: You retain $220 in total revenue ($110 from Alice + $110 from Bob).
   * Both users are live on the board.
   * Bob is positioned directly behind Alice at #2, incentivizing an immediate $10 top-up to reclaim #1.

---

# Payment States

```text
created
pending
paid
failed
cancelled
disputed
chargeback
```

Mapped to Dodo Payments webhook event types:
* `payment.succeeded` -> `paid`
* `payment.failed` -> `failed`
* `dispute.opened` -> `disputed`

---

# Idempotency

A Dodo event must only be processed once.

Store:
```sql
payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'dodo',
  provider_event_id text not null, -- Dodo webhook-id
  payment_id text,                 -- Dodo payment_id (nullable)
  event_type text not null,        -- e.g. payment.succeeded
  payload jsonb not null,
  processed_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);
```

Any webhook whose `event_id` exists is acknowledged with `200 OK` and bypassed.

---

# Refund Policy

BumpOne operates a competitive auction model. **Application-level refunds are intentionally not supported** because:

1. Payments purchase rank positions that immediately affect other users.
2. Reversing a payment after displacement cascades is logically unsound.
3. Gateway-level chargebacks (Dodo disputes) are handled externally by the payment provider, not by this application.

If a `refund.succeeded` webhook is received, BumpOne acknowledges it with `200 OK` but takes **no application action**.

---

# Chargebacks & Disputes (Triggered by `dispute.opened` webhook)
1. Mark purchase as `disputed`.
2. Generate an administrative alert in `/admin` dashboard.
3. Admin can manually suspend the project via the moderation endpoint, which triggers `recalculate_board_ranks()`.

