# Quantum YiJing v3.3.14a — Generic Payment Email Hotfix + Admin Quick Access

## Why this hotfix is needed

The v3.3.14 ZIP accidentally did not include `functions/api/payment/doku/notify.js`.
Therefore the generic-payment-specific payment-purpose email integration was not deployed from that package.

This hotfix restores the proven payment-notification file and adds generic-payment support.

## Replace / add

- functions/api/payment/doku/notify.js
- functions/api/admin/payment-records.js
- admin-payment-records.html
- admin/index.html

No D1 migration is required beyond the already-run v3.3.14 migration.

## After deployment

Admin quick access:
- `/admin/`

Payment records:
- `/admin-payment-records.html`

Existing:
- `/admin-course-whatsapp.html`
- `/generic-payment.html`

## Generic payment confirmation

The notification handler now recognizes `generic_payment_requests`.
For a generic payment, its `payment_purpose` is used in QY/customer payment emails instead of a course/product name.

## Important retry note

If the test order has ALREADY become `Paid`, DOKU retry protection will not resend the payment emails.
For testing this hotfix, create a NEW generic payment after deployment.

## D1 SQL check for the existing RM10 test

Use:

SELECT
  o.id,
  o.order_reference,
  o.customer_name,
  o.customer_email,
  o.total,
  o.currency,
  o.payment_status,
  o.payment_provider,
  o.external_order_id,
  g.payment_purpose,
  g.customer_note,
  p.id AS payment_id,
  p.status AS payment_record_status,
  p.verification_status,
  p.provider_transaction_id,
  p.paid_at
FROM orders o
LEFT JOIN generic_payment_requests g ON g.order_id=o.id
LEFT JOIN payments p ON p.id=(
  SELECT p2.id FROM payments p2 WHERE p2.order_id=o.id ORDER BY p2.id DESC LIMIT 1
)
WHERE o.order_reference='QY-20260819-D0099E';
