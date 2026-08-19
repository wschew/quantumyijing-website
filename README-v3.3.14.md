# Quantum YiJing v3.3.14 — Generic DOKU Payment Form

Purpose:
Provide a public payment link for token payments, contributions, deposits,
balance payments, or other approved payments that are not tied to a course
or product purchase.

Public URL after deployment:
`/generic-payment.html`

Customer enters:
- Full name
- Email
- WhatsApp / phone
- MYR amount
- Payment purpose
- Optional note

The page creates an internal order and then redirects the customer to DOKU.

## D1 migration

Run:
`migrate-v3.3.14.sql`

## Add / replace

- generic-payment.html
- functions/api/payment/generic/create.js
- functions/api/payment/doku/generic-start.js
- functions/api/payment/doku/notify.js  (included so generic payments use the purpose in confirmation emails)

## Accounting behaviour

Generic payments still create:
- orders
- payments
- payment_gateway_events

Therefore the existing accounting/payment reconciliation framework continues to work.

No enquiry record or enquiry email is created.

After successful verified payment:
- customer receives QY payment confirmation
- QY receives internal Payment Received notification
- DOKU may separately send its invoice/receipt

## Security

- Payment amount is validated server-side.
- Only MYR is accepted.
- Range: MYR 1.00 to MYR 100,000.00.
- DOKU credentials are never exposed to the browser.
- Card/banking/e-wallet credentials remain on DOKU.
