We are preparing BumpOne.lol for worldwide production.

BumpOne is a money-driven competitive ranking platform where legitimate payments directly affect public rankings. Treat the application as an adversarial financial system, not as a normal CRUD SaaS application.

Before making ANY security or architecture changes, establish a verified baseline.

## Your job

Thoroughly inspect the existing BumpOne codebase, including:

* Next.js application
* API routes
* authentication
* Supabase configuration
* PostgreSQL schema
* ALL migrations
* RLS policies
* database functions/RPCs
* triggers
* payment implementation
* Dodo webhook implementation
* Cloudflare/OpenNext configuration
* R2 upload implementation
* realtime implementation
* rate limiting
* admin functionality
* middleware
* environment/configuration handling
* tests
* package dependencies
* deployment configuration
* documentation

Do NOT modify application code in this phase.

## Security principles

Assume:

* Every public endpoint will be attacked.
* Every client-side value can be manipulated.
* Users can send requests without using the UI.
* Attackers can run requests concurrently.
* Attackers can replay requests.
* Attackers can modify JSON bodies.
* Attackers can forge query parameters.
* Attackers can create multiple accounts.
* Attackers can inspect frontend JavaScript.
* Attackers can attempt IDOR attacks.
* Attackers can abuse payment flows.
* Attackers can attempt webhook replay/forgery.
* Attackers can intentionally create race conditions.
* Attackers can attempt to exhaust infrastructure resources.
* Attackers can upload malicious content.
* Attackers can attempt to abuse admin functionality.

Do not assume the frontend protects anything.

## Verify the current system

Create a detailed security baseline covering:

### 1. Attack surface

List every externally reachable:

* page
* API endpoint
* webhook
* upload endpoint
* realtime channel
* authentication endpoint
* admin endpoint
* callback
* redirect
* external integration

For each, identify authentication, authorization, validation, rate limiting, and important dependencies.

### 2. Trust boundaries

Document:

Browser
→ Cloudflare
→ Next.js API
→ Supabase
→ PostgreSQL
→ Dodo
→ R2
→ Supabase Realtime

Explain what data is trusted and untrusted at every boundary.

### 3. Financial security

Trace:

purchase creation
→ quote
→ Dodo checkout
→ webhook
→ payment verification
→ RPC
→ Active Value
→ ranking
→ board event

Identify every security assumption in this chain.

### 4. Ranking invariants

Document the invariants that MUST NEVER be violated.

Examples:

* Active Value can only increase through legitimate payment processing.
* Users cannot directly modify authoritative ranking fields.
* A payment cannot be credited twice.
* A webhook cannot be processed twice.
* A payment cannot credit the wrong project.
* A user cannot pay using another user's quote.
* A user cannot manipulate the quoted amount.
* Concurrent purchases cannot corrupt rankings.
* `current_rank` must remain consistent with canonical ranking rules.
* Money must remain integer minor units.

Verify these against the actual implementation.

### 5. Authentication and authorization

Audit:

* Supabase Auth
* sessions
* cookies
* OAuth
* magic links
* user synchronization
* ownership checks
* RLS
* admin authorization
* service-role usage

Look specifically for IDOR and privilege escalation possibilities.

### 6. Database security

Inspect every migration and identify:

* RLS policies
* grants
* triggers
* SECURITY DEFINER functions
* function ownership
* search_path handling
* privileged database access
* authoritative-field protection
* unique constraints
* foreign keys
* check constraints
* transaction boundaries

Do not assume the latest migration tells the whole story. Inspect the complete migration history.

### 7. API security

For every endpoint determine:

* input validation
* authentication
* authorization
* rate limiting
* request size limits
* error handling
* information leakage
* database access
* abuse potential

### 8. Content security

Audit:

* project titles
* handles
* bios
* chat messages
* URLs
* images
* avatars
* social metadata
* HTML rendering
* Markdown rendering
* redirects

Look specifically for XSS, SSRF, malicious URLs, and injection opportunities.

### 9. Infrastructure

Inspect:

* Cloudflare configuration
* Workers
* OpenNext
* R2
* caching
* headers
* CORS
* CSP
* environment variables
* logging
* deployment settings

### 10. Dependencies

Inspect package.json and lockfile.

Identify:

* outdated security-sensitive packages
* unnecessary dependencies
* packages with excessive privileges
* duplicate libraries
* dangerous transitive dependencies

Do not upgrade packages yet.

## Run existing tests

Run the existing test suite.

Record:

* exact command
* result
* number of tests
* failures
* warnings

Also run available:

* TypeScript checks
* ESLint
* build
* migration validation

Do not claim success unless you actually ran the command.

## Severity classification

Classify every finding:

CRITICAL
HIGH
MEDIUM
LOW
INFO

For every finding provide:

* ID
* severity
* affected component
* file/path
* relevant function/table/RPC
* attack scenario
* actual evidence
* security impact
* recommended fix
* whether it requires code/database/infrastructure changes

Clearly distinguish:

VERIFIED VULNERABILITY

from:

POTENTIAL RISK

from:

RECOMMENDATION

Do not invent vulnerabilities.

## Create the security work log

Create:

`docs/security/PRODUCTION_HARDENING_LOG.md`

This file becomes the permanent audit trail for this project.

It must contain:

# BumpOne Production Hardening Log

## Project

BumpOne.lol

## Security Objective

Prepare BumpOne for hostile worldwide internet traffic and financially adversarial users.

## Baseline

Include the current architecture and important invariants.

## Phase Status

| Phase   | Status   | Date | Tests | Notes                |
| ------- | -------- | ---- | ----- | -------------------- |
| Phase 0 | Complete | ...  | ...   | Baseline established |

## Findings

Use IDs such as:

SEC-001
SEC-002
SEC-003

Each finding must contain:

* Severity
* Status
* Component
* Evidence
* Risk
* Fix
* Verification

## Changed Files

For this phase explicitly state:

`No application code changed.`

## Test Results

Record exact commands and actual results.

## Remaining Risks

List unresolved issues.

## Important Rules

From this point onward, EVERY future hardening phase must update this same file.

For every future change record:

1. Phase
2. Date
3. Objective
4. Findings addressed
5. Files changed
6. Database migrations added
7. Security behavior changed
8. Tests added
9. Tests executed
10. Results
11. Remaining risks
12. Rollback considerations

Also create a separate file:

`docs/security/THREAT_MODEL.md`

Document:

* assets
* attackers
* trust boundaries
* attack surfaces
* abuse cases
* financial attack scenarios
* ranking manipulation scenarios
* authentication attacks
* infrastructure attacks
* content attacks
* availability attacks

## Critical requirement

Do NOT make security changes yet.

The deliverable for this phase is:

1. Verified baseline
2. Threat model
3. Prioritized findings
4. `docs/security/PRODUCTION_HARDENING_LOG.md`
5. `docs/security/THREAT_MODEL.md`
6. Test/build baseline

At the end, provide a concise summary of the findings and explicitly list which issues should be fixed first.
