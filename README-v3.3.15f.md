# Quantum YiJing v3.3.15f — Gross-Only Verification + Deferred Settlement

## Baseline
v3.3.15d is FROZEN as the stable verification baseline.

v3.3.15f is built directly from v3.3.15d.
It does NOT use the broken v3.3.15e verification UI changes.

## No D1 migration
No new D1 migration is required.

## Replace only
- admin.html
- admin.js
- functions/api/admin.js

Keep all other v3.3.15d files.

## Verification form
During payment verification, Admin confirms:
- Payment Method / Provider
- Transaction Reference
- Payment Status
- Verification
- Gross Sale
- Payment Date
- Receipt Issuer
- Notes
- Manual hash override, where required

The form no longer asks Admin to manually key:
- Provider / Platform Fee
- Net Amount
- Amount Received in Bank

## Accounting meaning
Gross Sale = amount paid by the customer.

Provider Fee / Net Settlement / Bank Received are settlement accounting values.
They will be reconciled later from DOKU / platform settlement reports.

## Safety
Existing settlement values are preserved when a payment is verified.
Verification does not overwrite provider fee / net / bank received with zero.

## Dashboard display
Before settlement reconciliation:
- Gross = actual customer payment amount
- Fees = Pending
- Net = Pending
- Bank received = Pending

After a future settlement reconciliation marks the payment Settled/Reconciled:
the actual fee/net/bank values are displayed.

## Proven v3.3.15d verification path remains unchanged
- Record Payment button remains functional
- email deep-link remains functional
- manual gateway-hash override remains functional
- customer receipt remains functional
- QY accounting receipt remains functional
- Sales & Commerce and Payment Records synchronization remains functional
