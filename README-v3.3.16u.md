# Quantum YiJing v3.3.16u — Affiliate Refund Visibility

Focused affiliate-facing transparency patch.

## Replace only
1. `affiliate-dashboard.html`
2. `affiliate-dashboard.js`
3. `functions/api/affiliate/portal/transactions.js`

## No D1 migration
This patch reads the existing `affiliate_commission_adjustments` and `affiliate_payout_adjustments` records already created by the tested admin accounting workflow.

## What changes
- Adds **Refund & Commission Adjustments** to the private affiliate dashboard.
- Shows refund/reversal/chargeback history for the logged-in affiliate only.
- Shows refunded sale amount and negative commission adjustment.
- Shows treatment: **Before payout** or **Carry-forward recovery**.
- Shows adjustment status, reference and reason.
- Shows amount already applied to a Paid payout and the payout reference.
- Shows current **Open Recovery / Carry-forward** balance.

## What does NOT change
- Payment logic
- Commission calculation logic
- Payout creation/approval/payment logic
- Attribution logic
- Affiliate application logic
- Admin navigation
- Existing reversal/carry-forward accounting engine

## QY-A0003 expected test result
For the earlier test:
- Refund: MYR 700.00
- Commission adjustment: MYR -140.00
- Treatment: Carry-forward recovery
- Status: Applied
- Applied payout should identify `AFFPAY-202608-8EFFC475`
- Open Recovery / Carry-forward: MYR 0.00

Do not install v3.3.16t until this affiliate-facing patch is tested successfully.
