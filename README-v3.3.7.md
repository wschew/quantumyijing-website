# Quantum YiJing v3.3.7 — Flexible Final Fee + Paid/Balance Columns

## New capability 1 — Orders table
The Orders table now shows:
- Total (effective/final agreed fee)
- Paid
- Balance

This lets Admin see the collection position without opening each payment dialog.

## New capability 2 — Flexible final agreed fee
The original checkout/order total is preserved as the commercial snapshot.

Admin can set a separate `Final Agreed Fee`, for example:

Original order / early-bird total: RM1,400
Sales-approved final fee: RM1,200
Paid to date: RM1,200
Balance: RM0
Status: Paid

This supports discretionary sales discounts without changing the product's standard price.

The adjustment also records:
- Fee adjustment reason
- Fee adjusted timestamp

## Accounting rule
All Paid-to-Date and Balance calculations use:
`COALESCE(final_agreed_total, original order total)`

The Final Agreed Fee cannot be set below money already verified as paid.

## Install — Preview first
1. Run `migrate-v3.3.7.sql` in Preview D1.
2. Replace root `admin.html`.
3. Replace root `admin.js`.
4. Replace `functions/api/admin.js`.
5. Commit as `v3.3.7 flexible final fee`.
6. Push to `v2-development`.
7. Test Preview.

## Test case
For an order originally RM1,400:
- Set Final Agreed Fee = RM1,200
- Reason = `Sales-approved discount RM200`
- Record RM1,200 as Paid + Verified

Expected:
- Paid to Date RM1,200
- Balance RM0
- Status Paid
- Orders table: Total RM1,200 / Paid RM1,200 / Balance RM0

## Important
No DOKU notification/signature code is changed.
