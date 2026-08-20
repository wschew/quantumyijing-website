# Quantum YiJing v3.3.14d

v3.3.14c is frozen as the functional baseline.

Replace only:
- generic-payment.html
- functions/api/payment/doku/notify.js
- admin-payment-records.html

No D1 migration.

Changes:
1. Generic payment form standardized to Quantum YiJing branding, typography, layout and bilingual UI.
2. Generic Payment Notice email now has a `Review & Verify Payment` button.
3. The button links to the exact payment:
   `/admin-payment-records.html?order=<ORDER_REFERENCE>`
4. The admin page pre-fills the order search and highlights the matching row after authentication.

Security:
The email button does not verify the payment. The existing authenticated `Verify & Confirm` action is still required.
