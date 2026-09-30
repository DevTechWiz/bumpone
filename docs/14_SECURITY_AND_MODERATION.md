# BumpOne.lol — Security and Moderation

## Authentication

Users should have an identity associated with purchases.

Recommended:

Supabase Auth.

---

# Payment Security

Never trust:

- client-calculated payment amount
- client rank
- client payment status

Always calculate/validate server-side.

---

# Database Security

Use Row Level Security where appropriate.

Public users can read approved public profiles.

Users cannot directly update:

rank
purchase status
current_active_value

---

# Upload Security

Validate uploaded files server-side.

---

# URL Security

Validate destination URLs.

Prevent dangerous schemes.

---

# Rate Limiting

Rate-limit:

- purchase session creation
- uploads
- reports
- profile edits
- authentication attempts

---

# Bot Protection

Consider CAPTCHA/Turnstile before purchase session creation if abuse appears.

Do not add unnecessary friction on day one.

---

# Moderation

Admin must be able to:

- hide profile
- suspend profile
- remove image
- disable destination link
- suspend project (chargeback handling)
- inspect purchase
- inspect reports

---

# Auditability

Every administrative action should be logged.

---

# User Content

Users may submit:

* profile images
* names
* descriptions
* links
* categories
* other profile content supported by the product

The service must prohibit or moderate content that violates applicable law or platform policy.

Consider:

* illegal content
* fraud/scams
* impersonation
* phishing/malware
* harassment
* hate content
* sexual/explicit content where prohibited
* stolen/intellectual-property-infringing material
* malicious URLs
* misleading representations

---

# Reporting

Users must be able to report problematic profiles.

Admin/moderation must be able to:

* review
* hide
* suspend
* remove
* document the action

---

# Copyright / Trademark

Define a complaint/takedown process.

Do not assume that a user is automatically authorized to use another person's:

* logo
* trademark
* photograph
* brand identity
* copyrighted content