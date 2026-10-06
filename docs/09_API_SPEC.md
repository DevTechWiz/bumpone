# BumpOne.lol — API Specification

> **Production security override:** see [25_PRODUCTION_ARCHITECTURE.md](25_PRODUCTION_ARCHITECTURE.md). Checkout values are server-derived and admins are authorized via `ADMIN_EMAILS` or Supabase Auth `app_metadata.role`, never PINs.

All endpoints communicate using JSON over HTTPS with ISO-8601 UTC timestamps.

---

## Public Endpoints

### GET `/api/board`
Returns the authoritative top 100 profiles (global or category-filtered), with multi-signal sorting.

* **Query params:**
  * `category` *(optional)* — string (e.g. `AI`, `Apps`, `Websites`, etc.)
  * `sort` *(optional)* — `power` (default: by active value DESC), `popular` (by emoji reaction count DESC), `trending` (by bump momentum in last 24h)
* **Response Headers:**
  * `Cache-Control: public, s-maxage=5, stale-while-revalidate=10` (Edge CDN caching for massive viral scale).
* **Response `200 OK`:**
```json
{
  "profiles": [
    {
      "id": "uuid",
      "seq": 1042,
      "name": "Solana Syndicate DAO",
      "handle": "@sabor_dao",
      "imageUrl": "https://...",
      "linkUrl": "https://...",
      "category": "Tech",
      "active_value": 710,
      "peak_rank": 1,
      "reactions": { "fire": 230, "eyes": 89, "heart": 45, "laugh": 12 }
    }
  ],
  "total": 100,
  "sort": "power",
  "category": "All",
  "purchasesPaused": false
}
```

---

### Categories
There is no dedicated `/api/categories` endpoint. Categories are a fixed configuration list (`CATEGORIES` in `src/lib/board.ts`), stored in the `categories` table and embedded per project in board/profile payloads.

---

### GET `/api/profile/[id]`
Returns public passport data (lookup by UUID or `@handle`), live rank, active value, lifetime spend, reaction counts, and the embedded rank journey.
* **Response `200 OK`:**
```json
{
  "id": "uuid",
  "name": "Solana Syndicate DAO",
  "handle": "@sabor_dao",
  "category": "Tech",
  "active_value": 710,
  "total_paid": 1200,
  "imageUrl": "https://...",
  "linkUrl": "https://...",
  "rank": 1,
  "reactions": { "fire": 230, "eyes": 89, "heart": 45, "laugh": 12 },
  "board_events": [
    {
      "event_sequence": 1042,
      "previous_rank": 50,
      "new_rank": 1,
      "profiles_displaced": 49,
      "created_at": "2026-09-26T18:00:00Z"
    }
  ]
}
```

The chronological rank journey is reconstructed from the embedded `board_events` rows — there is no separate `/api/profile/:id/journey` endpoint.

---

### GET `/api/war-room/events`
Returns recent live bump events for the feed (rows from `board_events`).
* **Response `200 OK`:**
```json
{
  "events": [
    {
      "id": "uuid",
      "event_sequence": 1042,
      "project_id": "uuid",
      "project_title_snapshot": "Solana Syndicate DAO",
      "previous_rank": 14,
      "new_rank": 1,
      "new_active_value_minor": 71000,
      "profiles_displaced": 13,
      "created_at": "2026-09-26T21:40:00Z"
    }
  ]
}
```
There is no separate `/api/bump-feed` endpoint.

---

## Purchase & Payment Endpoints

### POST `/api/purchase/create`
Generates a 10-minute informational quote and initiates a Dodo Hosted Checkout session.

* **Authentication:** Required (Supabase Auth session).
* **Rate limit:** 5 requests/min per user.
* **Request Body (Zod validated):**
```json
{
  "mode": "new | top_up",
  "projectId": "uuid (required when mode=top_up)",
  "topUpAmount": 210,
  "targetRank": 1,
  "title": "My App",
  "handle": "myapp",
  "linkUrl": "https://myapp.com",
  "imageUrl": "https://assets.bumpone.lol/projects/uuid.webp",
  "category": "Tech"
}
```

