# Quantum YiJing v3.3.6b — Authoritative Paid-to-Date / Balance Fix

## Problem found
The backend correctly counted verified payment records, but the payment dialog could
show stale `Paid to Date` / `Balance Due` values from the already-loaded Orders list.

Example discovered:
- Order total: RM1,400
- Verified DOKU payment: RM500
- Verified Bank Transfer: RM500
- Correct Paid to Date: RM1,000
- Correct Balance Due: RM400
- Dialog incorrectly showed RM0 / RM1,400

The backend overpayment protection correctly rejected another RM500.

## Fix
v3.3.6b adds a dedicated read-only Admin API:
`/api/admin?action=paymentbalance&id=<orderId>`

The Record Payment dialog now fetches the balance directly from D1 every time it opens
(or the selected order changes), using the SAME rule as `savePayment()`:

Counts toward Paid to Date only when:
- payment status is `Paid` or `External`; AND
- verification status is `Verified`.

Settlement status remains separate and does not affect Paid to Date.

## Install — Preview only
1. Replace root `admin.js` with supplied `admin.js`.
2. Replace `functions/api/admin.js` with supplied `functions-api-admin.js`.
3. No D1 migration.
4. Commit as `v3.3.6b authoritative payment balance`.
5. Push to `v2-development`.
6. Test Preview.

## Expected test for order QY-20260815-858B65
Current D1 verified payments:
- RM500 DOKU
- RM500 Bank Transfer

Expected dialog:
- Order total: RM1,400
- Paid to date: RM1,000
- Balance due: RM400
- This payment amount defaults to RM400

Then a final RM400 Bank Transfer marked Paid + Verified should be accepted and make:
- Paid to date: RM1,400
- Balance due: RM0
- Order payment status: Paid

## Important
- Keep backend overpayment protection.
- No DOKU notification/signature code is changed.
- No payment records are altered by this patch.
