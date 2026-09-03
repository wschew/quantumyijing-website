# Quantum YiJing v3.3.16 — Affiliate Accounting Cleanup Phase 1

Baseline:
- Payment workflow v3.3.15k remains FROZEN.
- This package does not modify DOKU, payment verification, receipt, or /admin Sales & Commerce logic.

## Purpose
Standardize affiliate payout accounting around the frozen payment rule:

`Paid + Verified + Accounting Eligible = YES`

Only commissions backed by an eligible payment can become payable.

## No new D1 migration
This package assumes the existing `affiliate_payout_items` table from v3.3.11 is already installed.

## Replace / add
Copy these files:

- functions/api/admin/affiliate-payout-candidates.js
- functions/api/admin/affiliate-payout-create.js
- functions/api/admin/affiliate-payout-list.js
- functions/api/admin/affiliate-payout-approve.js
- functions/api/admin/affiliate-payout-pay.js
- admin-affiliate-payouts.html
- admin-affiliate-payouts.js
- admin-affiliate-payouts.css

## Accounting cleanup

### Eligible commission rule
A commission is payout-eligible only when the latest payment for its order is:

- Payment status = Paid
- Verification status = Verified
- Accounting Eligible = YES
- Order payment status = Paid
- Commission status = Approved or Payable
- Commission is not already attached to another payout batch

### Payout period
The payout month is based on the payment/accounting eligibility date, not merely the original commission creation date.

Priority:
1. `accounting_eligible_at`
2. `verified_at`
3. `paid_at`
4. commission `created_at` fallback

### Three-stage payout control
1. Draft
2. Approved
3. Paid

Eligibility is rechecked:
- when candidates are loaded
- when a Draft payout is created
- again before approval
- again before recording the bank transfer

If a payment becomes ineligible before payout, the system blocks approval/payment instead of silently paying commission.

## UI
The Affiliate Monthly Payout page now shows:
- Eligible Sales count
- Total Sales
- Total Commission
- Blocked / Ineligible count
- payout batches
- warning when a batch contains an item whose eligibility changed

## Recommended Preview tests

### Test A — Eligible YJ12 affiliate sale
Use one affiliate-attributed order that is:
Paid + Verified + Accounting Eligible = YES.
Expected: commission appears in payout candidates.

### Test B — Unverified / ineligible sale
Use a commission whose order/payment is not accounting eligible.
Expected: it does NOT appear as payable and increments Blocked / Ineligible.

### Test C — Create payout
Create Draft payout.
Expected: only eligible commissions are included.

### Test D — Eligibility changes before approval
Temporarily use a test record that no longer meets accounting eligibility.
Expected: Approve is blocked.

### Test E — Mark Paid
For a valid Approved payout, enter bank-transfer date/reference.
Expected:
- payout = Paid
- linked commissions = Paid
- paid_at recorded

## Next phase after this test
Affiliate Accounting Phase 2:
- affiliate selection by name instead of ID
- monthly payout summary dashboard
- unpaid liability
- paid payout history
- payout email to affiliate
- refund / reversal workflow
- country/channel reports

Do not change the frozen v3.3.15k payment logic while testing this package.
