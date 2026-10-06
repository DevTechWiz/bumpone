# BumpOne.lol — Realtime System

## Goal

When one person purchases a position, every active visitor should see the wall update without refreshing.

The live bump feed (War Room) should update in real time.

---

# Implementation (actual)

Realtime is **Postgres change streaming**, not a custom event bus:

* **Transport**: Supabase Realtime `postgres_changes` subscriptions (anon/authenticated session), opened from `HomePageClient.tsx` with polling as the fallback (`GET /api/board`, `s-maxage=5`).
* **Published tables**: `board_events`, `projects`, `users`, `messages` (see migration `006_inline_reaction_counts.sql`; `reaction_counts` was dropped).
* **No outbox**: rows become visible to subscribers only after the ranking transaction commits — there is no `realtime_outbox` table and no background broadcast worker.
* **No custom channels**: there is no `purchase.completed`, `bump.feed`, or `reaction.updated` channel. Equivalent information arrives as table change events.

| Intent | Actual event |
|---|---|
| New rank movement / bump feed | `INSERT` on `board_events` |
| Board tile state change (rank, active value, moderation) | `UPDATE` on `projects` |
| Reaction count changes (inlined counts) | `UPDATE` on `projects` / `users` |
| War Room chat message | `INSERT` on `messages` |

Realtime is informational/UI-driven.

The database/server remains authoritative.

---

# Dual-Tier Realtime Architecture (Viral-Scale)

### 1. Spectator Tier (100,000+ Viewers) — Cloudflare Edge SWR
* **Mechanism**: Clients poll `GET /api/board`.
* **Edge Cache**: Responses carry `Cache-Control: public, s-maxage=5, stale-while-revalidate=10`.
* **Zero Database Load**: Cloudflare Edge absorbs ~100% of spectator queries.
* **UI Animation**: When the edge snapshot updates with a new sequence number, the client automatically triggers the tile rearrangement and bump sound FX.
* **Zero WebSocket Limits**: Eliminates Supabase Free's 200 concurrent connection limit pressure.

### 2. Interactive Tier — Supabase Realtime (`postgres_changes`)
* **Scope**: Board-state and War Room chat subscriptions for viewers of the main board; chat is the highest-traffic channel.
* Stays well below the 200 concurrent connection ceiling on the free tier by pairing subscriptions with edge polling.

---

# Important

The server/database is authoritative.

Clients should not calculate the final ranking independently.

---

# Client Behavior

When an `board_events` INSERT arrives:

1. Deduplicate by row `id`.
2. Queue wall animation.
3. Refresh authoritative board state (`GET /api/board`) — sequence gaps or reconnects always refetch.
4. Add event to the live feed display (War Room).
5. Update post-bump result screen (if buyer).

When an `projects` UPDATE arrives:

1. Update the affected tile (rank, active value, inlined reaction counts).
2. If `moderation_status`/`is_active` changed, remove or restore the tile.

When a `messages` INSERT arrives:

1. Append the chat message with anti-spoof author fill.

---

# Reconnection

If a client disconnects:

On reconnect:

`GET /api/board` and `GET /api/war-room/events`

Do not attempt to reconstruct missed events solely from local state.

---

# Concurrent Purchases

Events carry monotonically ordered sequence numbers:

* `board_events.event_sequence` (default from `global_event_sequence_seq`, advanced inside `process_dodo_purchase`).

This sequence is also the canonical tiebreaker for equal active values (earliest `projects.ranking_sequence` ranks higher) and the ordering key for rank-event history.

Example:

event 1042
event 1043
event 1044
