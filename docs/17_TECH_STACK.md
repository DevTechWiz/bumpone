# Bumped.lol — Technology Stack

## Frontend

Next.js

Recommended:

- App Router
- TypeScript
- Tailwind CSS
- modern React

---

## Hosting

Vercel.

---

## Backend

Next.js server-side routes/server actions where appropriate.

---

## Database

Supabase PostgreSQL.

---

## Authentication

Supabase Auth.

---

## Storage

Supabase Storage.

---

## Realtime

Supabase Realtime.

---

## Payments

Stripe Checkout.

---

## Validation

Zod.

---

## Image Processing

Server-side image validation/resizing.

---

## Monitoring

Initially:

- Vercel logs
- Supabase logs
- Stripe dashboard

Future:

Sentry or equivalent.

---

# Architecture Principle

Keep the MVP simple.

Do not introduce:

- microservices
- Kubernetes
- Redis
- message queues
- separate backend servers

unless actual scale requires them.

---

# Important

The ranking mutation must live in a trusted server/database layer.

Never implement the authoritative bump logic only in React.