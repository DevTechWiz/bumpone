We now have to try to break the hardened BumpOne system.

Do NOT modify production data.

Do NOT attack external systems.

Use local/test environments, mocks, fixtures, or isolated test infrastructure.

Read all previous security documentation first.

## Objective

Create an adversarial automated test suite that assumes the attacker controls the client.

### Financial attacks

Test:

* duplicate webhook
* concurrent duplicate webhook
* forged webhook
* modified amount
* modified currency
* modified project
* modified user
* modified quote
* expired quote
* reused quote
* paid quote reuse
* cancelled payment
* invalid provider ID
* duplicate provider payment ID

### Race attacks

Test:

* 2 simultaneous purchases
* 10 simultaneous purchases
* 100 simultaneous purchases
* simultaneous purchases targeting #1
* simultaneous purchases targeting same project
* concurrent reaction changes
* concurrent moderation/ranking operations

After every test verify:

* Active Value
* total paid
* rank
* ranking sequence
* payments
* board events

remain internally consistent.

### Authorization attacks

Test:

* User A accessing User B
* anonymous admin access
* forged role
* manipulated UUIDs
* unauthorized updates
* unauthorized RPC invocation

### API attacks

Test:

* malformed JSON
* oversized body
* repeated requests
* invalid content type
* huge query parameters
* invalid UUID
* invalid enum
* negative amounts
* integer overflow boundaries
* extremely long strings

### Content attacks

Test malicious:

* titles
* handles
* bios
* chat
* report comments
* URLs
* image files

### Invariant testing

Create property/invariant tests where practical.

The fundamental invariant is:

**Unauthorized requests must never alter authoritative financial/ranking state.**

## Security regression suite

Create:

`src/__tests__/security/`

Organize tests by:

* financial
* authorization
* API abuse
* content
* database
* concurrency

Run the full suite.

Fix vulnerabilities discovered by the tests.

Do not simply weaken assertions to make tests pass.

Update:

`docs/security/PRODUCTION_HARDENING_LOG.md`

with every discovered issue and fix.
