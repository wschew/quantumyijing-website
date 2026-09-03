# Quantum YiJing v3.3.14e — Receipt Date Enhancement

v3.3.14d remains the working generic-payment baseline.

This is a very small accounting refinement only.

## Change

After QY Admin clicks `Verify & Confirm`, both final emails now include:

`Receipt Date: DD Month YYYY`

The date is generated from the exact QY verification timestamp using Malaysia time
(`Asia/Kuala_Lumpur`).

### Customer QY Payment Receipt
Now shows:
- Payment Purpose
- Order Reference
- Receipt Date
- Amount Paid
- Payment Method: DOKU
- Payment Status: PAID / VERIFIED

### QY Accounting Payment Record
Now shows:
- Purpose
- Customer
- Order
- Receipt Date
- Amount
- Status: PAID / VERIFIED

## Accounting meaning

- Payment Date = when DOKU received the payment.
- Receipt Date = when QY Admin verified the payment and issued the QY receipt.

## Replace only

- `functions/api/admin/generic-payment-verify.js`

No D1 migration is required.
No generic-payment form, DOKU checkout, webhook, signature, or verification workflow is changed.
