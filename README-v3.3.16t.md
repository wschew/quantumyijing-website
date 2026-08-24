# Quantum YiJing v3.3.16t — Unpaid Liability Reconciliation

Focused reporting-only patch on top of v3.3.16s3.

## What it changes
- Renames **Unpaid Liability** to **Net Unpaid Liability**.
- Shows the reconciliation directly under the KPI:
  - Gross unpaid commission
  - Pre-payout adjustments
  - Net unpaid liability
- For the current Preview test data the expected result is:
  - Gross unpaid commission: MYR 285.00
  - Pre-payout adjustments: MYR -1.00
  - Net unpaid liability: MYR 284.00

## What it does NOT change
No payment, commission, payout, attribution, refund/reversal, application, navigation, D1 schema, or payout engine logic is changed.

## Install
Replace only:
1. `admin-affiliate-payouts.html`
2. `admin-affiliate-payouts.js`
3. `functions/api/admin/affiliate-accounting-summary.js`

No D1 migration.
