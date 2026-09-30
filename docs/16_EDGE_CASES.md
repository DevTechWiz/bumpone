# BumpOne.lol — Edge Cases

## Simultaneous Purchases (Concurrent Bumps)

Two users purchase the same position (e.g. Slot #1) simultaneously.

### The Rule:
1. **Never Reject a Payment**: Every successful payment received via Dodo Payments is credited. No payment is cancelled due to race conditions.
2. **Database Advisory Locking**: PostgreSQL serializes concurrent webhook transactions using `pg_advisory_xact_lock(hashtext('board_ranking_mutation'))`.
3. **Monotonic Sequence Tiebreaker**: The first transaction to acquire the lock receives the earlier monotonic sequence (`global_event_sequence`), e.g. #1042. The second transaction receives #1043.
4. **Rank Allocation**:
   * **1st Transaction (Alice)**: Takes **Slot #1**.
   * **2nd Transaction (Bob)**: Active value ties with Alice ($110), but because Bob's sequence is later (#1043 > #1042), Bob takes **Slot #2**.
   * Intermediate profiles shift down by 1.
5. **Outcome**: Both profiles are live on the board, both users have their full paid active value credited, and the platform retains 100% of the revenue.

---

## Service Shutdown

BumpOne.lol does NOT have to operate forever.

Document:

* service may be suspended or discontinued
* users must be informed according to applicable law/contract
* treatment of active rankings must be defined
* treatment of pending payments must be defined
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

## Dodo Webhook Delayed

Board does not update until payment is verified.

---

## Dodo Webhook Replayed

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

## User Top-Up vs New Profile

A user account can own and manage multiple profiles (one per slot).

When a user purchases:
1. **Top-Up Existing**: If the user selects one of their existing profiles, the system carries forward that profile's active value and climbs to the higher rank.
2. **New Profile**: If the user creates a fresh profile (e.g. for a second product), it enters the board independently at its paid active value.

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

## Refund Policy

BumpOne does **not** support application-level refunds.

Payments purchase rank positions that immediately affect other users. Reversing a payment after displacement cascades is logically unsound. Gateway-level chargebacks are handled externally by the payment provider.

If a chargeback occurs, an admin can manually suspend the project via the moderation endpoint, which triggers `recalculate_board_ranks()`.

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
