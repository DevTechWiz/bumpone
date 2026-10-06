# Incident Response Plan — BumpOne

Operational runbook for security and payment incidents. Every scenario follows
**Detect → Contain → Recover → Verify**. Preserve evidence before wiping
anything: snapshot logs, DB rows, and audit trails referenced below before
remediating.

**Severity levels**

| Level | Meaning | Response time |
| :--- | :--- | :--- |
| S1 | Funds at risk, admin takeover, data-wide breach | Immediate, all hands |
| S2 | Single-facet compromise (one admin, one content vector) | Same day |
| S3 | Confirmed but bounded (spam outbreak, single fraud order) | Best effort |

**Always first (any severity)**

1. Note the time window (UTC) of suspected activity.
2. Export relevant slices: `admin_audit_log`, `payment_events`, `payments`
   (do this before rotating keys — old logs must remain readable).
3. Do not delete rows. Containment stops new damage; it never erases evidence.

---

## 0. Telemetry & Structured Security Logs (SEC-032)

All security-critical routes emit structured JSON security logs via `src/lib/securityLogger.ts` using the format:
```json
{
  "severity": "warn",
  "eventType": "AUTHZ_FAILURE",
  "message": "Forbidden admin access attempt",
  "timestamp": "2026-10-06T00:00:00.000Z",
  "metadata": {
    "ip": "203.0.113.195",
    "path": "/api/admin/overview",
    "userId": "usr_123"
  }
}
```

### Event Types & Filter Queries
- `AUTH_FAILURE`: Unauthenticated calls to protected routes (e.g., missing session on `/api/war-room/messages`).
- `AUTHZ_FAILURE`: Unauthorized calls (e.g. non-admin attempting admin endpoints).
- `ADMIN_ACTION`: Verified admin actions on moderation or killswitch endpoints.
- `PURCHASE_ATTEMPT`: Checkout initialization attempts.
- `PAYMENT_SUCCESS`: Webhook successfully settled and active value credited.
- `PAYMENT_FAILURE`: Webhook verification failures, bad signatures, or amount mismatches.
- `PAYMENT_REPLAY`: Replayed or duplicate webhook event IDs (returning `already_processed`).
- `RATE_LIMIT_EXCEEDED`: Rate limit violations on distributed or local limiters.
- `MODERATION_ACTION`: Project status changes (`pending`, `approved`, `suspended`).
- `SUSPICIOUS_REALTIME`: Spoofing attempts in War Room (forged official flags or identity mismatches).
- `KILLSWITCH_CHANGE`: Runtime or deployment purchase pause activation/resumption.
- `FINANCIAL_ERROR`: Invariant violation or database RPC failure on the money path.

### Cloudflare & SIEM Log Ingestion
Stream Worker logs via Cloudflare Logpush or Worker Tail Workers. In your log analyzer (Datadog, Grafana Loki, CloudWatch):
1. **S1 Alert Rule**: `eventType IN ("FINANCIAL_ERROR", "KILLSWITCH_CHANGE") OR (eventType == "PAYMENT_FAILURE" AND count > 5 within 5m)`.
2. **S2 Alert Rule**: `eventType == "SUSPICIOUS_REALTIME" OR (eventType == "AUTHZ_FAILURE" AND metadata.path LIKE "/api/admin%")`.
3. **Automated Redaction Guarantee**: `securityLogger.ts` automatically redacts keys matching `password`, `token`, `secret`, `authorization`, `cookie`, `card`, `api_key`.

---

## 1. Compromised admin account (S1)

**Detect**: `admin_audit_log` rows you did not authorize (unexpected
`purchases_paused`, `project_approved` bursts); admin UI actions in the wrong
time zone; Google sign-in alerts.

**Contain**:
1. Remove the account from `ADMIN_EMAILS` (env) and redeploy — denylist wins
   over everything else because `requireAdmin` checks it first.
2. Strip the role: set `app_metadata.role = null` for that user via the
   Supabase Auth admin API (GoTrue). `user_metadata.role` is never trusted.
3. If the session itself is suspect, ban/revoke the user in Supabase Auth
   (revokes all refresh tokens).
4. If you cannot rotate fast enough: block `/api/admin/*` and `/admin` at the
   Cloudflare WAF while rotating.

**Recover**:
1. Triage every action the account performed in the window: for each
   `project_*` row, re-check the project's real state; for
   `purchases_paused`/`resumed`, confirm `system_state` matches intent.
