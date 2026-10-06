Perform the final production-readiness audit of BumpOne.lol.

This is an audit, not a feature-development task.

Read every file in:

`docs/security/`

and inspect the current implementation.

## Verify

### Security

* authentication
* authorization
* RLS
* IDOR
* admin isolation
* XSS
* uploads
* URL validation
* CSRF where applicable
* security headers
* secrets

### Financial

* quote integrity
* payment integrity
* webhook authenticity
* idempotency
* replay protection
* concurrency
* ranking invariants
* money precision

### Infrastructure

* Cloudflare
* Workers
* R2
* Supabase
* Realtime
* caching
* rate limiting
* resource exhaustion

### Reliability

* database failures
* webhook retries
* external service failures
* stale cache
* realtime disconnects
* partial failures

### Observability

Verify that production can detect:

* payment failures
* webhook failures
* ranking inconsistencies
* elevated error rates
* abuse
* authentication failures
* admin actions
* infrastructure failures

Do not log sensitive information.

## Run

* complete tests
* security tests
* type checking
* lint
* production build

If possible run an isolated production-like deployment test.

## Final report

Create:

`docs/security/PRODUCTION_READINESS_REPORT.md`

Include:

### Executive Summary

### Security Posture

### Financial Security

### Authentication & Authorization

### API Security

### Content Security

### Infrastructure Security

### Reliability

### Observability

### Remaining Risks

### Known Accepted Risks

### Launch Blockers

Classify launch blockers as:

CRITICAL
HIGH
MEDIUM
LOW

Do not declare the application production-ready if a CRITICAL issue remains unresolved.

## Final hardening log

Update:

`docs/security/PRODUCTION_HARDENING_LOG.md`

with:

* every phase
* every finding
* every fix
* every changed file
* every migration
* every test
* every test result
* unresolved risks
* accepted risks

At the very end, provide a concise launch/no-launch recommendation with evidence.
