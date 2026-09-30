# BumpOne.lol — Image and Link Rules

## Image

Users upload one profile image.

Recommended:

- square image
- JPEG
- PNG
- WebP
- maximum file size defined server-side

Images should be resized/compressed after upload.

---

# Image Storage

Use Cloudflare R2 (S3-compatible bucket: `profile-images`).

* **Zero Egress Fees**: Free bandwidth regardless of viral spectator spikes.
* **10 GB Free Storage**.
* **Edge Delivery**: Served directly through Cloudflare Global CDN.

---

# Image Security

Validate:

- MIME type
- file signature
- file size
- dimensions

Do not trust the filename or browser-provided MIME type.

---

# Destination URL

Users provide a URL.

Examples:

https://example.com

---

# URL Validation

Only allow:

https://

Permit plain http:// only if explicitly approved for the MVP (see `24_IMPLEMENTATION_CONTRACT.md`).

Reject:

javascript:
data:
file:
custom executable schemes

---

# Link Safety

Destination URLs should be stored exactly after normalization.

Optional future feature:

URL reputation scanning.

---

# Profile Content

The service must prohibit:

- malware
- phishing
- illegal content
- impersonation
- malicious redirects
- prohibited sexual content
- extremist content
- harassment
- fraudulent advertising

---

# Reporting

Every profile should have a report mechanism.

---

# Moderation

Moderation status:

pending
approved
rejected
suspended