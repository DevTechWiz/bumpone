# BumpOne.lol — Core Mechanics

## Conceptual Model

Bumped consists of three independent systems:

1. Ranking
2. Position pricing
3. Visual presentation

Do not combine these into a single "bid amount = rank" database field.

---

# 1. Ranking

Ranking represents the current ordering of profiles.

Example:

User A = #1
User B = #2
User C = #3

A purchase at #2 creates:

New User = #2
User B = #3
User C = #4

---

# 2. Position Pricing

Each profile stores a `current_active_value`.

This value carries forward and grows with each top-up.

The ranking is always sorted by current_active_value descending.

Example:

User A has active value $700  → #1
User B has active value $250  → #2
User C has active value $100  → #3

When a new user pays $150 (with $0 starting value):

User A has active value $700  → #1
User B has active value $250  → #2
User NEW has active value $150 → #3
User C has active value $100  → #4

---

# 3. Visual Presentation

The UI translates rank into visual prominence.

Rank is not simply represented as text.

The board should communicate hierarchy visually.

---

# 4. Category Ranking

Categories are derived rankings.

Each profile belongs to a category.

Category ranking is computed by filtering profiles to that category and sorting by `current_active_value` descending.

The same `current_active_value` is used for both global and category rankings.

Example:

Global ranking:

#1  A  active value $700  (AI)
#2  B  active value $250  (Apps)
#3  C  active value $100  (AI)
#4  D  active value $90   (Apps)
#5  E  active value $80   (Design)

AI category ranking:

#1  A  active value $700
#2  C  active value $100

Apps category ranking:

#1  B  active value $250
#2  D  active value $90

Design category ranking:

#1  E  active value $80

Category rankings are not stored. They are derived at query time.

---

# 5. Bump Events

Every successful purchase creates a bump event.

A bump event contains:

- profile_id
- display_name
- old_rank
- new_rank
- category
- timestamp
- profiles_displaced

Bump events power:

- the live bump feed
- profile rank history
- post-bump result screen
- shareable bump moments

---

# 6. Reactions

Visitors can react to profiles with emoji reactions.

Available reactions:

🔥 fire
👀 eyes
❤️ heart
😂 laugh

Reactions are purely social/discovery signals.

Reactions NEVER change rank.
Reactions NEVER affect Active Value.

Each user can react to the same profile once per reaction type.

Reactions are rate-limited to prevent abuse.

Reaction counts are stored and displayed on profile tiles.

---

# 7. Profile Metrics

Each profile tracks:

- Peak Rank (highest rank ever achieved)
- Current Rank
- Current Active Value
- Times Bumped (total purchases)
- Times Climbed (number of upward rank changes)
- Profile Views
- Join Date

These metrics power the Bumped Passport.

---

# Purchase Algorithm

The canonical ranking source is `current_active_value DESC` with earliest rank-event sequence as tiebreak. The rank shifts below materialize that ordering into the cached `current_rank` field; they never override it.

At payment confirmation, the final position is always recomputed against the current ranking state using the amount actually paid (see the 10-minute quote rule in `09_API_SPEC.md` / `10_PAYMENT_FLOW.md`).

Given:

- buyer's current active value
- payment amount (top-up)
- current number of ranked profiles
- existing profiles with their active values

Perform:

1. Validate payment.
2. Confirm payment via provider.
3. Lock ranking state.
4. Calculate new active value = current_active_value + payment_amount.
5. Find correct position: rank by active value descending, buyer's new active value must strictly exceed the target's active value.
6. If buyer already has a profile: **remove from current position.**
7. Shift all profiles at the target rank and below downward by one.
8. Insert buyer at the determined rank.
9. Update buyer's current_active_value.
10. Record purchase.
11. Commit transaction.
12. Broadcast board update.

---

# Example — Existing Profile Moving

Before:

#1 A  active value $700
#2 B  active value $600
...
#50 Alex  active value $500

Alex (active value $500) pays $210.

New active value = $500 + $210 = $710.

Algorithm steps:
- Step 6: Remove Alex from #50.
- Step 7: Shift #1–#49 down by one.
- Step 8: Insert Alex at #1.
- Step 9: Update Alex's active value to $710.

After:

#1   Alex  active value $710
#2   A     active value $700
#3   B     active value $600
...

Alex exists exactly once. No duplicate.

---

# Example

Before:

#1 A  active value $700
#2 B  active value $250
#3 C  active value $100
#4 D  active value $90
#5 E  active value $80

New user (active value $0) pays $150.

After:

#1 A  active value $700
#2 B  active value $250
#3 NEW active value $150
#4 C  active value $100
#5 D  active value $90
#6 E  active value $80

Nothing is deleted.

---

# Top-Up Example

Before:

#1 A  active value $700
#2 B  active value $250
#3 C  active value $100

User C (active value $100) wants to reach #1.

top_up = $700 - $100 + $10 = $610

C pays $610.

New active value for C = $100 + $610 = $710.

After:

#1 C  active value $710
#2 A  active value $700
#3 B  active value $250

---

# Full Board Example

Before:

#1 A  active value $700
#2 B  active value $250
...
#99 Y  active value $20
#100 Z active value $10

New user (active value $0) pays $50.

After:

#1 A  active value $700
#2 B  active value $250
...
#50 NEW active value $50
#51 old positions (same active values)
...
#100 old #99
#101 old #100

The old #100 remains in the database but is no longer visible on the main board.

---

# Important

Do not physically delete profiles pushed below #100.

Rank changes are state transitions.

Historical data must remain available.
