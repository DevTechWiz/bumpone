# BumpOne.lol — Ranking and Bumping

## Ranking Model

Every profile has a `current_active_value`.

Ranking is sorted by current_active_value descending.

---

## Sorting Rule

The canonical ranking source is `current_active_value DESC`. Equal values are ordered by earliest rank-event sequence (monotonic `global_event_sequence`; the profile that first reached the value ranks higher). `current_rank` is a materialized cache of this ordering, never the source of truth.

### Simultaneous Purchases & Equal Active Value Handling
If two users buy for the same slot simultaneously and pay the same top-up (e.g. Alice and Bob both pay $110 to claim #1):
1. **1st confirmed webhook (Alice)** receives sequence #1042 -> takes **Rank #1**.
2. **2nd confirmed webhook (Bob)** receives sequence #1043 -> takes **Rank #2** (because both have $110, but #1042 < #1043).
3. Neither payment is rejected; both users are live on the board.

---

## Move Operation

When a purchase is confirmed, the final position is recomputed against the current ranking state using the amount actually paid (quotes never reserve a rank; see `10_PAYMENT_FLOW.md`):

### New Profile (no existing profile):

1. Calculate new active value = 0 + payment_amount.
2. Find the target position: the buyer's active value must strictly exceed the target's active value.
3. Shift all profiles at that rank and below downward by one.
4. Insert buyer at the determined rank.
5. Record purchase.

### Existing Profile (buyer already has a profile):

1. Calculate new active value = current_active_value + payment_amount.
2. Find the target position: the buyer's new active value must strictly exceed the target's active value.
3. **Remove buyer from their current position.**
4. Shift all profiles between old position and new position appropriately.
5. Insert buyer at the determined rank.
6. Update buyer's current_active_value.
7. Record purchase.

---

## Example — New Profile

Before:

A  active value $700  #1
B  active value $250  #2
C  active value $100  #3
D  active value $90   #4
E  active value $80   #5

New user (active value $0) pays $150:

A  active value $700  #1
B  active value $250  #2
X  active value $150  #3  (new)
C  active value $100  #4
D  active value $90   #5
E  active value $80   #6

---

## Example — Existing Profile Moving Up

Before:

#1  A  active value $700
#2  B  active value $600
...
#50  Alex  active value $500

Alex (active value $500) pays $210.

New active value for Alex = $500 + $210 = $710.

Algorithm:
1. Remove Alex from #50.
2. Shift #1–#49 down by one (A becomes #2, B becomes #3, etc.).
3. Insert Alex at #1 with active value $710.

After:

#1   Alex  active value $710
#2   A     active value $700
#3   B     active value $600
...
#50  (previous #49 user)

Alex exists exactly once. No duplicate.

---

## Top-Up Example

Before:

A  active value $700  #1
B  active value $250  #2
C  active value $100  #3

User C (active value $100) wants to reach #1.

top_up = $700 - $100 + $10 = $610

C pays $610.

New active value for C = $100 + $610 = $710.

Algorithm:
1. Remove C from #3.
2. Shift #1–#2 down by one (A becomes #2, B becomes #3).
3. Insert C at #1 with active value $710.

After:

C  active value $710  #1
A  active value $700  #2
B  active value $250  #3

C exists exactly once. No duplicate.

---

## Empty Board

If there are no users:

First user can enter at #1.

---

## Partial Board

If there are 40 users and someone pays an amount that places them at #20:

Ranks become:

1–19 unchanged
20 = new user
21–41 = displaced users

No user is removed.

---

## Full Board

If there are 100+ users and a new purchase pushes someone below #100:

New user enters at their active value rank.
Old #100 becomes #101.
No database deletion occurs.

---

## Visibility

Homepage query:

WHERE rank <= 100
ORDER BY rank ASC

---

## User's Actual Rank

A user outside the top 100 may still have:

#101
#102
#500
#1247

Their profile can show their current rank to themselves.

---

## Rank History

Every successful purchase creates a rank event.

Rank events are stored permanently.

Each rank event contains:

- profile_id
- display_name
- old_rank
- new_rank
- category
- timestamp
- profiles_displaced

The rank history powers:

- Bumped Passport (profile journey page)
- Post-bump result screen
- Live bump feed
- Shareable bump moments

Example rank journey:

#83 → #54 → #23 → #8 → #4 → #18

Derived metrics from rank history:

- Peak Rank: highest rank ever achieved
- Times Bumped: total number of purchases
- Times Climbed: number of upward rank changes

---

## Serialization

Rank mutations must be serialized.

Two simultaneous purchases processing concurrently must not corrupt the ranking.

Use database transactions or row-level locks to ensure ordering.

Each top-up is calculated independently based on the buyer's current active value at the time of processing.

---

## Category Rankings

Category rankings are derived from the global ranking.

Each profile belongs to a category.

Category ranking = filter profiles by category, sort by `current_active_value` descending.

The same `current_active_value` is used. No separate payments.

Example:

Global:

#1  A  $700  AI
#2  B  $250  Apps
#3  C  $100  AI
#4  D  $90   Apps

AI category:

#1  A  $700
#2  C  $100

Apps category:

#1  B  $250
#2  D  $90

Category rankings are not stored in the database. They are computed at query time.

Top 100 visibility applies to each category view independently.

A user may be visible in their category view but not on the global board.
