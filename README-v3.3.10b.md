# Quantum YiJing v3.3.10b — Approved Affiliate Dashboard Layout

Built on v3.3.10a.

Changes:
- Referral Link, Monthly Total Sales, and Monthly Sales by Category are side-by-side on desktop.
- Sales & Commission Statement is full-width.
- Monthly Payout History is full-width directly below the commission statement.
- Eligible Products to Promote is moved to the bottom.
- Eligible Products now uses a scalable table suitable for many future products.
- Keeps the corrected zero-sales chart behavior and sensible MYR Y-axis scaling for non-zero data.
- No backend, payment/accounting, affiliate commission, or DOKU changes.

Replace only:
- affiliate-dashboard.html
- affiliate-dashboard.js

Preview test:
1. Login as Affiliate Test 39.
2. Verify the three top panels appear side-by-side.
3. Verify Monthly Payout History is fully visible below Sales & Commission Statement.
4. Verify Eligible Products is full-width at the bottom.
5. Verify product links and copy buttons work.
6. Verify zero-sales charts show a clean RM 0.00 state.
