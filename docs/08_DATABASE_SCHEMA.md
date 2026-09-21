# Bumped.lol — Database Schema

## Core Tables

Recommended tables:

profiles
purchases
rank_events
system_state
reports
admin_actions

---

# profiles

id
user_id
display_name
image_path
destination_url
category_id (FK to categories; exposed as `category` in API responses)
current_rank
current_active_value
current_active_value_minor (integer minor units where enforced; use existing naming convention)
created_at
updated_at
is_active
moderation_status

The profile stores the current active ranking state (`current_rank`, active value, category). The canonical ranking source is `current_active_value DESC` with earliest rank-event sequence as tiebreak; `current_rank` is a materialized cache of that ordering for performance, never the source of truth. Do not treat active value as a wallet balance.

---

# categories

id
name
slug
display_order
created_at

---

# purchases

id
profile_id
stripe_checkout_session_id
stripe_payment_intent_id
amount_minor
currency
stripe/payment-provider transaction ID
previous_active_value_minor
new_active_value_minor
previous_rank
new_rank
status
created_at

Store each actual payment transaction independently. Do not store only the final value and lose transaction history.

Statuses:

created
pending
paid
failed
cancelled
refunded
chargeback
disputed

Use the provider's real status model where appropriate.

---

# rank_events

id
purchase_id
profile_id
sequence (monotonic global_event_sequence; orders events and breaks equal-active-value ties)
previous_rank (a.k.a. old_rank)
new_rank
previous_active_value
new_active_value
category
profiles_displaced
event_type
created_at

Store every ranking movement so that the system can reconstruct the profile's journey (`profile_id`, `previous_rank`, `new_rank`, `previous_active_value`, `new_active_value`, `event_type`, `purchase_id`, `created_at`).

Event types:

inserted
bumped
left_top_100
returned_to_top_100

---

# reactions

id
profile_id
user_id
reaction_type
created_at

Reaction types:

fire
eyes
heart
laugh

Unique constraint: (profile_id, user_id, reaction_type)

Reactions are stored separately from ranking. Reactions must never affect active value, rank, category rank, or payment.

---

# reaction_counts

id
profile_id
reaction_type
count

Denormalized counts for fast reads.

Updated on each reaction add/remove.

---

# shares

id
profile_id
bump_event_id
share_url
created_at

---

# profile_metrics

id
profile_id
peak_rank
current_rank
times_bumped
times_climbed
profile_views
relevant share metrics (where tracked)
updated_at

Denormalized metrics for fast reads.

Updated on each rank event and profile view.

Support the profile-history experience where required: peak rank, current rank, times bumped, times climbed, profile views, relevant share metrics. Avoid storing derived values if they can safely be calculated from event history.

---

# system_state

id
total_profiles
total_purchases
updated_at

Used for analytics and display counters.

Ranking is derived from profile data, not from system_state.

---

# reports

id
profile_id
reporter_id
reason
status
created_at

---

# admin_actions

id
admin_id
action
target_id
metadata
created_at

---

# Important Database Rule

Do not store the entire board as a single JSON document.

Ranking must be queryable.

---

# Unique Constraints

current_rank should be unique among active ranked profiles.

Database constraints should prevent duplicate ranks.

---

# Transactions

Rank mutation must occur inside a database transaction or equivalent atomic server-side operation.