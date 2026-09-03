# Quantum YiJing v3.3.16r — Affiliate Refund & Commission Reversal Framework

Baseline: tested v3.3.16p + q1/q2 Affiliate Accounting cleanup.

## Scope
This version adds only the refund/reversal accounting required for affiliate commissions.
It does **not** change DOKU payment verification, attribution, affiliate application, commission creation, or main admin navigation logic.

## Confirmed accounting rule
### Before affiliate payout
A full/partial refund reduces that commission proportionally before payout.

Example:
- Sale MYR 100
- Commission 20% = MYR 20
- Customer refund MYR 25
- Commission adjustment = -MYR 5
- Net commission available for payout = MYR 15

### After affiliate payout
Historical Paid payout records are never rewritten.
A negative carry-forward recovery is created instead.

Example:
- Previously paid commission = MYR 280
- Later full refund = -MYR 280 carry-forward
- Next new commission = MYR 500
- Next bank payout = MYR 220

If the next new commission is only MYR 100:
- bank payout = MYR 0
- remaining carry-forward = -MYR 180
- the balance continues automatically to a later payout

## New accounting tables
`affiliate_commission_adjustments`
- immutable refund/reversal audit record
- original sale / commission
- refunded amount
- negative commission adjustment
- type, date, reference, reason
- recovery mode: PrePayout or CarryForward

`affiliate_payout_adjustments`
- records the part of a carry-forward adjustment allocated to a payout

`affiliate_payout_cancellations`
- audit record when a Draft/Approved payout must be cancelled and rebuilt

## Existing payout snapshots extended
`affiliate_payouts`
- gross_commission
- adjustment_total
- existing total_commission remains the NET amount actually payable

`affiliate_payout_items`
- original_commission_amount
- pre_payout_adjustment
- net_commission_amount

## Important migration
Run `migrate-v3.3.16r.sql` **ONCE in Preview D1** before deploying/testing the files.
The ALTER TABLE statements are intentionally one-time.

## Files to copy
- admin-affiliate-payouts.html
- admin-affiliate-payouts.js
- admin-affiliate-payouts.css
- functions/api/admin/affiliate-accounting-affiliates.js
- functions/api/admin/affiliate-accounting-summary.js
- functions/api/admin/affiliate-commission-adjustments.js
- functions/api/admin/affiliate-payout-candidates.js
- functions/api/admin/affiliate-payout-create.js
- functions/api/admin/affiliate-payout-approve.js
- functions/api/admin/affiliate-payout-cancel.js
- functions/api/admin/affiliate-payout-list.js
- functions/api/admin/affiliate-payout-pay.js
- migrate-v3.3.16r.sql

## Safety controls
1. Paid historical payouts are never edited by a refund.
2. A reversal on a Paid commission becomes CarryForward automatically.
3. A reversal on an unpaid commission becomes PrePayout automatically.
4. Partial refunds calculate commission reversal proportionally.
5. Cumulative refunds cannot exceed the remaining reversible sale value.
6. If a reversal is recorded after a Draft/Approved payout exists, that payout is stale.
7. Approve / Pay is blocked until the stale payout is Cancelled/Rebuilt.
8. Cancel/Rebuild releases the commissions and reserved carry-forward adjustments, then recreates using current balances.
9. The final bank transfer amount remains `affiliate_payouts.total_commission` — the NET payout after adjustments.
10. Payout emails show Gross Commission, Refund/Reversal Adjustments and Net Commission Paid.

## Recommended Preview test — do not start with a large full reversal
### Test 1 — pre-payout partial refund
Use a small unpaid QA commission such as test73/test74 if those records are still disposable test records.
- select the commission from Affiliate Commission Ledger
- Refund / Reverse
- enter a small partial refunded sale amount
- expected: recovery mode = Before payout
- Load Eligible Commissions
- expected: Net Commission is reduced proportionally

### Test 2 — Draft becomes stale
- create a Draft payout for an eligible QA commission
- then record a new refund/reversal against one commission in that Draft
- expected: Approve is blocked
- click Cancel / Rebuild
- reload candidate and recreate Draft
- expected: new payout uses the adjusted net amount

### Test 3 — already-paid carry-forward
Use only a disposable Paid QA commission.
- record a very small partial refund (for example MYR 10 of sale value)
- expected: recovery mode = Carry-forward
- Open Carry-forward becomes a negative amount

Then create a new eligible commission for the same affiliate.
- expected candidate screen shows Gross Commission, Carry-forward Balance and lower Net Payout
- create/approve/pay
- expected bank payout equals new commission minus recovery
- remaining recovery carries forward automatically if not fully absorbed

## Do not Production deploy yet
First complete the three Preview tests and retain screenshots of:
- Adjustment Ledger
- Eligible Commission summary before/after adjustment
- Cancel/Rebuild behavior
- final payout showing Gross / Adjustments / Net
