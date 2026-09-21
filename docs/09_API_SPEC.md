# Bumped.lol — API Specification

## GET /api/board

Returns top 100 profiles (global).

Query params:

category (optional) — filter by category

Response:

profiles[]
total_profiles
last_event

---

## GET /api/board/:category

Returns top 100 profiles in the specified category.

Response:

profiles[]
total_profiles
category
last_event

---

## GET /api/categories

Returns list of available categories.

Response:

categories[]
  name
  slug
  profile_count

---

## GET /api/profile/:id

Returns:

profile
current_rank
global_rank
category_rank
current_active_value
rank_history
metrics
  peak_rank
  times_bumped
  times_climbed
  profile_views
  joined_at
reactions
  fire
  eyes
  heart
  laugh

---

## GET /api/profile/:id/journey

Returns full rank journey for a profile.

Response:

journey[]
  old_rank
  new_rank
  category
  profiles_displaced
  timestamp
metrics
  peak_rank
  times_bumped
  times_climbed

---

## GET /api/bump-feed

Returns recent bump events for the live feed.

Query params:

category (optional) — filter by category
limit (optional) — number of events (default 20)

Response:

events[]
  id
  profile_id
  display_name
  old_rank
  new_rank
  category
  profiles_displaced
  timestamp

---

## POST /api/purchase/create

Input:

target (rank or profile reference the buyer wants to exceed)
profile data
category

The client never submits a payment amount. The server quotes the required top-up.

### Quote Validity

The quote is informational and does not reserve a rank. It is valid for **10 minutes** (`expires_at` returned with the quote).

At successful payment confirmation, the server recomputes the user's resulting position against the current ranking state using the amount actually paid. If the board changed during checkout, the user receives the highest position their resulting active value qualifies for.

Before checkout, the server must calculate:

* user's current active value
* target/current value
* required top-up
* resulting active value
* resulting rank

The frontend must display the result before checkout.

Example:

```text
Current value: $500
Current target: #1 at $700
You pay: $210
New value: $710
Expected rank: #1
```

(The $210 / $710 figures use the canonical $10 minimum increment. Expected rank follows the 10-minute quote rule: recomputed at payment confirmation.)

The server remains authoritative.

The client cannot submit its own:

* rank
* active value
* required payment
* final position

Returns:

quote_id
quoted_top_up
expires_at (quote creation + 10 minutes)
checkout URL/session
post_bump_result (expected, recomputed at payment confirmation)
  previous_rank
  new_rank
  profiles_displaced
  new_active_value

No ranking change occurs here.

---

## POST /api/webhooks/stripe

Receives Stripe webhook.

Only the verified payment webhook/provider confirmation may finalize the ranking change.

Responsibilities:

1. Verify Stripe signature.
2. Verify payment.
3. Ensure idempotency.
4. Process purchase.
5. Calculate new active value = buyer's current_active_value + payment_amount.
6. Recompute rank against the current ranking state: order by current_active_value DESC with earliest rank-event sequence as tiebreak; the buyer receives the highest position their new active value qualifies for.
7. Mutate ranking (update materialized current_rank values).
8. Record rank event (with next global_event_sequence).
9. Update profile metrics.
10. Broadcast board update.
11. Broadcast bump feed event.

---

## POST /api/reactions

Input:

profile_id
reaction_type (fire, eyes, heart, laugh)

Adds or toggles a reaction.

Rate limited.

Response:

reaction_counts
  fire
  eyes
  heart
  laugh

---

## DELETE /api/reactions/:id

Removes a reaction.

Response:

reaction_counts

---

## POST /api/shares

Input:

profile_id
bump_event_id (optional)

Generates a shareable bump moment card.

Response:

share_url
card_data
  new_rank
  profiles_displaced
  display_name
  image_url

---

## GET /api/share/:share_url

Returns shareable bump moment card data.

Response:

card_data
  new_rank
  profiles_displaced
  display_name
  image_url
  created_at

---

## GET /api/activity

Returns recent public bump events.

Query params:

category (optional) — filter by category

---

## POST /api/report

Allows users to report a profile.

---

# Security

Never allow clients to directly modify:

rank
purchase status
current_active_value
category
profile_metrics
reaction_counts

These are server-controlled.
