# BumpOne.lol — Technology Stack

## Frontend

Next.js
- App Router
- TypeScript
- Tailwind CSS
- modern React 19

---

## Hosting & Infrastructure (Cloudflare + Vercel Hybrid)

* **Edge CDN & DDoS Shield**: **Cloudflare** (Free tier)
  * DNS proxy & DDoS attack absorption.
  * Web Application Firewall (WAF) & Bot Fight Mode.
  * Unlimited free bandwidth: caches static assets and images at 300+ edge locations for $0.
* **Application Hosting**: **Vercel** (Hobby/Pro)
  * Native Next.js 15 App Router runtime.
  * Serverless Route Handlers (`app/api/`) and server-side image processing (`sharp`).
* **Edge Caching Strategy**:
  * `/api/board` utilizes Stale-While-Revalidate edge caching (`s-maxage=5, stale-while-revalidate=10`).
  * 50,000+ concurrent visitors generate only 1 database query every 5 seconds.
  * Instant board updates push via Supabase Realtime WebSockets to active viewers.
* **Cost Profile**: **$0/month at launch** (Cloudflare Free + Vercel Free + Supabase Free + Dodo pay-per-sale).

---

## Backend

Next.js server-side Route Handlers (`app/api/`).

---

## Database

Supabase PostgreSQL with Row Level Security (RLS) & atomic PL/pgSQL RPC.

---

## Authentication

Supabase Auth:
- Email Magic Link
- Social OAuth (Google, X)
- Multi-profile ownership (1 account can manage multiple slots)

---

## Storage (Zero Egress Fees)

**Cloudflare R2** (S3-compatible bucket: `profile-images`):
- **Zero egress bandwidth fees** (never pay for image bandwidth during viral spikes).
- 10 GB free monthly storage.
- S3 client API (`@aws-sdk/client-s3`).
- Served directly through Cloudflare Edge CDN.

---

## Realtime & Spectator Updates

- **Public Spectators**: **Cloudflare Edge SWR Polling** (`/api/board` cached for 5s at 300+ edge locations). Handles 100,000+ simultaneous viewers with zero database load and zero WebSocket exhaustion.
- **Interactive Channels**: Supabase Realtime (reserved for active authenticated users in the War Room chat).

---

## Payments

**Dodo Payments** (Merchant of Record / Hosted Checkout).
- API: Dodo Payments REST API / SDK
- Webhooks: Standard Webhooks with signature verification
- Currency: USD (minor units: cents)

---

## Validation

Zod.

---

## Image Processing

Server-side `sharp` (strips EXIF, resizes to max 2560x2560, converts to WebP).

---

## Monitoring

Initially:
- Vercel logs
- Supabase logs
- Dodo Payments dashboard

Future:
- Sentry.

---

# Architecture Principle

Keep the MVP simple. Do not introduce microservices, Kubernetes, or complex queue brokers unless actual scale requires them.

---

# Important

The ranking mutation must live in a trusted server/database layer (`process_dodo_purchase` RPC). Never implement the authoritative bump logic in client React code.