# BumpOne.lol — API Specification

> **Production security override:** see [25_PRODUCTION_ARCHITECTURE.md](25_PRODUCTION_ARCHITECTURE.md). Checkout values are server-derived and admins use authenticated `admin_users` roles, never PINs.

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
      "display_name": "Solana Syndicate DAO",
      "handle": "@sabor_dao",
      "image_url": "https://...",
      "destination_url": "https://...",
      "category": "Tech",
      "rank": 1,
      "active_value": 710,
      "total_paid": 1200,
      "created_at": "2026-09-26T12:00:00Z"
    }
  ],
  "total_profiles": 100,
  "last_sequence": 1042
}
```

---

### GET `/api/categories`
Returns available categories and live profile count.
* **Response `200 OK`:**
```json
{
  "categories": [
    { "name": "AI", "slug": "ai", "count": 24 },
    { "name": "Apps", "slug": "apps", "count": 18 }
  ]
}
```

---

### GET `/api/profile/:id`
Returns public passport data, live rank, active value, lifetime spend, metrics, and reaction counts.
* **Response `200 OK`:**
```json
{
  "profile": {
    "id": "uuid",
    "display_name": "Solana Syndicate DAO",
    "handle": "@sabor_dao",
    "image_url": "https://...",
    "destination_url": "https://...",
    "category": "Tech",
    "current_rank": 1,
    "current_active_value": 710,
    "total_paid": 1200,
    "joined_at": "2026-09-01T00:00:00Z"
  },
  "metrics": {
    "peak_rank": 1,
    "times_bumped": 8,
    "times_climbed": 5,
    "profile_views": 14200
  },
  "reactions": {
    "fire": 230,
    "eyes": 89,
    "heart": 45,
    "laugh": 12
  }
}
```

---

### GET `/api/profile/:id/journey`
Returns the full chronological rank journey reconstructed from `rank_events`.
* **Response `200 OK`:**
```json
{
  "journey": [
    {
      "sequence": 1001,
      "previous_rank": null,
      "new_rank": 50,
      "new_active_value": 60,
      "displaced": 12,
      "timestamp": "2026-09-01T12:00:00Z"
    },
    {
      "sequence": 1042,
      "previous_rank": 50,
      "new_rank": 1,
      "new_active_value": 710,
      "displaced": 49,
      "timestamp": "2026-09-26T18:00:00Z"
    }
  ]
}
```

---

### GET `/api/bump-feed`
Returns recent live bump events for the feed.
* **Query params:** `limit` (default 20, max 50).
* **Response `200 OK`:**
```json
{
  "events": [
    {
      "id": "uuid",
      "sequence": 1042,
      "profile_id": "uuid",
      "display_name": "Alex",
      "previous_rank": 14,
      "new_rank": 1,
      "active_value": 710,
      "displaced": 13,
      "timestamp": "2026-09-26T21:40:00Z"
    }
  ]
}
```

---

## Purchase & Payment Endpoints

### POST `/api/purchase/create`
Generates a 10-minute informational quote and initiates a Dodo Hosted Checkout session.

* **Authentication:** Required (Supabase Auth session).
* **Request Body (Zod validated):**
```json
{
  "profile_id": "uuid (optional if existing profile)",
  "target_rank": 1,
  "display_name": "My App",
  "handle": "@myapp",
  "destination_url": "https://myapp.com",
  "image_path": "profile-images/uuid.webp",
  "category_id": "uuid"
}
```

* **Server Logic:**
  1. Checks if global purchases are paused (`system_state.purchases_paused`). If true -> `503 Service Unavailable`.
  2. Resolves buyer's current active value ($0 for new, existing amount for owned profile).
  3. Finds target active value on live board.
  4. Quotes top-up: `quoted_top_up = max(10, target_value - current_value + 10)`.
  5. Inserts quote record into `purchase_quotes` with `expires_at = now() + 10 minutes`.
  6. Calls Dodo Payments API (`POST https://api.dodopayments.com/payments`):
     * `total_amount = quoted_top_up * 100` (cents)
     * `currency = USD`
     * `metadata = { quote_id, profile_id, user_id, target_rank }`
     * `payment_link = true`
  7. Inserts purchase record into `purchases` (`status = 'created'`, `dodo_payment_id`).
* **Response `200 OK`:**
```json
{
  "quote_id": "uuid",
  "quoted_top_up": 210,
  "expires_at": "2026-09-26T22:04:00Z",
  "dodo_payment_id": "pay_123456",
  "checkout_url": "https://checkout.dodopayments.com/buy/pay_123456",
  "expected_rank": 1
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
    2. Calls `process_dodo_purchase` RPC function.
    3. Triggers realtime notification to clients.
    4. Returns `200 OK`.
  * `refund.succeeded`:
    1. Reverts active value to pre-purchase amount.
    2. Recalculates rank and shifts other profiles up.
    3. Records `refund_rollback` event.
    4. Returns `200 OK`.
  * `dispute.opened`:
    1. Marks purchase as `disputed`.
    2. Logs alert for `/admin`.
    3. Returns `200 OK`.

---

## Reactions Endpoints

### POST `/api/reactions`
Adds an anonymous reaction.
* **Cookie:** `bumped_anon_id` (HttpOnly signed cookie, auto-generated if missing).
* **Rate limit:** 30 req/min per identity.
* **Request Body:**
```json
{
  "profile_id": "uuid",
  "reaction_type": "fire"
}
```
* **Response `200 OK`:**
```json
{
  "reaction_counts": { "fire": 231, "eyes": 89, "heart": 45, "laugh": 12 }
}
```

---

### DELETE `/api/reactions`
Removes an anonymous reaction.
* **Request Body:** `{ "profile_id": "uuid", "reaction_type": "fire" }`
* **Response `200 OK`:** Updated counts.

---

## Upload Endpoints

### POST `/api/uploads/image`
Uploads profile image to Supabase Storage.
* **Authentication:** Required.
* **Validation:** Max 5MB, MIME type `image/jpeg`, `image/png`, `image/webp`.
* **Processing:** Strips EXIF metadata, resizes to max 2560x2560, converts to WebP.
* **Response `200 OK`:**
```json
{
  "image_path": "profile-images/user-123-uuid.webp",
  "image_url": "https://[supabase-project].storage.supabase.co/..."
}
```

---

## Admin Endpoints

All admin endpoints require an active `admin_users` session.

* `GET /api/admin/overview`: System stats, top 100, revenue, reports count.
* `POST /api/admin/profiles/:id/moderate`: `{ "action": "suspend" | "restore" | "reject", "reason": "string" }`.
* `POST /api/admin/emergency/pause`: `{ "paused": true | false }`.
