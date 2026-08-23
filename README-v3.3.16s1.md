# Quantum YiJing v3.3.16s1 — D1 Atomic Draft Payout Fix

## Scope
Focused fix for HTTP 500 when clicking Create Draft Payout in v3.3.16s.

## Cause
Cloudflare D1 rejects SQL BEGIN / COMMIT / ROLLBACK statements from Pages Functions.

## Fix
`affiliate-payout-create.js` now uses D1 `db.batch()` for an atomic draft-payout write. Child payout items and carry-forward allocations resolve the new payout by its unique payout_reference inside the same batch.

## Unchanged
- Eligible commission calculation
- Pre-payout refund adjustment logic
- Carry-forward calculation
- Commission generation
- Payout approval
- Mark Paid / bank transfer
- Attribution
- Affiliate application
- Admin navigation

## Migration
None.

## Install
Replace only:
`functions/api/admin/affiliate-payout-create.js`
