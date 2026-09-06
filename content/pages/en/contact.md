---
title: Contact
---

## Contact the Provelopment Foundation

Use the form below to send a message to the site owner. The form is the
Foundation's **configurable inquiry seam**: it validates input and transmits
the submission to the configured endpoint. The Foundation does not store,
email, or otherwise process inquiries itself — it only works when the site
owner has connected a receiver.

This demonstration runs in **demo mode** (`features.contact.provider` =
`"stub"`): the form accepts and validates submissions, shows a success
message, but sends nothing — and it says so. A production site switches the
provider to `"webhook"` and supplies the receiver URL and optional shared
token as environment variables on its deployment (see `DEPLOYMENT.md`); the
same form then transmits real inquiries.

As a template and demonstration shell, the Provelopment Foundation does not
operate a live inquiry service here. Real operational contact belongs to
**Provelopment.com**, the eventual operational site built from this
Foundation.