* **Server Logic:**
  1. Checks the `PURCHASES_PAUSED` environment variable. If `true` -> `503 Service Unavailable`.
  2. Resolves buyer's current active value (`current_active_value_minor`, 0 for a new project draft).
  3. Finds the target slot's active value on the live board.
  4. Quotes top-up: `required = max($10, target_value - current_value + $10)`; rejects with `409` if `topUpAmount` is below it.
  5. Inserts quote record into `purchase_quotes` (`quoted_amount_minor`, `expected_rank`, `expires_at = now() + 10 minutes`, `status = 'checkout_open'`).
  6. Calls Dodo Payments Checkout API with `amount = quoted_amount_minor` and `metadata = { quote_id, project_id, user_id, mode }`.
  7. **No `payments` row is created here** — `payments`, `board_events`, and `payment_events` are written only by `process_dodo_purchase` when the verified webhook arrives.
* **Response `200 OK`:**
```json
{
  "quote_id": "uuid",
  "checkout_url": "https://checkout.dodopayments.com/...",
  "session_id": "session_123456",
  "expires_at": "2026-09-26T22:04:00Z"
}
```

---

### POST `/api/webhooks/dodo`
Authoritative webhook endpoint handling Dodo Payments notifications.

* **Headers Verified:**
  * `webhook-id`
  * `webhook-timestamp`
  * `webhook-signature`
* **Signature Verification:** Verified using Dodo Webhook Secret via Svix Standard Webhooks / HMAC-SHA256 against raw request body.

* **Handled Event Types:**
  * `payment.succeeded`:
    1. Checks `payment_events` for `webhook-id` idempotency.
    2. Calls `process_dodo_purchase` RPC function (single authoritative transaction).
    3. Invalidates the server board cache; clients pick up the change via their realtime/polling loop.
    4. Returns `200 OK`.
  * `refund.succeeded`:
    1. Acknowledged with `200 OK` — no application action taken.
    2. BumpOne does not support application-level refunds.
  * `dispute.opened`:
    1. Marks purchase as `disputed`.
    2. Logs alert for `/admin`.
    3. Returns `200 OK`.

---

## Reactions Endpoints

### POST `/api/reactions`
Adds a reaction for the authenticated user.
* **Authentication:** Required (Supabase Auth session); calls `add_project_reaction_auth` RPC.
* **Rate limit:** 60 req/min per user.
* **Request Body:**
```json
{
  "projectId": "uuid",
  "reaction": "fire"
}
```
* **Response `200 OK`:**
```json
{
  "success": true,
  "count": 231,
  "alreadyReacted": false,
  "reactions": { "fire": 231, "eyes": 89, "heart": 45, "laugh": 12 }
}
```

---

### DELETE `/api/reactions`
Removes the authenticated user's reaction (`remove_project_reaction_auth` RPC).
* **Query params:** `projectId=uuid&reaction=fire`
* **Response `200 OK`:** `{ "success": true, "count": 230, "reactions": { ... } }`

---

## Upload Endpoints

### POST `/api/uploads/image`
Uploads project cover artwork to Cloudflare R2.
* **Authentication:** Required.
* **Rate limit:** 10 uploads/hour/user.
* **Validation:** Max 5MB, MIME type `image/jpeg`, `image/png`, `image/webp`; magic-byte and dimension checks (min 400x400, max 2560x2560).
* **Processing:** Strips EXIF metadata, resizes, converts via `sharp`.
* **Response `200 OK`:**
```json
{
  "image_path": "projects/uuid.webp",
  "image_url": "https://assets.bumpone.lol/projects/uuid.webp"
}
```

---

## Admin Endpoints

All admin endpoints pass `requireAdmin()`: authorization comes from the `ADMIN_EMAILS` environment variable or Supabase Auth `app_metadata.role` (`admin`/`super_admin`). Every mutation writes an `admin_audit_log` row.

* `GET /api/admin/overview`: revenue, active profiles, open reports, kill-switch state.
* `POST /api/admin/moderate`: `{ "projectId": "uuid", "action": "suspend" | "restore", "reason": "string" }` — calls `recalculate_board_ranks()`.
* `POST /api/admin/emergency`: `{ "paused": true | false }` — records the kill-switch action in `admin_audit_log` (the actual gate is the `PURCHASES_PAUSED` environment variable).
