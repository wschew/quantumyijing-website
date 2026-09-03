# Quantum YiJing v3.3.10 — Affiliate Member Dashboard Consolidation

Built on frozen v3.3.9.

Changes:
- Consolidates affiliate-dashboard.js and affiliate-dashboard-v3.3.4a.js into one script.
- Removes the second legacy script include from affiliate-dashboard.html.
- Adds Account Status / Renewal display.
- Adds Current Month Sales metric.
- Keeps Total Sales, Commission Earned, Pending Commission and Commission Paid.
- Keeps the existing 12-month sales/category charts.
- Keeps rich affiliate product cards with price, SKU, commission and referral link.
- Adds empty states for products, commissions and payouts.
- Adds copy-success feedback.
- Keeps authentication/logout behavior unchanged.

Files to replace:
- affiliate-dashboard.html
- affiliate-dashboard.js

No backend files are changed in this release.
Do not load affiliate-dashboard-v3.3.4a.js after this change.

Preview test:
1. Login as Affiliate Test 39.
2. Verify name, affiliate code, membership expiry and status.
3. Verify 5 metrics.
4. Verify charts.
5. Copy general link and product link.
6. Verify product cards.
7. Verify commission/payout tables or empty states.
8. Logout and confirm redirect to affiliate login.