2. Restore wrongly approved/suspended projects via `POST /api/admin/moderate`
   (each fix is itself audit-logged — use a reason like "rollback of
   compromised admin action <id>").
3. Re-issue the admin's credentials with MFA, re-add to `ADMIN_EMAILS`.

**Verify**: no further audit rows from the account; board ranks consistent
(`recalculate_board_ranks` if moderation changed); affected users notified if
data was exposed.

## 2. Payment abuse (S1)

**Detect**: checkout anomalies in `payments`/`purchase_quotes` (amounts not
matching quotes); Dodo dashboard disputes spiking; flood of
`POST /api/purchase/create` (429 rates).

**Contain**:
1. **Pause purchases**: admin UI (`/admin` → Pause purchases, reason
   required). Effect: next checkout attempt gets 503. Takes effect within the
   board cache window (~15 s display; enforcement is immediate per-request).
2. Belt-and-braces: set `PURCHASES_PAUSED=true` env + redeploy (survives DB
   problems — checked before the DB flag).
3. For per-IP floods: add/verify the Cloudflare WAF rate-limit rule on
   `/api/purchase/create` (see `ENDPOINT_AUDIT.md` §3).

**Recover**:
1. Reconcile `payments` against the Dodo dashboard line-by-line for the
   window. The `payment_events` ledger (idempotent event ids) is the source of
   truth for what settled.
2. Replay any legitimate missed webhook events from the Dodo dashboard.
3. Resume purchases (same UI toggle) once verified.

**Already-created checkouts**: a checkout session opened before the pause can
still complete — this is intentional. **Webhooks keep running during a
pause** so those payments settle cleanly instead of orphaning charges.
Never block webhook processing as part of a pause.

## 3. Webhook compromise (S1)

**Detect**: `POST /api/webhooks/dodo` verification failures spiking; rows in
`payment_events` with unknown event ids; payments recorded without matching
Dodo dashboard entries.

**Contain**:
1. Block the webhook route at the WAF (temporary) or rotate
   `DODO_PAYMENTS_WEBHOOK_KEY` immediately in the Dodo dashboard — forged
   calls die, real events resume once Dodo has the new secret.
2. Set `ALLOW_INSECURE_WEBHOOKS` to unset/`false` (it is dev-only; a stray
   `true` in production disables signature verification).

**Recover**:
1. Audit `payment_events` + `payments` written during the window;
   `chargeback/fraud`-flag anything not real.
2. Replay legitimate events from the Dodo dashboard (the ledger's unique
   event-id constraint makes replays idempotent).
3. If the API key (`DODO_PAYMENTS_API_KEY`) is also suspect, rotate it too.

**Verify**: forged requests rejected (signature mismatch 4xx), real replay
succeeds, `payments` totals match the dashboard.

## 4. Database compromise (S1)

**Detect**: unfamiliar roles/keys in use, RLS bypass anomalies, rows modified
outside app flows, Supabase audit/alert emails.

**Contain**:
1. Rotate `SUPABASE_SERVICE_ROLE_KEY` (Supabase dashboard → API keys) and the
   database password.
2. Rotate dependent secrets in the same pass: `ANON_COOKIE_SECRET`,
   `DODO_PAYMENTS_API_KEY`, `R2_SECRET_ACCESS_KEY` (assume anything reachable
   from the leaked credential is burned).
3. Freeze admin access: empty `ADMIN_EMAILS`, strip all
   `app_metadata.role` values until the DB is confirmed clean.

**Recover**:
1. Review `auth.users.app_metadata` for injected roles (this is the admin
   forge path — `requireAdmin` trusts it).
2. Review `projects` authoritative fields (`moderation_status`, `is_active`,
   ranks, `total_paid_minor`) — the `protect_project_authoritative_fields`
   trigger blocks non-service-role tampering, so any drift implies service-key
   use; compare against `payment_events`.
3. If data exfiltration is confirmed: rotate everything again after cleanup,
   restore from backup if rows were destroyed, and file the applicable
   breach notifications.

**Verify**: old key rejected; login flows healthy; invariant spot-checks
(ledger vs payments vs ranks) pass.

## 5. DDoS (S2)

**Detect**: origin CPU/requests saturated, CF analytics spike, 429/5xx surge
on `/api/board` (the heaviest read path).

**Contain**:
1. Enable Cloudflare "Under Attack" mode / bot fight rules.
2. Verify per-IP WAF rate limits (board, purchase, chat, reports — budgets in
   `ENDPOINT_AUDIT.md` §3); tighten thresholds if exhausted broadly.
3. In-process limits multiply per isolate — they are a backstop, not the
   primary defense; the WAF is.

**Recover**: relax rules gradually; confirm static/CDN cached paths (board
has `s-maxage=15`) are absorbing reads.

**Verify**: origin request rate normal, error rate back to baseline, no
legitimate traffic permanently locked out.

## 6. Malicious content outbreak (S3, S2 if XSS suspected)

**Detect**: reports spike (`/api/admin/overview` → open reports), war-room
spam, defaced profile content, CSP violation reports if instrumented.

**Contain**:
1. Suspend the offending projects via `POST /api/admin/moderate` with reason
   (audit-logged). Suspend removes them from the board and 404s their
   share/project pages immediately.
2. For chat spam: purge offending `messages` rows directly (no admin chat
   API exists; do it in the SQL editor) and rely on the existing chat rate
   limits for ongoing flood control.

**Recover**: verify output encoding held (war-room renders as React text
nodes; JSON-LD is static) — if script executed, treat as S2 and escalate to
scenario 7 (CSP + dependency review). Purge cached board entries by waiting
out the 15 s TTL (or invalidate via deploy).

**Verify**: content gone (hard-refresh + incognito), board cache refreshed,
no recurrence after rate-limit windows reset.

## 7. Leaked credentials (S1)

**Detect**: secret in a public repo/gist/log, scanner alert, or an unknown
consumer of an API key.

**Contain + rotate (order matters — highest blast radius first)**

| Secret | Where to rotate | Blast radius |
| :--- | :--- | :--- |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard | Full DB write — rotate first |
| DB password | Supabase dashboard | Direct DB access |
| `DODO_PAYMENTS_WEBHOOK_KEY` | Dodo dashboard | Forged settlements |
| `DODO_PAYMENTS_API_KEY` | Dodo dashboard | Checkout/refund control |
| `R2_SECRET_ACCESS_KEY` | Cloudflare IAM | Asset bucket read/write |
| `ANON_COOKIE_SECRET` | env + redeploy | Report spoofing forgery |
| `CRON_SECRET` | env + redeploy | Cron endpoint abuse |
| `ADMIN_EMAILS` | env + redeploy | Admin role assignment |

**Recover**: purge the leak (history rewrite only if the repo is public —
rotation is mandatory regardless; assume the old value is attacker-owned
immediately). `.env` has never been committed (verified: only `.env.example`
in tree and history); keep it that way — never log secret values (grep shows
no secret logging in `src/`).

**Verify**: old values rejected by each service; client bundles still contain
only public values (`NEXT_PUBLIC_*` + anon key).

## 8. Suspicious ranking manipulation (S2)

**Detect**: rank jumps with no matching `payments` rows; `total_paid_minor`
mismatch; repeated `recalculate_board_ranks` calls in audit logs without
corresponding moderation actions.

**Contain**:
1. Identify the projects; suspend them (moderate API, audit-logged).
2. The authoritative-field trigger means only the service role can write
   ranks — if manipulation happened, the service key is in play → escalate to
   scenario 4.

**Recover**: reconcile `payments` → `payment_events` →
`projects.current_active_value_minor`; run `recalculate_board_ranks`.

**Verify**: board order matches paid value; re-run the financial invariant
suite (`supabase/tests/run-db-tests.ps1`) against a staging copy if the
suspicion is systemic.

## 9. Chargeback / fraud events (S3)

**Detect**: Dodo dashboard chargeback notifications; `payments.status` churn.

**Contain/Recover**:
1. Attach evidence per dispute in the Dodo dashboard (quote, timestamps from
   `purchase_quotes`/`payment_events`, user id).
2. For repeat offenders: suspend their project(s) via moderate API and
   document the reason in the audit trail.
3. Genuine duplicates from gateway timeouts: follow the refund policy on
   `/refund` — correct via Dodo, then annotate the payment row.

**Verify**: dispute outcomes recorded; no legitimate paying customer locked
out by mistake (check before suspending).

---

## Post-incident (every S1/S2)

1. Timeline + root cause written up in
   `docs/security/PRODUCTION_HARDENING_LOG.md` (append to the active phase
   section or a dated incident note).
2. New invariant → add to `supabase/tests/`; new endpoint behavior → add to
   `docs/security/ENDPOINT_AUDIT.md`.
3. Rotate anything you merely *suspect* — rotation is cheaper than an
   encore incident.
