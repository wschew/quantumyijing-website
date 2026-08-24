Quantum YiJing v3.3.16w4 — Affiliate Bank Payment Display Cleanup

Replace these 2 files in your project:
1. admin-affiliate-bank-payments.html
2. admin-affiliate-bank-payments.js

What changed:
- Webpage table now stops at Affiliate Email.
- Payment Reference, Payment Date and Remarks are removed from the webpage because they are not entered on this read-only page.
- Excel export is intentionally unchanged and still contains:
  Payment Reference | Payment Date | Remarks
  as blank working columns for the accounts team to complete after bank payment.
- No payout calculation, approval, payment or accounting logic was changed.

Test:
1. Open /admin-affiliate-bank-payments
2. Choose August 2026 and Include test affiliates if needed.
3. Load Payment List.
4. Confirm webpage ends at Email.
5. Export Excel.
6. Confirm Excel still contains Payment Reference, Payment Date and Remarks.
