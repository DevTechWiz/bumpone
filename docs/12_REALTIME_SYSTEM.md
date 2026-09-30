# BumpOne.lol — Realtime System

## Goal

When one person purchases a position, every active visitor should see the wall update without refreshing.

The live bump feed should update in real time.

---

# Events

Realtime events should support:

* new profile entry
* profile climb
* profile bump
* profile pushed down
* profile entering/leaving top 100
* rank history update
* activity-feed event
* reaction count update

Realtime is informational/UI-driven.

The database/server remains authoritative.

## purchase.completed

Payload:

purchase_id
new_profile
old_top_100
new_top_100
category
category_rank_change
profiles_displaced
post_bump_result
timestamp

---

## bump.feed

Payload:

event_id
profile_id
display_name
old_rank
new_rank
category
profiles_displaced
timestamp

---

## reaction.updated

Payload:

profile_id
reaction_type
reaction_counts
timestamp

---

# Dual-Tier Realtime Architecture (Viral-Scale)

### 1. Spectator Tier (100,000+ Viewers) — Cloudflare Edge SWR
* **Mechanism**: Clients poll `GET /api/board` every 5 seconds.
* **Edge Cache**: Responses carry `Cache-Control: public, s-maxage=5, stale-while-revalidate=10`.
* **Zero Database Load**: Cloudflare Edge absorbs 100% of spectator queries.
* **UI Animation**: When the edge snapshot updates with a new sequence number, the client automatically triggers the tile rearrangement and bump sound FX.
* **Zero WebSocket Limits**: Eliminates Supabase Free's 200 concurrent connection limit.

### 2. Interactive Tier — Supabase Realtime Channels
* **Scope**: Reserved exclusively for active authenticated users participating in the **War Room** (`WarRoomDrawer.tsx`) chat channels (Dispatch, Lounge, Kings).
* Stays well below the 200 concurrent connection ceiling on the free tier.

---

# Important

The server/database is authoritative.

Clients should not calculate the final ranking independently.

---

# Client Behavior

When a purchase.completed event arrives:

1. Check event ID.
2. Queue wall animation.
3. Update global wall.
4. Update category wall (if viewing the affected category).
5. Add bump event to live feed.
6. Update post-bump result screen (if buyer).

When a bump.feed event arrives:

1. Add event to live feed display.
2. Animate new event appearance.

When a reaction.updated event arrives:

1. Update reaction counts on profile tile.

---

# Reconnection

If a client disconnects:

On reconnect:

GET /api/board
GET /api/bump-feed

Do not attempt to reconstruct missed events solely from local state.

---

# Concurrent Purchases

Events should have monotonically ordered server timestamps or sequence numbers.

Recommended:

global_event_sequence

This sequence is also the canonical tiebreaker for equal active values (earliest sequence ranks higher) and the ordering key for rank-event history.

Example:

event 1042
event 1043
event 1044
