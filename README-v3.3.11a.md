# Quantum YiJing v3.3.11a — D1 Transaction Compatibility Hotfix

Built on v3.3.11.

## Cause fixed
Cloudflare D1 Worker API does not support manual SQL:
- BEGIN
- COMMIT
- ROLLBACK

The original v3.3.11 payout-create and payout-pay functions used those statements and returned HTTP 500.

## Replace only these 2 files

Copy into:

functions/api/admin/

- affiliate-payout-create.js
- affiliate-payout-pay.js

No database migration is required for v3.3.11a.

## Changes

### affiliate-payout-create.js
- Removes SQL BEGIN / COMMIT / ROLLBACK.
- Creates payout header and obtains generated payout_id.
- Uses `db.batch()` for:
  - affiliate_payout_items inserts
  - linked commission state changes to Payable
- If the batch fails, the new Draft payout header is deleted to prevent an orphan batch.
- Returns error detail in Preview if creation fails again.

### affiliate-payout-pay.js
- Removes SQL BEGIN / COMMIT / ROLLBACK.
- Uses one atomic `db.batch()` to:
  - mark affiliate_payouts Paid
  - mark linked affiliate_commissions Paid and set paid_at

## Test after deploying
1. Open admin-affiliate-payouts.
2. Affiliate ID: 3.
3. Payout Month: August 2026.
4. Load Eligible Commissions.
5. Confirm MYR 1,400 sale / MYR 280 commission.
6. Click Create Draft Payout ONCE.
7. Stop and verify Draft payout before Approve.

v3.3.10b remains frozen and unchanged.
