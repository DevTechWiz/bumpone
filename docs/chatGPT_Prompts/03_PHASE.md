Now harden every public HTTP/API boundary.

Read the existing security documentation before changing anything.

## Objective

Make BumpOne resistant to:

* brute force
* API flooding
* bot abuse
* request amplification
* rate-limit bypass
* oversized requests
* expensive endpoint abuse
* scraping
* account creation abuse
* chat spam
* reaction spam
* report spam
* checkout abuse
* resource exhaustion

## Audit every endpoint

Create a table containing:

* route
* method
* authentication
* authorization
* input validation
* maximum body size
* rate limit
* rate-limit identity
* expensive operations
* database operations
* abuse scenario

Inspect every `/api/*` endpoint.

## Rate limiting

The current process-local in-memory rate limiter must be treated as insufficient for globally distributed serverless execution.

Determine the best architecture for this deployment.

Prefer an architecture appropriate for Cloudflare Workers rather than blindly adding Redis.

Consider:

* Cloudflare-native controls
* distributed rate limiting
* Durable Objects/KV where appropriate
* Cloudflare WAF/rate limiting
* per-user limits
* per-IP limits
* endpoint-specific limits

Do not choose a technology simply because it is popular.

Document the tradeoff.

## Request validation

Ensure every public endpoint validates:

* method
* content type
* body size
* JSON structure
* string length
* numeric bounds
* UUID format
* enums
* URLs
* pagination
* query parameters

Reject malformed input early.

## Abuse controls

Pay particular attention to:

* `/api/purchase/create`
* `/api/uploads/image`
* `/api/reactions`
* `/api/war-room/messages`
* `/api/reports`
* `/api/profile/check-handle`

Prevent attackers from causing expensive database or external API work before validation/rate limiting.

## Security headers

Audit and implement appropriate:

* Content-Security-Policy
* X-Content-Type-Options
* Referrer-Policy
* Permissions-Policy
* frame protections
* HSTS where appropriate

Do not blindly deploy a CSP that breaks legitimate functionality.

Test it.

## CORS

Determine whether CORS is actually needed.

If not, keep it restrictive.

Never use wildcard origins for authenticated operations unless there is a demonstrated requirement.

## Error leakage

Ensure production errors do not expose:

* SQL details
* stack traces
* secrets
* internal paths
* provider credentials
* database structure unnecessarily

Keep useful server-side logs without leaking sensitive data to clients.

## Cache security

Audit:

* `/api/board`
* ETags
* cache keys
* authenticated vs public responses
* stale data
* cache poisoning
* user-specific data

Ensure private data can never be cached into a public response.

## Tests

Add abuse tests for:

* rate-limit bypass
* oversized requests
* malformed JSON
* invalid parameters
* repeated checkout creation
* repeated reactions
* chat flooding
* report flooding

Run all tests and production build.

Update the hardening log with every change.
