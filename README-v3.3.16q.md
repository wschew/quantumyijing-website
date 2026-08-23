# Quantum YiJing v3.3.16q — Affiliate Accounting Cleanup Phase 2A

Baseline: v3.3.16p is treated as frozen/stable.

## Scope of this package
This package continues only the remaining Affiliate Accounting cleanup.

### Added
1. Affiliate selector by **name / affiliate code / email** on the payout page.
2. Read-only Affiliate Accounting Overview:
   - Unpaid affiliate commission liability
   - Draft payout batches
   - Approved payout batches
   - Total paid affiliate commission
3. Monthly payout summary.
4. Paid payout history.
5. Commission report by sales channel.
6. Affiliate payout report by country/nationality when the existing affiliates table contains one of those fields.

## Critical freeze rule
This package DOES NOT replace or modify:
- payment code
- payment verification
- accounting-eligibility calculation
- affiliate attribution
- affiliate application
- commission creation/rate logic
- payout candidate logic
- payout creation logic
- payout approval logic
- payout payment logic
- automatic payout email logic
- main admin navigation
- Affiliate Hub navigation

The existing v3.3.16p routes remain unchanged.

## Files to copy
Replace:
- admin-affiliate-payouts.html
- admin-affiliate-payouts.js
- admin-affiliate-payouts.css

Add:
- functions/api/admin/affiliate-accounting-affiliates.js
- functions/api/admin/affiliate-accounting-summary.js

## No SQL migration
No D1 migration is required.

## Preview test sequence
1. Deploy to Preview only.
2. Open `/admin-affiliate-hub.html` → Affiliate Payouts.
3. Enter Admin Token.
4. Confirm Affiliate dropdown shows names, codes and emails.
5. Click Refresh Accounting.
6. Confirm summary loads without changing any records.
7. Select an affiliate and month; confirm existing Eligible Commissions results are unchanged.
8. Do NOT create/approve/pay a new payout merely to test the dashboard unless you already planned to test that existing frozen workflow.
9. Compare existing paid payout rows with Paid Payout History.
10. Confirm country report either loads existing country/nationality values or safely shows that the field is unavailable.

## Deferred to later phase
Refund / reversal workflow is intentionally deferred because it can affect payment/commission state transitions and should be designed and tested separately from the frozen baseline.
