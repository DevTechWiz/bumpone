# Bumped.lol — Payment Flow

## Payment Provider

Stripe Checkout.

### Provider Approval (Required Before Launch)

Before launch:

* Confirm that the selected payment provider permits the exact Bumped.lol model.
* Document the approved business description.
* Store provider-specific restrictions in operational documentation.
* Do not assume that another platform's payment arrangement means Bumped automatically qualifies.

---

# Flow

User chooses position.

↓

Frontend sends purchase request.

↓

Server validates the target and computes the required top-up (server-side quote).

↓

Server returns the quote with `expires_at` (creation + 10 minutes).

The quote is informational and does not reserve a rank.

↓

Server creates Stripe Checkout Session.

↓

User completes payment.

↓

Stripe sends webhook.

↓

Server verifies webhook signature.

↓

Server checks idempotency.

↓

Server recomputes the final position against the current ranking state using the amount actually paid. If the board changed during checkout, the buyer receives the highest position their resulting active value qualifies for.

↓

Server executes ranking transaction.

↓

Purchase marked paid.

↓

Realtime event published.

---

# Critical Rule

Do NOT mutate ranking when the frontend returns from Stripe.

The Stripe webhook is authoritative.

## Payment Authorization

The payment provider/webhook is authoritative.

Do not change:

* rank
* active value
* profile ownership

based only on the frontend success/return URL.

---

# Payment States

Support at minimum:

```text
created
pending
paid
failed
cancelled
refunded
chargeback
disputed
```

Use the provider's real status model where appropriate.

---

# Idempotency

A Stripe event must only be processed once.

Store:

stripe_event_id

with a unique constraint.

---

# Refunds

Refund behavior must be explicitly defined.

Document a deterministic policy and ensure the ranking engine can execute it safely.

Cases that must be considered before launch:

* refund while #1
* refund while #50
* partial refund
* full refund
* chargeback
* provider dispute
* payment reversal after several later bumps

The final policy must preserve ranking consistency.

## Documented Refund Policy (Current)

### Hard Rule

A refund does NOT retroactively reverse the public ranking.

The ranking is a permanent, append-only record of events.

## Rollback Mechanism

When a refund is processed:

1. Mark the purchase as `refunded` in the database.
2. Set the profile's `current_active_value` to the value BEFORE the refunded purchase.
3. Recalculate the profile's rank based on their new active value.
4. Shift other profiles up to fill the gap.
5. Record a `refund_event` in the rank_events table.
6. Do NOT delete or modify historical rank_events.

## Example

Before refund:
#1 Alex $710
#2 A $700
#3 B $600

Alex's $210 purchase is refunded.

After refund:
#1 A $700
#2 B $600
#3 Alex $500 (active value restored to pre-purchase amount)

Alex's rank_events still show the bump to #1 (historical record).

---

# Chargebacks

Chargebacks should create an administrative event.

Follow the same rollback mechanism as refunds.

Do not attempt to reconstruct the entire ranking history automatically.

---

# Currency

MVP: USD.

Architecture should support additional currencies later.
