# Quantum YiJing v3.3.6c — Partial-Payment Status Constraint Fix

The failed RM500 save did not create an extra payment row. Preview still shows only payment IDs 16, 17 and 18 for order QY-20260815-858B65.

## Cause
The existing `orders.payment_status` CHECK constraint allows:
Pending, Paid, Failed, Cancelled, Refunded, External

It does not allow `Partially Paid`.

## Fix
No D1 table rebuild is required.

QY now calculates and displays:
- 0 paid -> Pending
- >0 but below order total -> Partially Paid
- paid to order total -> Paid

For a partially paid order, the legacy database column stores `Pending`, while the Admin UI and charts display the calculated `Partially Paid` status.

## Install — Preview only
1. Replace root `admin.js`.
2. Replace `functions/api/admin.js`.
3. No D1 migration.
4. Commit as `v3.3.6c partial payment status fix`.
5. Push to `v2-development`.
6. Test Preview.

## Current test order
QY-20260815-858B65 currently has:
- RM500 DOKU Paid + Verified
- RM500 Bank Transfer Paid + Verified
- Paid to Date RM1,000
- Balance Due RM400

After installing v3.3.6c, open Record Payment:
- Order total should be RM1,400
- Paid to date RM1,000
- Balance due RM400
- This payment defaults to RM400

Save final RM400 as Paid + Verified. Expected result:
- Paid to Date RM1,400
- Balance Due RM0
- Calculated Order Status Paid

No DOKU notification/signature code is changed.
