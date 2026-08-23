# Quantum YiJing v3.3.16q2 — Affiliate Accounting Layout Width Fix

Base: tested v3.3.16q1 accounting display/ledger layer over frozen v3.3.16p logic.

## Scope
CSS/HTML layout only.

### Fixes
- Narrows Monthly Payout Summary so Commission by Sales Channel remains fully visible.
- Narrows Affiliate Country Report so Paid Payout History remains fully visible.
- Removes the global 1050px accounting-table minimum-width constraint inside the two reporting grids only.
- Adds `min-width:0` to accounting grid children so CSS Grid may shrink them correctly.
- Keeps horizontal scrolling only when genuinely needed at smaller viewport widths.

## Frozen / untouched
No change to payment, commission, payout, attribution, affiliate application, payout email, admin navigation, accounting API, D1 schema, or database data.

## Install
Replace only:
1. `admin-affiliate-payouts.html`
2. `admin-affiliate-payouts.css`

No SQL migration. No JS replacement. No Functions replacement.
