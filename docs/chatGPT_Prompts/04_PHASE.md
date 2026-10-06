Audit all user-controlled content in BumpOne.

Assume every user input is malicious.

Inspect:

* project title
* project handle
* destination URL
* category
* profile name
* bio
* social links
* chat messages
* report comments
* image uploads
* OG metadata
* share pages
* query parameters
* slot tags

## XSS

Search for:

* dangerouslySetInnerHTML
* HTML rendering
* Markdown rendering
* unsanitized DOM insertion
* unsafe URL construction
* user-controlled attributes

Test payloads conceptually and through automated tests.

Prevent:

* stored XSS
* reflected XSS
* DOM XSS
* attribute injection
* javascript: URLs
* data: URLs where unsafe

## URLs

Create a single authoritative URL validation strategy.

Consider:

* protocol
* hostname
* credentials in URLs
* localhost/private IPs
* unusual schemes
* encoded URLs
* redirects

Determine whether any server-side URL fetching exists.

If BumpOne ever fetches user-provided URLs server-side, perform an SSRF audit.

## Image uploads

Audit the entire upload pipeline.

Verify:

* authentication
* size limits
* MIME validation
* magic-byte validation
* image decoding
* re-encoding
* metadata stripping
* filename safety
* storage path isolation
* content-type handling
* cache behavior

Consider decompression bombs and malformed image files.

## Social metadata

Ensure malicious project data cannot inject arbitrary metadata or HTML into:

* OpenGraph
* Twitter/X cards
* page titles
* descriptions

## Chat

Audit:

* message length
* control characters
* HTML
* links
* mentions
* slot tags
* rate limiting
* deletion/moderation

## Tests

Add malicious-input tests.

Update documentation and hardening log.
