# Quantum YiJing v3.3.11d1 — Enquiry Email Hotfix

Replace only:

functions/api/enquiry.js

No D1 migration required.

Key correction:
- Customer enquiry acknowledgement is now suppressed based on the actual result of order creation:
  isCourseRegistration = !!orderInfo?.orderReference
- Genuine enquiries still receive the normal "1–2 working days" acknowledgement.
- Course registrations with a successfully created order do NOT receive that generic enquiry email.
- Internal QY notification remains.

This is safer than relying only on the incoming createOrder flag because it uses the actual created order as the source of truth.
