# BumpOne.lol — Product Rules

## Rule 1 — Infinite Ranking

The ranking system is conceptually unlimited.

There is:

#1
#2
#3
...
#∞

There is no permanent rank #100.

The homepage only displays the top 100.

---

## Rule 2 — Ranking Is Determined by Active Value

Every profile has a `current_active_value`.

The ranking is sorted by current_active_value descending:

#1   $710
#2   $700
#3   $250
#4   $100

Higher active value = higher position.

The ranking must always satisfy:

active_value(#1) >= active_value(#2) >= active_value(#3) >= ...

The top-up formula guarantees a new purchase strictly exceeds its target, so ties do not arise from the purchase path. As a safety net (e.g. after an admin override), equal values are ordered by earliest rank-event sequence (monotonic `global_event_sequence`; the profile that first reached the value ranks higher).

`current_active_value DESC` plus this sequence tiebreak is the canonical ranking source. `current_rank` may be stored as a materialized cache for performance, but it is never the source of truth.

---

## Rule 3 — Active Value Carries Forward

A user's current active value acts as credit toward a higher position.

They do NOT have to repay their full value every time they bump upward.

Example:

#1  = $700
#50 = $500

The #50 user wants to move to #1.

Their existing $500 active value carries forward.

They pay:

$700 - $500 + $10 = $210

Their new active value becomes:

$500 + $210 = $710

They become #1.

---

## Rule 4 — Minimum Top-Up

A completely new user must make a top-up of at least $10.

This minimum applies to both first purchases and later bumps.

---

## Rule 5 — Top-Up Formula

To move above another user, the required top-up is:

top_up = target_value - current_active_value + minimum_increment

Where minimum_increment = $10. Payments and active values use whole USD only.

The new active value must be strictly greater than the target's active value.

Example:

User has active value $500.
Target #1 has active value $700.

top_up = $700 - $500 + $10 = $210

New active value = $500 + $210 = $710

$710 > $700 ✓

---

## Rule 6 — Strict Exceed

To move above a user, the new active value must be strictly greater than that user's active value.

The top-up formula guarantees strict exceed on the purchase path.

Residual equal values (e.g. produced by an admin override) are ordered by earliest rank-event sequence (see Rule 2) so the ranking stays valid.

---

## Rule 7 — Buying a Position

A buyer selects a target position.

The system calculates the top-up required based on the target's active value and the buyer's current active value.

The buyer pays the top-up amount.

Their active value increases by the payment amount.

Example:

Current:

#3   $100
#4   $70
#5   $50
#6   $40

New user has active value $0, pays $60 to enter above #5:

New active value = $0 + $60 = $60

#3   $100
#4   $70
#5   $60  (new user)
#6   $50
#7   $40

---

## Rule 8 — Filling Before Removal

The system never removes a profile simply because somebody purchases a position.

If there is an unused rank below the currently populated range, the displaced users simply move down.

Example:

Current population = 40 users.

A purchase at #20:

#20 → new user
#20 old → #21
...
#40 old → #41

Nobody is removed.

---

## Rule 9 — Leaving the Visible Board

Once more than 100 ranked users exist, a user pushed below #100 leaves the visible homepage board.

Example:

Old #100 becomes:

#101

They are no longer displayed on the homepage.

Their profile remains stored.

---

## Rule 10 — No Automatic Deletion

Being pushed out of the top 100 does NOT delete the user.

Their profile, purchase history and rank history remain stored.

---

## Rule 11 — Main Board Visibility

The homepage displays:

#1–#100

Ranks #101+ are not displayed on the main board.

---

## Rule 12 — Position Size

Higher positions receive more visual prominence.

#1 is dramatically larger than lower positions.

#2–#10 receive medium prominence.

Lower positions receive progressively smaller visual treatment.

Exact layout is defined in BOARD_LAYOUT.md.

---

## Rule 13 — Successful Purchase

A purchase only affects the ranking after payment has been successfully confirmed by the payment provider.

Frontend confirmation alone is never sufficient.

---

## Rule 14 — Failed Payment

A failed, cancelled, expired or incomplete payment causes:

- no ranking change
- no profile insertion

---

## Rule 15 — Atomic Updates

A purchase must update:

1. payment record
2. ranking
3. profile placement
4. event history

as one atomic backend operation.

---

## Rule 16 — Race Conditions

Two simultaneous purchases must never corrupt the ranking.

The database must serialize ranking mutations.

Each top-up is calculated independently based on the buyer's current active value at the time of processing.

---

## Rule 17 — Profile Ownership and Multi-Slot Support

A user account can own and manage multiple profiles/slots on the board (e.g. promoting different apps or projects).

Each profile maintains its own independent active value and rank journey:
- When topping up an existing profile, its active value carries forward.
- When creating a new profile for another product, it starts fresh with its own active value.

---

## Rule 18 — Public Transparency

The homepage should clearly communicate the core concept without forcing users to read a long explanation.

Detailed rules are available through "How It Works".

---

## Rule 19 — Categories

Users belong to a category (e.g., AI, Apps, Websites, Creators, Games, Design, Tech).

Each category has its own derived ranking based on `current_active_value`.

Category rankings use the same `current_active_value` as the global ranking.

No separate payments. No separate pricing. No category-specific inflation.

A user's position can differ between global and category rankings.

The global ranking is the primary ranking. Category rankings are derived.

---

## Rule 20 — Category Selection

A user selects a category when creating or updating their profile.

One active profile can only belong to one category at a time.

Changing category does not affect the user's `current_active_value` or global rank.

---

## Rule 21 — Category Visibility

Each category view displays the top 100 profiles within that category.

The infinite ranking concept applies within categories.

A user may be visible in their category view but not on the global board (if their global rank is below #100 but their category rank is within #100).

---

## Rule 22 — Bump History

Every successful purchase creates a rank event.

Rank events are stored and displayed as a profile's ranking journey.

The profile shows:

- Peak Rank (highest rank ever achieved)
- Current Rank
- Times Bumped (total purchases)
- Times Climbed (number of upward rank changes)
- Full rank journey visualization

History is public and permanent.

---

## Rule 23 — Three Discovery Signals (Power, Popular, Trending)

The platform provides three distinct discovery views:

1. 💰 **Power (Primary)**: Authoritative ranking by `current_active_value DESC`. Paid attention rules the board.
2. ❤️ **Popular**: Community-sorted view by total emoji reactions (`fire + eyes + heart + laugh`). Reactions provide social proof but NEVER alter active value or the primary Power ranking.
3. 📈 **Trending**: Momentum-based view sorted by climb velocity (number of ranks climbed in the last 24 hours).

---

## Rule 24 — Shareable Bump Moments

After a successful bump, a shareable visual card is generated.

The card shows:

- New rank
- Number of profiles displaced
- Active value and handle
- BumpOne.lol branding

The card is designed for social sharing on X/Twitter and LinkedIn. Sharing is optional and does not affect ranking.

---

## Rule 25 — Bumped Passport

Every profile has a permanent public profile page.

The passport shows:

- Peak Rank
- Current Rank
- Current Active Value (Current ranking power)
- Total Lifetime Spend (`total_paid`)
- Joined date
- Times Bumped
- Times Climbed
- Profile Views
- Full Rank Journey (chronological sequence of events)

The profile's ranking journey becomes part of its digital prestige.

---

## Rule 26 — Post-Bump Result Screen

After a successful purchase, the buyer sees a celebratory result screen showing:

- Previous rank → New rank
- Number of profiles displaced
- New active value
- Profiles that were pushed down
- 1-click share card

The result feels like a victory event, not a generic payment receipt.

---

## Rule 27 — The Concentric Board Tiers & Graveyard

The board physically represents status across 5 visual tiers:

1. **#1 The King Throne**: A colossal center sovereign anchor dominating the board.
2. **#2–#5 Champions**: Four cardinal 2×2 anchor tiles (North, South, East, West) framing the King.
3. **#6–#15 Elite Council**: 10 inner-ring display cards with glowing sky-blue accents.
4. **#16–#40 Vanguard**: 25 mid-tier cards with emerald borders.
5. **#41–#100 Perimeter Contenders**: 60 single-cell cards extending to the #100 drop brink.
6. **#101+ The Graveyard (Billboard Archive)**: Profiles pushed beyond #100 drop into the Billboard Archive. Their active value is preserved permanently, and they can top up at any time to reclaim a spot on the live board.

---

## Rule 28 — Paid Ranking Is an Attention Service

Users pay to increase the Active Value of their profile and obtain higher visual prominence on the live attention board.

The payment does NOT represent:

* ownership of the platform
* permanent guarantee of rank (competitors can bump you)
* an investment, security, or financial instrument
* a redeemable cash balance or wallet
* a prize entry

---

## Rule 29 — Ranking Is Dynamic (Player vs. Player)

A user's position is never static. Another user can pay enough to overtake them. Active value carries forward permanently; there is no artificial time-decay or coin-burn. Bumping occurs purely when another real competitor outspends you.

---

## Rule 30 — Service Availability

BumpOne.lol may modify, suspend, or discontinue the service subject to its Terms and applicable law. Do not describe rankings as lifetime guarantees.
