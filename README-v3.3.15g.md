# Quantum YiJing v3.3.15g — Simplified Sales & Commerce Dashboard

Baseline:
- v3.3.15d remains the frozen stable verification baseline.
- v3.3.15f payment verification behavior is retained.

No new D1 migration is required.

Replace only:
- admin.html
- admin.js

Changes:
1. Removed both reconciliation explanatory statements from the Record Payment / Settlement verification form.
2. Removed the Payment & Accounting Records section from Sales & Commerce.
3. Removed dashboard KPI cards for:
   - Platform / Provider Fees
   - Net Amount
   - Bank Received
4. Dashboard keeps Gross Sales as the primary accounting metric.
5. Existing payment verification, manual hash override, receipt generation and synchronization logic remain unchanged.
6. Settlement fee/net/bank reconciliation is intentionally deferred to the future DOKU settlement import/reconciliation module.

Recommended test:
- Open Sales & Commerce and confirm the Record Payment form has no settlement explanation blocks.
- Confirm Payment & Accounting Records section is no longer shown.
- Confirm only Gross Sales remains among the settlement-related KPI cards.
- Verify a Generic or YJ12 payment to ensure the v3.3.15f receipt and verification workflow is unchanged.
