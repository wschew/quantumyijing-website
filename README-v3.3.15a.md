# Quantum YiJing v3.3.15a — Standardized DOKU Verification & Receipt Flow

v3.3.14e remains frozen.
v3.3.15 database migration remains the schema baseline.

NO NEW D1 MIGRATION is required for v3.3.15a.

## Replace
- functions/api/payment/doku/notify.js
- functions/api/admin/generic-payment-verify.js
- functions/api/admin/payment-verify.js
- functions/api/admin/payment-records.js
- admin-payment-records.html

## Standardized DOKU lifecycle for ALL payments

DOKU SUCCESS
→ Payment recorded as Paid / Unverified
→ QY receives `Payment received — verification required`
→ Email includes direct `Review & Verify Payment` button
→ QY Admin clicks `Verify & Confirm`
→ Payment becomes Verified
→ Accounting Eligible = YES
→ Customer receives QY final receipt
→ QY receives separate Accounting Payment Receipt

DOKU may independently send its own customer payment notification.

## Generic Payment

The proven generic workflow is preserved.
Final customer and QY receipts now explicitly show:
- Payment Purpose
- Order Reference
- Payment Date
- Receipt Date
- Amount Paid
- Payment Method
- PAID / VERIFIED

## Course / Product DOKU

The previous automatic-final-receipt path is removed.
Course/product payments now use the same manual QY verification stage as Generic Payment.

After Verify & Confirm:

Customer receives:
- Payment & Registration Confirmed
- Product / Course
- Order Reference
- Payment Date
- Receipt Date
- Amount Paid
- Payment Method / Provider
- Transaction Reference
- PAID / VERIFIED
- WhatsApp-group follow-up note where applicable

QY receives a separate:
- Accounting Payment Receipt
- Customer
- Email
- Product / Course
- Order Reference
- Payment Date
- Receipt Date
- Amount
- Payment Method / Provider
- Transaction Reference
- PAID / VERIFIED
- Accounting Eligible = YES

## Why v3.3.15a

This removes the mixed behavior where:
- Generic Payment required manual verification, but
- course/product DOKU was automatically finalized.

All DOKU payments now have one consistent QY accounting control point:
`Verify & Confirm`.

## Test order

1. Generic DOKU RM10
2. YJ12 DOKU Sandbox
3. Bank Transfer / Manual payment

For both DOKU tests, before Admin verification:
- Paid
- Unverified
- Admin Review = Pending
- QY receives verification-required notice
- no QY final customer/accounting receipt yet

After Verify & Confirm:
- Verified
- Accounting Eligible = YES
- Customer receipt with Payment Date + Receipt Date
- QY accounting receipt with Payment Date + Receipt Date
