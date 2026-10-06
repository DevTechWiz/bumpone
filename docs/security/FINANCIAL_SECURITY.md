# Financial Security — BumpOne.lol

Canonical reference for the money path: PAYMENT → PAYMENT VERIFICATION → ACTIVE VALUE → RANKING.
Findings, evidence, and per-phase records live in [`PRODUCTION_HARDENING_LOG.md`](./PRODUCTION_HARDENING_LOG.md);
threat model in [`THREAT_MODEL.md`](./THREAT_MODEL.md). This document describes the **current, tested** design.

Status: Phase 9 complete (2026-10-06). All statements below are backed by migrations
`supabase/migrations/017_harden_financial_boundary.sql` and `supabase/migrations/020_harden_production_residual_controls.sql`
(with `021` moderation default and `022` nullable `payments.new_rank` — pending purchases never rank),
the route/library code, the sandbox verification script (`scripts/verify-dodo-sandbox.ts`), and the tests in §7
(unit suite + DB suites incl. `supabase/tests/13_moderation.sql`).

---

## 1. Trusted payment flow (end to end)

1. **Quote creation** — `POST /api/purchase/create` (authenticated, ownership-checked).
   The server computes the price floor (`requiredQuoteAmountMinor`: ≥ $10, plus the gap to the
   target rank's current active value) and rejects any client amount below it with **409**.
   A client may quote **more** than the floor (voluntary overpay). The quote row
   (`purchase_quotes`) records `project_id`, `user_id`, `target_rank`, `quoted_amount_minor`,
   `expires_at` (10 min), `status = 'checkout_open'`.
2. **Checkout** — the gateway session is created server-side; `quote_id` reaches Dodo only via
   server-built metadata. The client never sets a price the server has not validated.
3. **Provider confirms** — Dodo signs the `payment.succeeded` webhook (Svix HMAC,
   `webhook-id`/`webhook-timestamp`/`webhook-signature`, 5-minute replay window).
   `POST /api/webhooks/dodo` verifies the signature in `src/lib/dodo.ts` (**fail-closed** —
   unsigned payloads only when `NODE_ENV !== 'production'` **and** `ALLOW_INSECURE_WEBHOOKS === 'true'`).
4. **Strict parse** — `parsePaymentSucceeded` (`src/lib/paymentEvents.ts`) rejects malformed
   payment ids, unsafe amounts, non-USD currencies, and non-UUID metadata *before* PostgREST,
   so bad input becomes a clean rejection instead of a retryable transport error.
5. **Database is the final authority** — the route calls `process_dodo_purchase`
   (`017`, SECURITY DEFINER, `service_role`-only EXECUTE), which validates **before any mutation**:
   - event-id idempotency (fast path) → advisory lock `pg_advisory_xact_lock(733100, 1)` → idempotency re-check (closes the TOCTOU window);
   - explicit non-USD currency rejected; absent currency tolerated (§6 risks);
   - **quote is mandatory** (metadata `quote_id` or explicit parameter);
   - quote must exist, be `checkout_open`, unexpired; metadata `project_id`/`user_id` may only
     *agree* with the quote row, never override it;
   - amount must **equal** `quoted_amount_minor` exactly; ≥ $10 floor;
   - the quote's project must exist, be owned by the quote's user, and not be suspended/rejected.
      Under migration 020, if the project is in `pending` moderation status, paying preserves
      `pending` (preventing unapproved listings from bypassing moderation onto the public board).
6. **Atomic credit** — one exception sub-block performs: consume quote (`checkout_open → paid`),
   credit `current_active_value_minor`/`total_paid_minor`, recompute ranks 1..100 atomically,
   insert the `payments` ledger row, two `board_events` journal rows, and the `payment_events`
   idempotency row. Any `unique_violation` rolls the **entire** sub-block back — the quote
   returns to `checkout_open`, nothing is credited, and the provider may retry safely.
7. **HTTP semantics** — see §4. The board cache is invalidated **only** on success.

## 2. Trust hierarchy (who wins when sources disagree)

1. **Database rows** — `purchase_quotes` (amount, project, user) are authoritative. They are
   written only by the server-side quote-creation route and are protected by
   `trg_purchase_quotes_integrity` (commercial terms immutable, forward-only state machine).
2. **Provider-confirmed facts** — event id, payment id, and the charged amount are trusted
   *only after* they match the quote exactly; the provider cannot re-price or re-point a payment.
3. **Provider metadata** — advisory hints only; can confirm, never contradict, the quote row.
4. **Client input** — trusted solely at quote creation for choosing a target rank and an amount
   **≥ the server floor**; never trusted again downstream.

## 3. Financial invariants (all tested — §7)

Test IDs refer to `supabase/tests/10_invariants.sql` (sequential) and `verify_concurrency.sql` (post-concurrency).

| Invariant | Test |
| --- | --- |
| No payment → no active-value increase; value only grows via a credited payment | F1 |
| Client-supplied price can never override the server-recorded quote; credited amount matches it exactly | F8, F8c/F2 |
| Quote-less crediting is impossible | F11 |
| Expired quote: rejected **and not consumed** | F7 |
| Wrong project / wrong user metadata can never redirect the credit | F5, F6 |
| The quote's user must own the target project | F15 |
| Duplicate webhook event → zero additional credit | F3 |
| Unknown quote → zero increase | F4 |
| Currency must be USD (when present); amount ≥ floor and equals quote | F12/F13 |
| Money RPC denied to `anon` and `authenticated` | I3 |
| Client INSERT path cannot fabricate active value or self-activate (inactive zero-value draft allowed) | I2a–I2d |
| The legitimate `service_role` path keeps working (no false rejections) | I4 |
| Quote commercial terms immutable; forward-only state machine; `paid` terminal | I5a–I5d |
| `payments` ledger rows immutable | I6a, I6b |
| `payment_events` append-only | I7 |
| One payment row per quote; USD-only ledger | I8, I9 |
| Board (ranks 1..100) canonical after the whole sequential suite | FINAL |
| Under concurrency: every legitimate payment credits; duplicates rejected exactly once; ranking canonical after each scenario | `verify_concurrency.sql` (32 assertions) + scenarios C/D/E vs A/B |
| Only service role writes authoritative project fields on INSERT/UPDATE | I2a–I2d + `trg_protect_project_fields_insert` |
| Suspended/rejected projects cannot receive credit | F-series RPC guard (covered by `10_invariants.sql`) |

## 4. Failure semantics (webhook route)

| Condition | Outcome | HTTP | Side effects |
| --- | --- | --- | --- |
| Invalid/absent signature | `{error}` | 401 | none |
| Missing webhook id | `{error}` | 400 | none |
| Malformed payload / unsupported currency (route parse) | `{success:false, ignored:true, reason}` | 200 | none — provider must not retry a deterministic failure |
| Duplicate delivery (`already_processed`) | `{success:true, already_processed:true}` | 200 | **no cache invalidation** |
| Deterministic RPC rejection (quote missing/expired/mismatched, amount mismatch, suspended project, duplicate payment, …) | `{success:false, reason}` | 200 | none — sub-block rolled back, quote still `checkout_open` |
| Transport/RPC failure (PostgREST down, timeout) | `{error}` | 500 | none — provider retries |
| Success | `{success:true, result}` | 200 | credit + ranks + ledger + cache invalidation |
| `refund.succeeded` / `payment.dispute` | `{success:true, ignored:true, reason:'refunds_not_supported'}` | 200 | none (chargebacks handled by the gateway) |

Rationale: HTTP 200 with `success:false` stops retry storms for failures that can never succeed;
HTTP 500 is reserved for genuinely transient conditions; every non-success path leaves the database untouched.

## 5. Concurrency model

- **Single global serialization point**: `pg_advisory_xact_lock(733100, 1)` inside the RPC.
  Every financial mutation (credit, rank recalculation, journals, idempotency row) happens while
  holding it, so concurrent webhooks queue rather than interleave.
- **Idempotency is checked twice**: before the lock (fast path, no writes) and again after
  acquiring it (closes the race where two deliveries of the same event both pass the fast path).
- **Row locks as backstops**: `select … from projects where id = … for update` before crediting;
  the quote-consumption `UPDATE` re-checks `status = 'checkout_open' and expires_at > now()`.
- **Blast-radius containment**: the exception sub-block means the worst concurrent outcome for a
  losing duplicate is a deterministic rejection with full rollback — never a half-applied credit.

## 6. Known accepted risks (Phase 1)

1. **Absent `currency` is tolerated** (payload-shape uncertainty; a present non-USD value is
   rejected). *Mitigation:* confirm the Dodo product is USD and `currency` appears in the first
   test-mode event; the exact match against a USD quote amount still constrains crediting.
2. **`ALLOW_INSECURE_WEBHOOKS`** is a non-production-only escape hatch; it must never be set in
   production env (it is inert when `NODE_ENV=production`).
3. **UPDATE-path `auth.role()` trust** in `protect_project_authoritative_fields`
   (SEC-015 residual; `auth.role()` is Supabase-controlled, not client-writable via the API).
4. **Shimmed test DB** — the suite runs on plain `postgres:16` with an auth shim, not live
   Supabase; run once against staging before production deploy.
5. **Provider payload shape** (`payment_id`|`id`, `amount`|`total_amount`, `metadata.quote_id`)
   is unverified against a real Dodo event — verify on the first test-mode payment.
6. **Global lock throughput** — deliberate correctness-over-throughput trade-off; monitor webhook
   p95 latency if event volume grows.

Unresolved findings outside this document's scope: see the Remaining Risks sections of the log.

## 7. Running the tests

**Unit & Regression tests** (no prerequisites):

```sh
npm test            # vitest run — 24 files / 296 tests, 0 failures
npx tsc --noEmit    # 0 type errors
npm run lint        # eslint . — 0 errors (6 exhaustive-deps warnings)
npm run build       # Next.js production build succeeds
```

Payment-specific files: `src/__tests__/payment_security.test.ts` (18),
`src/__tests__/webhook_route.test.ts` (10), `src/__tests__/dodo_webhooks.test.ts` (8),
`src/__tests__/security/financial.test.ts` (16), `src/__tests__/security/concurrency.test.ts` (10).

Sandbox verification harness:
```sh
npm run verify:sandbox  # runs scripts/verify-dodo-sandbox.ts against Dodo test environment
```

**Database suite** (requires Docker; creates/removes a throwaway `postgres:16-alpine` container):

```sh
powershell -ExecutionPolicy Bypass -File supabase\tests\run-db-tests.ps1          # full lifecycle
powershell -ExecutionPolicy Bypass -File supabase\tests\run-db-tests.ps1 -Keep    # keep container for inspection
```

The runner applies the Supabase shim, replays migrations 001→020, seeds fixtures, executes the
sequential adversarial suite (`10_invariants.sql`, 58 assertions), runs 5 concurrent scenarios
(132 worker RPC calls via `workers/worker.sql` + `run_workers.sh` + `run_double_tap.sh`), then the
32 post-concurrency assertions (`verify_concurrency.sql`). Success ends with
`ALL DB SECURITY TESTS PASSED`.

**CI Gate**: Automated via `.github/workflows/ci.yml` verifying `npm ci`, vulnerability audit, `npm run lint`, static secret scanning tripwires, typecheck, build, test, the DB suites on a fresh Postgres container, and artifact secret scans.

## 8. Pre-deploy checklist (financial boundary)

1. Migration `017` applied (replay-validated 001→017; apply **before** or with the code deploy).
2. Dodo product/checkout currency = USD; `currency` present in the first test-mode `payment.succeeded`.
3. Webhook secret present in env (missing secret now fails closed → 401).
4. `ALLOW_INSECURE_WEBHOOKS` unset in production.
5. First test-mode payment verified end-to-end: quote → webhook → credit → rank → one `payments`
   row → duplicate delivery returns `already_processed` without a second credit.
6. DB suite run once against a staging Supabase (not only the shimmed local Postgres).
