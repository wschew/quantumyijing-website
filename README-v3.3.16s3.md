# Quantum YiJing v3.3.16s3 — D1 Atomic Mark Paid Fix

## Purpose
Fixes HTTP 500 from `/api/admin/affiliate-payout-pay` on Cloudflare D1.

## Cause
Cloudflare D1 rejects SQL `BEGIN`, `COMMIT`, and `ROLLBACK` transaction statements in Pages Functions.

## Change
Replaces the unsupported SQL transaction block with one atomic `db.batch()` operation.

The patch preserves the existing tested rules:
- Approved payout only can be marked Paid.
- Payment eligibility is rechecked before payment.
- Stale refund/reversal adjustments still block payment.
- Linked affiliate commissions are marked Paid.
- Fully consumed carry-forward adjustments are marked Applied.
- Payout notification emails remain unchanged.

## Installation
Replace only:
`functions/api/admin/affiliate-payout-pay.js`

No D1 migration is required.
