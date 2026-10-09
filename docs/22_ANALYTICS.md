# BumpOne.lol — Analytics

> **Implementation notes:** Behavioral/funnel analytics (visitors, unique
> visitors, TAKE YOUR SPOT clicks, checkout starts, conversion rate, shares,
> share cards, category usage, bump-feed engagement) are explicitly out of
> scope per [24_IMPLEMENTATION_CONTRACT.md](24_IMPLEMENTATION_CONTRACT.md)
> ("advanced user analytics") — do not add event ingestion without a new
> approved specification. What ships today:
>
> - Rank/board lifecycle events (`profile_inserted`, `profile_bumped`,
>   `profile_left_top_100`, `profile_returned_top_100`) are the immutable
>   `board_events` journal (`event_type`: `inserted`, `bumped`,
>   `left_top_100`, `returned_to_top_100`).
> - Business metrics — purchases, successful payments, failed payments,
>   chargebacks, total revenue, average payment — are exposed on
>   `GET /api/admin/overview` and rendered on `/admin`.
> - Per-profile ranking metrics (views, peak rank, bumps, climbs, active
>   value) are on `GET /api/profile/[id]`.
> - `reactions`, `views`, and `shares` never influence paid ranking.

## Core Metrics

Track:

- visitors
- unique visitors
- board views
- TAKE YOUR SPOT clicks
- checkout starts
- successful purchases
- conversion rate
- average purchase amount
- total revenue
- repeat purchases
- average rank purchased
- number of users outside top 100
- number of bump events
- share/referral traffic
- category views
- category filter usage
- profiles per category
- most active categories
- reactions per profile
- most reacted profiles
- share card views
- share card clicks
- passport page views
- average profile views per profile
- most viewed profiles
- bump feed engagement

---

# Funnel

Visitor
↓
Board viewed
↓
Take Your Spot
↓
Position selected
↓
Checkout
↓
Payment completed
↓
Purchase appears

---

# Important Product Metric

Repeat purchasing is especially important.

A strong sign is:

User enters
↓
gets bumped
↓
returns
↓
buys again

That indicates the competitive loop is working.

---

# Event Names

board_view
take_spot_clicked
position_selected
checkout_started
payment_completed
profile_inserted
profile_bumped
profile_left_top_100
profile_returned_top_100
profile_shared
report_created
category_view
category_filter_changed
category_selected
reaction_added
reaction_removed
share_card_generated
share_card_viewed
passport_viewed
bump_feed_event_clicked

---

# Operational Metrics (Tracked Separately From Ranking Mechanics)

### Business

* purchases
* successful payments
* failed payments
* chargebacks
* average payment
* top-up amount

### Ranking

* current active value
* rank changes
* peak rank
* number of bumps
* number of climbs

### Product

* wall views
* category views
* profile views
* reactions
* shares
* bump-result views
* return visitors

Do not use reactions, views, or shares to secretly alter paid ranking.