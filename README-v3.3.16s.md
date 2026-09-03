# Quantum YiJing v3.3.16s — Safe Commission Selection for Refund / Reversal

## Purpose
This is a focused safety and usability patch on top of the tested v3.3.16r refund/reversal framework.

It does **not** change refund mathematics, carry-forward mathematics, commission generation, attribution, payment verification, affiliate application, payout approval/payment rules, payout email logic, or admin navigation.

## What changes
1. Replaces manually typed Commission ID with a transaction dropdown.
2. The dropdown is scoped to the affiliate selected in **Select Payout Period**.
3. It includes historical commissions already assigned to or paid through a payout batch.
4. Each option shows Commission ID, invoice, customer, product, sale, commission and payout/paid status.
5. The backend re-validates that the selected commission belongs to the selected affiliate before any reversal is written.
6. Clicking **Refund / Reverse** in the global commission ledger attempts to select the matching affiliate and commission safely.

## Files to deploy
Replace:
- `admin-affiliate-payouts.html`
- `admin-affiliate-payouts.js`
- `admin-affiliate-payouts.css`
- `functions/api/admin/affiliate-commission-adjustments.js`

Add:
- `functions/api/admin/affiliate-commission-options.js`

## Database
**No D1 / SQL migration is required for v3.3.16s.**
The v3.3.16r migration remains the required database baseline.

## Test target
Select **Affiliate Test 39 / QY-A0003**. The new Commission Transaction dropdown should expose the paid historical RM1,400 sale / RM280 commission transaction and show its real Commission ID. Do not record the reversal until the displayed transaction has been verified.
