# Quantum YiJing v3.3.12c — Payment Notification Completion

Replace only:

functions/api/payment/doku/notify.js

No D1 migration required.

## What this version completes

After the FIRST verified DOKU SUCCESS notification:

1. The order is marked Paid using the existing markPaid() logic.
2. QY sends the customer a branded:
   "Payment & Registration Confirmed" email.
3. QY sends info@quantumyijing.com an internal:
   "Payment Received" notification.

## Customer email includes

- Product / Course
- Order Reference
- Amount Paid
- Payment Method: DOKU
- Payment Status: PAID

DOKU may still send its own invoice/receipt separately.

## Internal QY email includes

- Product / Course
- Customer name
- Email
- Phone
- Order Reference
- Amount
- Provider
- DOKU Transaction ID
- Payment channel
- Gateway state
- Status: PAID / VERIFIED

## Duplicate protection

DOKU may retry notifications.
Emails are sent only when the local order was not already Paid before the SUCCESS notification.

## Cleanup

Removes the temporary DOKU raw-body/header/signature diagnostic logging.

## Signature logic

The proven signature formula remains unchanged:
- Client ID
- Request Timestamp
- Request Target Path
- Digest

Values only, joined with newline.
Request-Id is NOT included.

## Preview test

1. Complete a fresh DOKU Sandbox payment.
2. Confirm order becomes Paid.
3. Confirm customer receives:
   Payment & Registration Confirmed.
4. Confirm info@quantumyijing.com receives:
   Payment Received.
5. Confirm payment_gateway_events still records hash_verified = 1.
