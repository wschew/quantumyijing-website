# Quantum YiJing v3.3.16v — Affiliate Net Commission Reconciliation

Purpose: affiliate-facing display/reconciliation only. No D1 migration and no accounting-engine changes.

Replace only:
- `affiliate-dashboard.html`
- `affiliate-dashboard.js`

Changes:
- Renames the gross commission KPI to **Gross Commission Earned**.
- Calculates **Net Pending Commission** as gross pending commission plus valid before-payout adjustments.
- Calculates **Commission Paid (Net)** from actual Paid affiliate payout batches instead of gross historical commission rows.
- Adds small reconciliation notes for total adjustments and before-payout adjustments.
- Preserves the existing Refund & Commission Adjustments audit section.

Expected test values with current Preview data:
- QY-A0002: Gross Commission Earned MYR 285.00; Net Pending Commission MYR 144.00; Commission Paid (Net) MYR 0.00.
- QY-A0003: Gross Commission Earned MYR 480.00; Net Pending Commission MYR 0.00; Commission Paid (Net) MYR 340.00.
