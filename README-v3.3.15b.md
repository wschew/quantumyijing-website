# Quantum YiJing v3.3.15b — Synchronized Sales & Commerce Payment Workflow

No new D1 migration is required if `migrate-v3.3.15.sql` has already been applied.

## Replace / add
- functions/api/admin.js
- admin.js
- admin.html
- functions/api/admin/generic-payment-verify.js
- functions/api/admin/payment-verify.js

The other v3.3.15a files remain unchanged.

## What this fixes

### 1. Payment Records ↔ Sales & Commerce synchronization

Both admin interfaces now read and write the same `orders` + latest `payments` records.

When a payment is verified:
- Order Status is Paid
- Payment Status is Paid
- Verification is Verified
- Accounting Eligible = YES
- Gross is synchronized
- Net is synchronized using Gross minus recorded provider fee
- receipt-email status is visible in Sales & Commerce
- all Sales & Commerce sections reload after verification

Bank received remains settlement/reconciliation data and is not invented.

### 2. Delayed payment handled from Sales & Commerce

If DOKU/customer payment occurred but QY later needs to update it manually:

Sales & Commerce
→ Orders
→ Record Payment
→ existing latest payment is loaded
→ set Payment Status = Paid
→ set Verification = Verified
→ Save Payment Record

The system then uses the SAME verification endpoints as the standalone Payment Records page.

It therefore sends:
- QY-branded customer receipt
- QY internal Accounting Payment Receipt

Both include:
- Product / Course or Payment Purpose
- Order Reference
- Payment Date
- Receipt Date
- Amount
- Payment Method / Provider
- Transaction reference
- PAID / VERIFIED

### 3. No duplicate DOKU payment row when editing

`paymentId` is now carried from the dashboard.
Existing payment rows are updated when a payment already exists.
A new payment row is inserted only when there is no selected existing payment.

This is important for delayed DOKU verification and accounting corrections.

### 4. Standard rule for generic and non-generic

Generic:
- uses `/api/admin/generic-payment-verify`

Course / product / bank transfer / manual:
- uses `/api/admin/payment-verify`

Both result in:
- Verified
- Accounting Eligible = YES
- customer receipt
- QY accounting receipt
- synchronized dashboard state

## Test sequence

### Test 1 — Existing Generic Paid/Verified
Open Sales & Commerce and confirm:
- Order = Paid / Verified
- Accounting gross/net reflect the verified payment
- receipt email statuses appear

### Test 2 — Generic delayed/manual
Create a generic payment or use a Pending/Unverified test.
In Sales & Commerce:
- Record Payment
- Paid
- Verified
- Save
Expected:
- customer receipt sent
- QY accounting receipt sent
- Payment Records and Sales & Commerce show Verified / Accounting Eligible

### Test 3 — YJ12 delayed/manual
Repeat on a YJ12 order.
Expected identical post-verification accounting and receipt behavior.

Do not mark Bank Received unless settlement has actually arrived in the bank.
