# BumpOne.lol — Admin System

> **Implementation notes:** Admins are authorized server-side by `requireAdmin()` — `ADMIN_EMAILS` env var or Supabase Auth `app_metadata.role` (`admin`/`super_admin`). There is no `admin_users` table. The emergency pause is the `PURCHASES_PAUSED` environment variable (checked by `POST /api/purchase/create`; the endpoint records the action). Every mutation writes an `admin_audit_log` row.
> Endpoints: `GET /api/admin/overview`, `POST /api/admin/moderate`, `POST /api/admin/emergency` (see [09_API_SPEC.md](09_API_SPEC.md)).

## Dashboard

Admin should be able to see:

- current top 100
- total profiles
- total purchases
- total revenue
- current active-value range
- recent purchases
- recent reports
- failed payments
- chargebacks
- moderation queue

---

# Profile Controls

Admin can:

- approve
- reject
- suspend
- restore
- replace image
- disable link

---

# Purchase Controls

Admin can inspect:

- Dodo payment session
- payment status
- amount
- target requested
- final position
- timestamp
- profile

---

# Board Controls

Admin should NOT manually edit ranks casually.

Any forced rank modification must create an audit event.

---

# Emergency Controls

Possible:

PAUSE PURCHASES

Useful if:

- payment bug
- ranking corruption
- security incident
- moderation emergency

---

# Audit Log

Every administrative mutation must record (table `admin_audit_log`):

admin
action
target
timestamp
reason
metadata