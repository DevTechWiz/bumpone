Now harden BumpOne's identity and authorization layer.

Read:

`docs/security/PRODUCTION_HARDENING_LOG.md`
`docs/security/THREAT_MODEL.md`
`docs/security/FINANCIAL_SECURITY.md`

Audit the entire authentication and authorization model.

## Threat model

Assume an attacker:

* knows another user's UUID
* knows another project UUID
* knows another quote UUID
* knows another payment UUID
* modifies every frontend request
* removes authentication headers/cookies
* swaps IDs
* creates multiple accounts
* attempts privilege escalation
* attempts admin endpoint access
* calls APIs directly without the UI

## Audit

Inspect:

* Supabase Auth
* SSR authentication
* middleware
* cookies
* OAuth callback
* magic links
* `/api/auth/sync`
* user synchronization
* every authenticated API route
* every ownership check
* every RLS policy
* every SECURITY DEFINER function
* admin authentication
* service-role usage

## IDOR testing

For every user/project-owned resource test:

User A cannot:

* modify User B's project
* top up User B's project
* edit User B's metadata
* modify User B's profile
* manipulate User B's reactions
* access private User B data
* use User B's quote
* trigger operations belonging to User B

Test by replacing IDs in requests.

Do not rely on frontend restrictions.

## RLS audit

Review every table.

For each table document:

* SELECT policy
* INSERT policy
* UPDATE policy
* DELETE policy
* authenticated behavior
* anonymous behavior
* service-role behavior

Find overly permissive policies.

Pay particular attention to:

* users
* projects
* purchase_quotes
* payments
* payment_events
* board_events
* reactions
* messages
* reports
* admin_audit_log

## Admin security

Verify that normal users cannot:

* access admin data
* invoke admin APIs
* modify moderation status
* pause purchases
* create audit records
* impersonate admins
* forge `is_official`
* invoke privileged RPCs

## Fix verified vulnerabilities

Strengthen both:

1. application-level authorization
2. database-level authorization

Do not depend exclusively on either layer.

## Tests

Create adversarial authorization tests.

At minimum test:

* anonymous → protected endpoint
* User A → User B resource
* authenticated → admin endpoint
* malformed UUID
* missing session
* expired session
* forged role
* manipulated project ID
* manipulated quote ID
* manipulated user ID

Run the complete test suite plus build/type/lint checks.

## Documentation

Update:

`docs/security/PRODUCTION_HARDENING_LOG.md`

Create/update:

`docs/security/AUTHORIZATION_MODEL.md`

Document:

* authentication architecture
* authorization architecture
* RLS model
* admin model
* service-role boundaries
* ownership rules

Do not expose credentials.

Do not modify unrelated product behavior.
