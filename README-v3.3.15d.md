# v3.3.15d — Manual Verification Override & Gateway Fallback

No new D1 migration is required.

Replace:
- admin.html
- admin.js
- functions/api/admin.js
- functions/api/admin/payment-verify.js
- functions/api/admin/generic-payment-verify.js

Keep all other v3.3.15c files.

When a DOKU payment has gateway_hash_verified != 1, Sales & Commerce displays a warning and requires:
'I have independently verified this payment against DOKU / bank / payment evidence.'

Without that explicit confirmation, Verified is blocked.

With the override:
- gateway_hash_verified remains unchanged
- Verification Method = Manual
- Verification Source = QY Admin Override
- audit notes record independent payment verification
- Payment = Paid / Verified
- Accounting Eligible = YES
- customer QY receipt is sent
- QY Accounting Payment Receipt is sent
- Sales & Commerce and Payment Records stay synchronized

This is the operational fallback when DOKU notification is delayed, missing, or not hash verified.
