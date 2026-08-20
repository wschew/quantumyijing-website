# Quantum YiJing v3.3.15 — Unified Payment Verification & Receipt Framework

v3.3.14e remains frozen as the stable Generic Payment baseline.

Run ONCE on Preview D1:
`migrate-v3.3.15.sql`

Replace/add:
- migrate-v3.3.15.sql
- functions/api/payment/doku/notify.js
- functions/api/admin/generic-payment-verify.js
- functions/api/admin/payment-verify.js
- functions/api/admin/payment-records.js
- admin-payment-records.html

Core standard:
Payment Status and Verification Status remain separate.
Only Verified payments become `accounting_eligible = 1`.

Generic DOKU:
Paid / Unverified -> existing v3.3.14e admin verification -> Verified -> Accounting Eligible -> customer receipt + QY accounting receipt.

Normal course/product DOKU:
signature + order + amount + currency pass -> automatic Verified -> Accounting Eligible -> existing customer/QY notifications.

Bank Transfer / Cash / Manual / External:
when recorded Paid / Unverified -> Payment Records shows Verify & Confirm -> manual Verified -> Accounting Eligible -> standardized receipts.

New audit:
`payment_verification_events` records Automatic/Manual verification method, source, verifier, status and timestamp.

Recommended Preview tests:
1. Generic DOKU RM10: behavior unchanged; after verify, Method=Manual and Accounting Eligible=YES.
2. YJ12 DOKU Sandbox: automatic Verified; Method=Automatic and Accounting Eligible=YES.
3. Bank Transfer test: Paid/Unverified -> Verify & Confirm -> Verified + Accounting Eligible=YES + both receipt emails.

This provides the stable accounting boundary for the next Affiliate / Trainer / Consultant payout work.
