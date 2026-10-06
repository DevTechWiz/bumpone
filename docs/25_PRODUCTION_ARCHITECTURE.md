# BumpOne.lol Production Architecture (Canonical)

This document supersedes conflicting planning-era names. The deployed schema uses `projects`, `payments`, `payment_events`, `board_events`, `purchase_quotes`, and `admin_audit_log`; never create legacy `profiles`, `purchases`, `rank_events`, `admin_actions`, `admin_users`, `system_state`, or `reaction_counts` tables.

Browser clients read public data and submit requests only through Next.js routes. They cannot directly mutate financial, rank, moderation, aggregate, audit, or system-state data. Supabase RLS plus column grants enforce this independently of application code.

Checkout requires a verified Supabase session. The server verifies ownership, derives values from the database, and creates a persisted ten-minute quote. Dodo receives only the quote ID. A verified webhook consumes the quote and updates `projects`, `payments`, `board_events`, and `payment_events` in one idempotent database transaction.

Admin access requires an authenticated session authorized via the `ADMIN_EMAILS` environment variable or Supabase Auth `app_metadata.role` (`admin`/`super_admin`); static PINs and URL secrets are forbidden. All admin actions must write `admin_audit_log`.

Production fails closed when `APP_URL` (HTTPS), Dodo, R2, or anonymous-cookie secrets are missing. Apply migrations through `016_drop_image_positioning_and_frame.sql` and provision administrators through `ADMIN_EMAILS` or `app_metadata.role` (there is no admin table).
