# Quantum YiJing v3.3.6 — Partial Payment & Balance Tracking

This version makes the Payment & Accounting module suitable for:
- courses
- memberships
- consultations
- deposits
- installment arrangements
- future products/services

It is payment-channel independent. A customer may pay different installments using
DOKU, Bank Transfer, External Platform, Cash, Manual, or another future channel.

## Core accounting model

Order Total = fixed commercial amount.

Each payment record has its own:
- This Payment Amount
- Method / Provider
- Transaction Reference
- Payment Status
- Verification Status
- Provider Fee
- Net Amount
- Bank Received
- Settlement Status

QY calculates:
- Paid to Date
- Balance Due
- Order Payment Status

A payment counts toward Paid to Date only when:
- payment record status is Paid or External; AND
- Verification is Verified.

Settlement is deliberately separate. A verified DOKU payment may reduce the order
balance while DOKU Settlement Status remains Pending.

## Automatic order status

Paid to Date = 0
→ Pending

0 < Paid to Date < Order Total
→ Partially Paid

Paid to Date >= Order Total
→ Paid

The individual payment record itself is still simply Pending / Paid / External /
Failed / Cancelled / Refunded.

## Example

Order Total RM1,400

Payment #1 — DOKU RM300 Verified
Paid to Date = RM300
Balance Due = RM1,100
Order Status = Partially Paid

Payment #2 — Bank Transfer RM500 Verified
Paid to Date = RM800
Balance Due = RM600
Order Status = Partially Paid

Payment #3 — Bank Transfer RM600 Verified
Paid to Date = RM1,400
Balance Due = RM0
Order Status = Paid

No special "DOKU partial-payment mode" is required. QY only cares about the actual
verified payment amount.

## Install — Preview only

1. Replace root `admin.html` with supplied `admin.html`.
2. Replace root `admin.js` with supplied `admin.js`.
3. In `functions/api/admin.js`, replace ONLY these 3 functions using
   `functions-api-admin-v3.3.6-patches.js`:
   - `commerceStats(context)`
   - `commerceOrders(context)`
   - `savePayment(context)`
4. No D1 migration is required for v3.3.6.
5. Commit as `v3.3.6`.
6. Push to `v2-development`.
7. Test Preview before Production.

## Recommended Preview test

Use a test order with total RM1,400.

Test A:
- Bank Transfer
- This Payment Amount = 500
- Payment Status = Paid
- Verification = Verified
Expected:
- Paid to Date = RM500
- Balance Due = RM900
- Order Status = Partially Paid

Test B:
Record second payment:
- Bank Transfer
- This Payment Amount = 900
- Paid + Verified
Expected:
- Paid to Date = RM1,400
- Balance Due = RM0
- Order Status = Paid

Test C:
Open a pending DOKU order.
Expected:
- This Payment Amount defaults to remaining Balance Due.
- Fee / Net / Bank Received remain blank while settlement is Pending.

## Important
- Do not modify DOKU notification/signature verification code.
- Do not merge to Production until Preview tests pass.
