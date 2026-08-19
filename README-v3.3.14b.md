# Quantum YiJing v3.3.14b — Guaranteed Generic Payment Receipt

Run `migrate-v3.3.14b.sql` on Preview D1 first.

This version separates payment state from email state.

After a verified DOKU SUCCESS:
- order/payment is marked Paid;
- generic customer gets a QY-branded Payment Receipt;
- QY gets an internal Payment Received email;
- each email is recorded independently as Sent or Failed;
- DOKU retries can recover a failed email without duplicating a successful one.

`/admin-payment-records.html` now shows:
- Customer Email status
- QY Internal Email status
- error text if either send failed

Replace/add:
- migrate-v3.3.14b.sql
- functions/api/payment/doku/notify.js
- functions/api/admin/payment-records.js
- admin-payment-records.html

No change to generic-payment.html or generic checkout creation is required.

Test with a NEW generic Sandbox payment after deployment.
