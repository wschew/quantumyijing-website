# Quantum YiJing v3.3.15e — Deferred Provider Settlement Reconciliation

No new D1 migration is required.

Replace:
- admin.html
- admin.js
- functions/api/admin.js

Keep all other v3.3.15d files.

## New accounting rule

During customer-payment verification, QY Admin confirms only:

- Payment Status
- Verification
- Gross Sale
- Transaction / Settlement Reference
- Payment Date
- Receipt Issuer
- Notes
- Manual Override (only when gateway hash is unavailable)

The following are NOT manually keyed during verification:

- Provider / Platform Fee
- Net Amount
- Amount Received in Bank

These values are deferred to DOKU / external-platform settlement reconciliation.

## Why

DOKU is expected to provide periodic transaction / settlement records showing:
- transaction amount
- provider fee
- net settlement / payout
- settlement reference/date

Using that report later is more accurate and reduces human error.

## Meaning of Gross Sale

`Gross Sale` = the amount paid by the customer through the platform.

## Verification flow

Payment successful
-> QY Admin verifies payment
-> Gross Sale confirmed
-> payment becomes Verified
-> receipts sent
-> Accounting Eligible = YES

Settlement accounting happens later:
DOKU settlement report
-> match transaction/order
-> import or reconcile fee
-> update net amount
-> update bank received
-> update settlement status

## Important

Existing fee / net / bank values are preserved when verification is edited.
The verification form no longer overwrites them with zero.

This prepares the system for a future weekly DOKU settlement import/reconciliation module.
