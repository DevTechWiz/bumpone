Now harden the administrative control plane.

The admin system can:

* moderate projects
* affect rankings
* pause purchases
* potentially influence platform availability

Therefore treat admin endpoints as highly privileged financial infrastructure.

## Audit

Inspect:

* admin authentication
* ADMIN_EMAILS
* app_metadata role
* admin middleware
* every `/api/admin/*` endpoint
* admin UI
* audit logging
* emergency killswitch

## Verify

Normal users must not be able to:

* access admin pages/data
* call admin APIs
* forge admin role
* modify moderation status
* pause purchases
* approve projects
* manipulate audit logs

## Audit logging

Verify that sensitive administrative actions produce:

* actor
* timestamp
* action
* target
* reason
* relevant metadata

Audit logs must not be casually mutable/deletable by administrators through the application.

## Emergency controls

Review purchase pause behavior.

Determine:

* how quickly it takes effect
* whether checkout creation respects it
* whether an already-created checkout can still complete
* whether webhook processing should continue
* how administrators resume operations

Do not break legitimate already-paid transactions.

## Secrets

Ensure production secrets are never:

* committed
* returned in API responses
* logged
* exposed to browser bundles

## Incident response

Create:

`docs/security/INCIDENT_RESPONSE.md`

Cover:

* compromised admin
* payment abuse
* webhook compromise
* database compromise
* DDoS
* malicious content outbreak
* leaked credentials
* suspicious ranking manipulation
* chargeback/fraud events

Include containment steps and recovery steps.

Update the hardening log.
