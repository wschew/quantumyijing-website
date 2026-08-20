# v3.3.15c — One Verification / Settlement Form

No new D1 migration is required.

Replace:
- functions/api/payment/doku/notify.js
- admin-payment-records.html
- admin.js
- admin.html

Workflow:
DOKU success -> QY verification email -> Review & Verify Payment
-> /admin?module=commerce&order=<ORDER_REFERENCE>
-> exact Sales & Commerce Record Payment / Settlement form opens
-> review Gross / Fee / Net / Amount received in bank
-> set Verification = Verified
-> Save Payment Record
-> centralized verifier issues customer receipt + QY accounting receipt
-> Payment Records and Sales & Commerce show the same database state.

Payment Records remains the audit/search screen.
It no longer has a separate direct verification path.

For Paid records where Bank Received is blank or zero, the form pre-fills Bank Received with Net for review.
Correct it before saving if settlement has not actually reached the bank or if the actual bank settlement differs.
