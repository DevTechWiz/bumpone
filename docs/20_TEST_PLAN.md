# BumpOne.lol — Test Plan

## Ranking Tests

### Empty Board

Insert first user.

Expected:

rank = 1

---

### Insert At #1

Existing:

A #1
B #2
C #3

Insert X #1.

Expected:

X #1
A #2
B #3
C #4

---

### Insert In Middle

Existing:

A #1
B #2
C #3
D #4

Insert X #3.

Expected:

A #1
B #2
X #3
C #4
D #5

---

### Partial Board

40 users.

Insert at #20.

Expected:

40 → 41 users.

No deletion.

---

### Full Board

100 users.

Insert at #50.

Expected:

101 ranked profiles.

Only #1–#100 visible.

Old #100 becomes #101.

---

# Pricing Tests

Ranking is determined by current_active_value.

Test:

- higher active value ranks above lower active value
- top-up formula: target_value - current_active_value + $10
- a top-up below $10 is rejected
- new active value strictly exceeds target active value
- active value carries forward on subsequent bumps
- payment above all existing: enters at #1
- payment below all existing: enters at last position
- payment between two profiles: inserts at correct position
- active value grows with each top-up

---

# Payment Tests

Test:

- successful payment
- failed payment
- cancelled checkout
- delayed webhook
- duplicate webhook
- refund
- chargeback
- payment reversal
- webhook retry

# Quote Tests

Test:

- quote is valid for 10 minutes (`expires_at` = creation + 10 min)
- quote does not reserve a rank
- board changes between quote and payment: final position is recomputed from the amount actually paid, and the buyer receives the highest qualifying position
- payment below the $10 minimum is rejected

# Active Value Tests

```text
$500 + $210 = $710
```

Verify the profile moves above a $700 profile.

(The canonical minimum increment is always +$10.)

# Genesis Pricing Tests

Verify a fresh board seeds face values $100 down to $1 (#1 → #100), and the first takeover of a filled slot adds +$10.

# Ranking Ordering Tests

Verify:

```text
active_value(#1) >= active_value(#2) >= ...
```

Verify equal active values are ordered by earliest rank-event sequence, and that `current_rank` is a cache of `current_active_value DESC` + sequence order, never independently assigned.

# Existing-User Tests

Ensure an existing profile moves rather than creating a duplicate active profile.

---

# Concurrency Tests

Simultaneous purchases cannot produce:

* duplicate ranks
* lost profiles
* incorrect active values
* broken ordering

Simulate:

10 simultaneous purchases.

Expected:

- no duplicate ranks
- no lost profiles
- correct ranking sort order
- deterministic event ordering

Simulate:

10 simultaneous purchases with different current active values.

Expected:

- no duplicate ranks
- no lost profiles
- correct ranking sort order
- deterministic event ordering

Simulate:

Multiple users with same payment amount but different current active values.

Expected:

- each user's new active value is correctly calculated
- ranking reflects active values, not payment amounts

---

# Security Tests

Test:

- unauthorized rank modification
- forged quote / fake payment amount
- fake payment status
- malicious upload
- invalid URL
- SQL injection
- XSS
- CSRF where applicable
- webhook forgery

---

# UI Tests

Test:

- desktop
- tablet
- mobile
- slow network
- disconnected realtime
- reduced motion
- accessibility

---

# Category Tests

### Category Ranking Derivation

Test:

- category ranking derived from global profiles filtered by category
- same active value used for global and category rankings
- category rank can differ from global rank

### Category Selection

Test:

- user can select category during profile creation
- user can change category without payment
- category is required for profile creation

### Category View

Test:

- category view shows top 100 profiles in that category
- category badge displayed on profile tiles
- category name displayed above board
- switching between category tabs loads correct profiles

### Category Edge Cases

Test:

- user visible in category but not global board
- category with fewer than 100 users
- profile count per category is accurate
- realtime events update category view correctly
- global and category rankings remain consistent with the same Active Value

---

# Top-100 Boundary Tests

Verify:

```text
#100 → #101
```

does not delete the profile. The profile remains stored and can climb back.

---

# Reaction Tests

### Reaction Adding

Test:

- user can add reaction to profile
- reaction count increments
- same user cannot add duplicate reaction type
- rate limiting enforced

### Reaction Removing

Test:

- user can remove their reaction
- reaction count decrements

### Reaction Display

Test:

- reaction counts display on profile tile
- reaction counts update in real time
- reaction counts persist across page reloads

---

# Bump History Tests

### Rank Event Creation

Test:

- rank event created on successful purchase
- rank event contains correct old_rank, new_rank
- rank event contains profiles_displaced
- rank events stored permanently

### Profile Metrics

Test:

- peak_rank updated when new peak achieved
- times_bumped incremented on each purchase
- times_climbed incremented on upward rank changes
- profile_views incremented on passport visit

### Bumped Passport

Test:

- passport shows all profile metrics
- rank journey visualization works
- passport accessible via public URL

---

# Share Tests

### Share Card Generation

Test:

- share card generated after successful bump
- card contains correct rank and profiles displaced
- card is publicly accessible via URL
- card matches Bumped Wall visual identity

### Share Card Access

Test:

- share card URL returns correct data
- share card works on social platforms (meta tags)

---

# Bump Feed Tests

### Feed Display

Test:

- bump feed shows recent events
- events appear in correct order
- events update in real time
- clicking event opens profile passport

### Feed Filtering

Test:

- category filter works on bump feed
- limit parameter works correctly
