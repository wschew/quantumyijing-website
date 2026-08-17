# Quantum YiJing v3.3.10a — Compact Affiliate Dashboard

Built on v3.3.10.

Changes:
- Compresses dashboard into approximately two desktop screen-pages.
- Uses two-column layout for referral link + monthly sales.
- Uses two-column layout for category sales + eligible products.
- Uses side-by-side commission statement + payout history.
- Reduces chart height.
- Fixes repeated RM0/RM1 Y-axis labels.
- Zero-sales charts now show a clean RM 0.00 empty state.
- Non-zero charts use a rounded 'nice' Y-axis scale.
- No backend changes.
- No payment/accounting changes.
- No DOKU changes.

Replace:
- affiliate-dashboard.html
- affiliate-dashboard.js

Test in Preview:
1. Login as Affiliate Test 39.
2. Confirm dashboard is materially shorter.
3. Confirm zero-sales charts no longer show repeated RM0/RM1.
4. Confirm referral link and product link copy still work.
5. Confirm tables still render correctly.
6. Test at desktop width and narrower browser width.
