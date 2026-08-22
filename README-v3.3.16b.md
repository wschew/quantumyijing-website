# Quantum YiJing v3.3.16b — Automatic Affiliate Payout Emails

## Important
This version adds an email audit table. Run the migration in Preview D1 before testing:

`migrate-v3.3.16b.sql`

## Replace / add
- functions/api/admin/affiliate-payout-pay.js
- functions/api/admin/affiliate-payout-list.js
- admin-affiliate-payouts.js
- admin-affiliate-payouts.html
- migrate-v3.3.16b.sql

Keep the other v3.3.16a files.

## New workflow
After an Approved affiliate payout is actually transferred through the bank:

1. Enter Payment Date.
2. Enter Bank / Payment Transaction Reference.
3. Click Record Bank Transfer.
4. Payout becomes Paid.
5. All linked commissions become Paid.
6. Affiliate automatically receives a QY-branded monthly payout email.
7. QY Accounting automatically receives a separate internal accounting email.

## Affiliate email includes
- Affiliate name and code
- Payout month
- Payout reference
- Paid date
- Bank transaction reference
- Total sales
- Total commission paid
- Breakdown of every commission:
  - order reference
  - customer
  - product
  - sale amount
  - commission rate
  - commission amount
- English + Chinese payout confirmation

## QY Accounting email includes
- Same monthly payout summary
- Full commission breakdown
- Paid date
- Bank transaction reference
- Internal PAID accounting status

## Email destination
Affiliate:
- affiliates.email

QY Accounting:
1. `AFFILIATE_ACCOUNTING_EMAIL`, if configured
2. otherwise `QY_ACCOUNTING_EMAIL`, if configured
3. otherwise `info@quantumyijing.com`

Email sender:
- `AFFILIATE_FROM_EMAIL`, if configured
- otherwise `Quantum YiJing International Academy <info@quantumyijing.com>`

## Audit
`affiliate_payout_email_log` records separately:
- Affiliate email
- QY Accounting email
- Sent / Failed
- recipient
- Resend message ID
- error
- sent time

The Monthly Payouts table displays the latest email status after a payout is Paid.

## Accounting safety
A bank payout remains Paid even if an email delivery fails. The UI will clearly show the email failure so it does not corrupt or reverse the accounting/payment record.
