Now harden BumpOne's most critical security boundary:

PAYMENT → PAYMENT VERIFICATION → ACTIVE VALUE → RANKING

This is the highest-priority part of the system.

First read:

`docs/security/PRODUCTION_HARDENING_LOG.md`
`docs/security/THREAT_MODEL.md`

Also re-inspect all relevant existing code before modifying anything.

## Objective

Ensure that an attacker cannot:

* fabricate a payment
* modify a payment amount
* reuse a payment
* replay a webhook
* credit the wrong project
* credit the wrong user
* reuse a quote
* manipulate a quote
* bypass minimum increments
* create Active Value without legitimate payment
* create duplicate Active Value
* corrupt ranking through concurrency
* cause an already-paid quote to be paid again
* cause a payment to be credited twice

## Audit first

Inspect:

* `/api/purchase/create`
* Dodo integration
* Dodo webhook
* Svix verification
* `purchase_quotes`
* `payments`
* `payment_events`
* `projects`
* `board_events`
* `process_dodo_purchase`
* all related triggers/functions/constraints

Trace actual data from browser request through final database mutation.

## Quote security

Verify that:

* price is calculated server-side
* client cannot choose the authoritative price
* target rank cannot manipulate price
* project ownership is verified server-side
* quote ownership is verified
* quote/project/user relationships are validated
* expired quotes cannot be used
* already-paid quotes cannot be reused
* quote state transitions are valid
* currency is validated
* amount is validated
* Dodo metadata cannot override authoritative database relationships

If the current implementation has weaknesses, fix them.

## Webhook security

Verify:

* signature validation
* timestamp/replay protection
* provider event ID uniqueness
* idempotent processing
* payment ID uniqueness
* correct payment status
* correct amount
* correct currency
* correct quote
* correct project
* correct user
* correct provider
* protection against out-of-order events

Never trust webhook metadata blindly.

## Database security

Strengthen the database as the final authority.

Where appropriate add:

* unique constraints
* foreign keys
* CHECK constraints
* state-transition protection
* immutable financial fields
* authoritative triggers
* transaction boundaries

Review SECURITY DEFINER functions carefully.

Ensure privileged functions:

* have a safe `search_path`
* expose only required operations
* cannot be abused by arbitrary authenticated users
* validate all authoritative inputs

## Concurrency

Create adversarial tests for:

* two simultaneous purchases targeting #1
* 10 simultaneous purchases
* 100 concurrent purchase attempts
* duplicate webhook delivery
* same webhook delivered concurrently
* same quote processed concurrently
* two purchases involving the same project
* purchases occurring while board state changes

Verify that ranking remains valid after every test.

## Financial invariants

Add automated tests that prove:

1. No payment → no Active Value increase.
2. One payment → exactly one Active Value increase.
3. Duplicate webhook → zero additional increase.
4. Invalid webhook → zero increase.
5. Wrong project metadata → zero incorrect credit.
6. Wrong user metadata → zero incorrect credit.
7. Expired quote → cannot create valid payment credit.
8. Client-supplied price → cannot override server price.
9. Concurrent valid payments → all valid payments are credited exactly once.
10. Ranking remains canonical after concurrency.

## Important

Do not weaken the existing "no confirmed legitimate payment is rejected because of a race" business rule.

If a design change is necessary, explain it before implementing it.

## Testing

Add or improve tests where needed.

Run:

* unit tests
* integration tests
* database tests if available
* TypeScript
* lint
* production build

Do not claim tests pass unless executed.

## Documentation

Update:

`docs/security/PRODUCTION_HARDENING_LOG.md`

Record:

* findings addressed
* exact files changed
* migrations added
* security controls added
* tests added
* commands executed
* results
* unresolved risks

Also create/update:

`docs/security/FINANCIAL_SECURITY.md`

Document the final trusted payment flow and all financial invariants.

## Restrictions

Do not redesign unrelated UI.

Do not add unrelated features.

Do not expose secrets.

Do not make speculative security changes without evidence.

Finish by reporting:

* vulnerabilities fixed
* remaining financial risks
* files changed
* migrations added
* tests executed
* test results
