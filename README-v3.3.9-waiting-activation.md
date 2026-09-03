# v3.3.9 — Waiting for Activation Admin Flow

Replace these 3 files:
- admin-affiliate-portal.html
- admin-affiliate-portal.js
- functions/api/admin/affiliate-portal-activation.js

Behavior:
- GET endpoint returns only affiliates with status='Approved' and portal_enabled=0.
- Admin page shows a dropdown of affiliates waiting for portal activation.
- Numeric Affiliate ID no longer needs to be remembered or typed.
- Affiliate remains in the list after email is sent.
- Affiliate disappears automatically after successful portal activation sets portal_enabled=1.
- POST refuses to send if portal is already active.

Test in Preview:
1. Open /admin-affiliate-portal
2. Enter Admin Token
3. Click Load Waiting Affiliates
4. Select Affiliate Test 39 / QY-A0003
5. Click Send Activation Email
6. Verify the standardized email.
7. Do not activate yet until email appearance is confirmed.
