---
name: duo-real-money
description: duo-test real-money readiness (PR #9, 2026-10-04): what code covers, what waits on yskills (address, legal-text service, domain + Resend, Gewerbe/ELSTER, Stripe live)
metadata:
  type: project
  modified: 2026-10-04T15:57:49.736Z
---

2026-10-04, thread "real money ready": duo-test PR #9 adds legal pages (drafts, `[PLATZHALTER]` until `shared/business.ts` is filled), the § 312j order box, the confirmation email that makes the digital waiver count, password reset, data export, account deletion (purchases kept, 8-year retention since BEG IV), and a lock: a live Stripe key sells nothing until business.ts is complete and RESEND_API_KEY + MAIL_FROM exist.

Waiting on yskills: rented Impressum address (they'll send it; it goes into shared/business.ts), legal-text service texts to replace the drafts, own domain + Resend key, Gewerbe + ELSTER (Kleinunternehmer), Stripe live activation last. PR #11 (merged 2026-10-04 21:57): email verification behind the mail switch (link only confirms when that account is signed in, no auto sign-in), Origin/Sec-Fetch-Site guard on API writes, shared mail caps (shared/mail-caps.ts). The automated security hook flip-flopped on cap design over 3 rounds; final design reasoned in server/utils/mail-caps.ts, don't re-churn it.

**How to apply:** when yskills sends the address, fill shared/business.ts and drop the draft note only once service texts are in. Lessons went to the setup thread for the `sell` skill. Related: [[stripe-plugin-review]].
