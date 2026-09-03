# v3.3.14c — Revised Generic Payment Verification Flow

Run migrate-v3.3.14c.sql on Preview D1.

Flow:
1. Customer pays DOKU. DOKU may email customer.
2. DOKU SUCCESS reaches QY. QY records gateway Paid but keeps verification Unverified, and emails QY: Verification Required. No QY customer receipt yet.
3. In /admin-payment-records.html, QY clicks Verify & Confirm. System verifies gateway_hash_verified=1, changes verification_status to Verified, sends customer QY Payment Receipt, and sends QY internal Payment Verified & Confirmed accounting email.

Replace/add:
- migrate-v3.3.14c.sql
- functions/api/payment/doku/notify.js
- functions/api/admin/generic-payment-verify.js
- functions/api/admin/payment-records.js
- admin-payment-records.html

Course/product payment flow remains automatic and unchanged.
