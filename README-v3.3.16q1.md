# Quantum YiJing v3.3.16q1 — Affiliate Accounting Display + Ledger Fix

Baseline: v3.3.16p, with v3.3.16q Phase 2A accounting reporting.

## Changes
1. Standardizes Affiliate Accounting typography to the smaller QY admin scale.
2. Adds a read-only Affiliate Commission Ledger showing transaction-level history, including already-paid commissions (customer, product, invoice, sale, rate, commission, payout status/reference/date).
3. Fixes Unpaid Liability so commissions already attached to a Paid payout batch are excluded.

## Not changed
- Customer payment logic
- Payment verification / accounting eligibility logic
- Affiliate attribution
- Commission creation/calculation
- Payout candidate/create/approve/pay endpoints
- Payout email logic
- Affiliate application logic
- Admin navigation

## Install
Replace only:
- admin-affiliate-payouts.html
- admin-affiliate-payouts.js
- admin-affiliate-payouts.css
- functions/api/admin/affiliate-accounting-summary.js

Keep functions/api/admin/affiliate-accounting-affiliates.js from v3.3.16q unchanged.
No D1 migration is required.

## Expected test
After Preview deploy and entering Admin Token:
- Unpaid Liability should no longer include a commission already in a Paid payout.
- The earlier RM1,400 YJ12 transaction should appear in Affiliate Commission Ledger if its affiliate commission exists and the customer payment is Paid + Verified + Accounting Eligible.
