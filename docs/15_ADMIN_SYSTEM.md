# Bumped.lol — Admin System

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

- Stripe session
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

Every administrative mutation must record:

admin
action
target
timestamp
reason
metadata