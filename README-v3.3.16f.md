# Quantum YiJing v3.3.16f — Configurable Generic Affiliate Commission

Install after v3.3.16e.

## Important
Run `migrate-v3.3.16f.sql` on Preview D1 before testing.

## Replace / add
- migrate-v3.3.16f.sql
- functions/api/admin/generic-payment-verify.js
- functions/api/admin/affiliate-accounting-settings.js
- functions/api/admin/affiliate-generic-commission-repair.js
- admin-affiliate-payouts.html
- admin-affiliate-payouts.js
- admin-affiliate-payouts.css

Keep the v3.3.16e stable payment/receipt files.

## Core design
The stable generic payment verification + customer receipt + QY accounting receipt routine is NOT changed.

Affiliate commission remains a non-blocking post-hook.

## QY-controlled generic commission rate
A new QY setting controls:
- Enabled / Disabled
- Generic Payment Commission Rate (%)

Default after migration: 20.00%.

QY can change the rate at any time from:
`/admin-affiliate-payouts`

The rate applies when a NEW generic affiliate commission is created.
Existing commission rows keep their recorded historical rate.

Example:
- setting = 15%
- verified affiliate generic payment = RM100
- commission created = RM15

## Required product_id
`affiliate_commissions.product_id` is NOT NULL.
v3.3.16f creates a legitimate internal product:
- SKU: GEN-AFF
- Name: Generic Affiliate Payment
- Status: Inactive
- Public selling price: RM0
This product exists only for clean accounting linkage and is not meant for public sale.

## Repair test73
After migration:
1. Open `/admin-affiliate-payouts`
2. Enter Admin Token
3. Confirm Generic Payment Affiliate Commission is Enabled
4. Set the rate you want for the test (e.g. 20%)
5. Save Commission Setting
6. Under Repair Missing Generic Commission enter:
   `QY-20260822-840C66`
7. Click Create Missing Commission
8. This will NOT resend receipts or alter payment records.
9. Reload Test Affiliate2 / QY-A0002 Affiliate Detail.
10. Commission Ledger should show test73.
11. At RM15 and 20%, expected commission = RM3.00.

## Accounting rule
The repair endpoint only works when the underlying generic payment is:
Paid + Verified + Accounting Eligible = YES
and has an Approved affiliate attribution.
