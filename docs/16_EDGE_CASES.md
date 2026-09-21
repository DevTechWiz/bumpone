# Bumped.lol — Edge Cases

## Simultaneous Purchases

Two users purchase the same position simultaneously.

Solution:

Serialize ranking transactions.

The second transaction sees the updated board.

### Concurrent Bumps

Two users attempting to take similar positions must be resolved atomically.

At payment confirmation, each purchase is recomputed against the current ranking state using the amount actually paid; quotes never reserve ranks.

Final ranking must remain valid:

```text
higher active value >= lower active value
```

and equal values are ordered by earliest rank-event sequence (monotonic `global_event_sequence`).

---

## Service Shutdown

Bumped.lol does NOT have to operate forever.

Document:

* service may be suspended or discontinued
* users must be informed according to applicable law/contract
* treatment of active rankings must be defined
* treatment of pending payments must be defined
* treatment of refunds must be defined
* backups and required records must be retained for applicable periods

Do NOT describe active ranking value as guaranteed permanently.

---

## Domain Expiration

The domain is infrastructure, not ownership of user value.

Operationally:

* keep domain registration active while the service operates
* enable renewal reminders/auto-renew where appropriate
* maintain registrar access
* maintain backup administrative access
* maintain DNS records/documentation

If the domain expires unexpectedly, the service should have documented recovery procedures.

---

## Payment Provider Failure

Define behavior when:

* provider is unavailable
* webhook is delayed
* checkout is interrupted
* webhook arrives after user closes browser
* duplicate webhook is received

Board does not update until payment is verified. Webhook idempotency prevents duplicate processing; webhooks must be retryable.

---

## User Opens Checkout

User sees a quote to pass #50 with active value $60.

Another person purchases.

User completes checkout afterward.

The quote is informational (valid 10 minutes) and never reserves a rank. At payment confirmation, the server recomputes the final position against the current ranking state using the amount actually paid. The user receives the highest position their resulting active value qualifies for, which may differ from the quoted expectation.

Never trust stale frontend quotes.

---

## Payment Completed Twice

Webhook idempotency prevents duplicate insertion.

---

## Stripe Webhook Delayed

Board does not update until payment is verified.

---

## Stripe Webhook Replayed

Same event ID must be ignored after first successful processing.

---

## User Closes Browser After Payment

Webhook still processes the purchase.

---

## Image Upload Succeeds but Payment Fails

Image can remain as temporary/unpublished data.

Clean up orphaned uploads periodically.

---

## Payment Succeeds but Database Transaction Fails

Webhook should be retryable.

Use idempotent processing.

---

## User Already Has a Profile

A user can own one active profile.

When purchasing again, the system MOVES their existing profile to the new position rather than creating a duplicate.

Algorithm:
1. Remove profile from current position.
2. Shift profiles between old and new positions.
3. Insert profile at new position.
4. Update active_value.

Alex must not exist twice on the board.

---

## User Is Below #100

They remain in the database.

They can return.

---

## User Is #101

They are not shown on the homepage.

---

## User Becomes #100

They become visible again automatically.

---

## Board Has Fewer Than 100 Users

No one is removed from the system.

---

## Invalid URL

Reject before checkout.

---

## Invalid Image

Reject before checkout.

---

## Moderated Profile

Profile can be hidden from public display without deleting purchase history.

---

## Refund

Do not automatically reverse ranking history.

Rollback mechanism:
1. Mark purchase as `refunded`.
2. Restore profile's `current_active_value` to pre-purchase amount.
3. Recalculate rank based on restored active value.
4. Shift other profiles up to fill the gap.
5. Record `refund_event` in rank_events.
6. Historical rank_events remain unchanged.

Handle through moderation/admin workflow.

---

## User Changes Category

User switches from AI to Apps.

Their global rank and active value remain unchanged.

Their category rank changes to their position in the Apps category.

No payment required.

---

## User Visible in Category But Not Global

User has category rank #5 in AI but global rank #150.

They appear in the AI category view but not on the global board.

Their profile shows both ranks.

---

## Category Has Fewer Than 100 Users

The category view shows all profiles in that category.

Empty positions can be represented subtly.

---

## User With No Category

Reject profile creation without a category.

Category is required.

---

## Category Changes After Purchase

If a user changes category after a purchase, their rank in the new category is derived from their active value.

No re-purchase needed.

---

## Reaction Abuse

A user attempts to react multiple times to the same profile.

Solution:

Unique constraint on (profile_id, user_id, reaction_type).

Rate limiting on reaction endpoint.

---

## Reaction on Non-Existent Profile

Reject reaction if profile does not exist.

---

## Share Card for Old Bump Event

Share cards can be generated for any bump event in the profile's history.

The card shows the rank change from that specific event.

---

## Share Card URL Persistence

Share cards are permanently accessible via URL.

Even if the profile is later moderated, the share card URL should handle gracefully (show "profile no longer available" or similar).

---

## Bumped Passport for New Profile

A newly created profile with no rank history shows:

Peak Rank: —
Times Bumped: 0
Times Climbed: 0
Rank Journey: (empty)

---

## Profile Views Counter

Profile views are incremented on each unique visit to the passport page.

Rate limit: one view per IP per profile per hour.

---

## Simultaneous Reactions

Two users react to the same profile simultaneously.

Solution:

Reaction counts are denormalized and updated atomically.

No race conditions on count updates.

---

## Bump Feed Event Ordering

Events should appear in the feed in the order they were processed.

Use server timestamps or sequence numbers for ordering.
