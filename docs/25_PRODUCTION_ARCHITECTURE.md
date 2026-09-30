# BumpOne.lol Production Architecture (Canonical)

This document supersedes conflicting planning-era names. The deployed schema uses `projects`, `payments`, `payment_webhook_events`, `board_events`, `purchase_quotes`, `admin_users`, and `admin_audit_log`; never create legacy `profiles`, `purchases`, `payment_events`, `rank_events`, or `admin_actions` tables.

Browser clients read public data and submit requests only through Next.js routes. They cannot directly mutate financial, rank, moderation, aggregate, audit, or system-state data. Supabase RLS plus column grants enforce this independently of application code.

Checkout requires a verified Supabase session. The server verifies ownership, derives values from the database, and creates a persisted ten-minute quote. Dodo receives only the quote ID. A verified webhook consumes the quote and updates `projects`, `payments`, `board_events`, and `payment_webhook_events` in one idempotent database transaction.

Admin access requires an authenticated session represented in `admin_users`; static PINs and URL secrets are forbidden. All admin actions must write `admin_audit_log`.

Production fails closed when `APP_URL` (HTTPS), Dodo, R2, or anonymous-cookie secrets are missing. Apply migrations through `005_production_hardening.sql` and provision administrators with an explicit `admin_users` row.
