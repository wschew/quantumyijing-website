# Quantum YiJing v3.2 — Secure SenangPay Payment Integration

## What v3.2 adds
- Secure server-side SenangPay request hash generation.
- Sandbox / Live mode controlled by Cloudflare environment settings.
- Customer redirect to SenangPay after an Academy order is created.
- Verified Return handling.
- Verified Callback handling.
- Automatic order/payment status update in D1.
- Idempotent callback/return handling.
- Gateway event audit log.
- No card or bank credentials are collected by the Academy website.
- Bank Transfer and Google Play Books accounting flows remain unchanged.

## Important security rule
NEVER put the SenangPay Secret Key in GitHub, JavaScript, HTML, screenshots, or ChatGPT.
Enter it directly in Cloudflare as an encrypted secret.

## Official integration assumptions
This package uses the senangPay Manual Integration API (Open API) with HMAC-SHA256.
In the senangPay dashboard, set the Hash Type Preference to SHA256.

Payment request hash sequence:
Secret Key + Detail + Amount + Order ID
using HMAC-SHA256 with the Secret Key as the HMAC key.

Return/callback verification sequence:
Secret Key + Status ID + Order ID + Transaction ID + Message
using HMAC-SHA256 with the Secret Key as the HMAC key.

## Installation — Phase A: code + database
1. Stay on `v2-development`.
2. Replace/add the files in this v3.2 update.
3. Run `database/migrate-v3.2.sql` in D1 ONCE.
4. Commit:
   `Add v3.2 secure SenangPay payment integration`
5. Push Origin.
6. Wait for green Cloudflare Preview deployment.

Do NOT run the YJ12 activation SQL yet.

## Phase B: Cloudflare Preview secrets
In Cloudflare Pages > your project > Settings > Variables and Secrets, configure for PREVIEW:

- `SENANGPAY_MERCHANT_ID` = your Merchant ID
- `SENANGPAY_SECRET_KEY` = your Secret Key (encrypted secret)
- `SENANGPAY_MODE` = `sandbox`

Do not send the Secret Key to ChatGPT.

Redeploy Preview after adding/changing environment values if Cloudflare requires it.

## Phase C: senangPay dashboard URLs
For Preview testing, configure the current stable Preview/branch URL:

Return URL:
`https://YOUR-PREVIEW-HOST/api/payment/senangpay/return`

Callback URL:
`https://YOUR-PREVIEW-HOST/api/payment/senangpay/callback`

Callback is server-to-server. A valid callback responds with plain `OK`.

If your random deployment hostname changes after each deployment, use Cloudflare's stable branch Preview alias if available; otherwise update these URLs for the test deployment.

## Phase D: enable YJ12 checkout
Only after A–C are complete, run:

`database/ACTIVATE-YJ12-SENANGPAY-v3.2.sql`

This turns on the Pay securely with senangPay button for YJ12.

Emergency off switch:
`database/EMERGENCY-DISABLE-YJ12-SENANGPAY.sql`

## Sandbox test
1. Open the YJ12 Preview product page.
2. Submit a new registration.
3. Confirm the order total is RM1,400 while Early Bird is active.
4. A `Pay securely with senangPay · RM 1400.00` button should appear.
5. Click it.
6. You should be redirected to the SenangPay SANDBOX host.
7. After SenangPay returns, the Academy return page should show success/pending/failure based on the verified gateway response.
8. In `/admin`, confirm:
   - Order payment status updated.
   - Payment record created/updated.
   - Verification = Verified for a successful payment.
   - Bank Received remains RM0 until settlement reconciliation.
9. In D1, verify:
   `SELECT * FROM payment_gateway_events ORDER BY id DESC LIMIT 20;`

## Before Production
After sandbox testing is complete:
1. Merge v3.2 to production only when ready.
2. Configure Production Cloudflare secrets separately.
3. Set `SENANGPAY_MODE=live` in Production.
4. Change senangPay Return URL to:
   `https://quantumyijing.com/api/payment/senangpay/return`
5. Change Callback URL to:
   `https://quantumyijing.com/api/payment/senangpay/callback`
6. Perform a small real-payment test before public advertising.

## Accounting behavior
A verified SenangPay payment immediately records:
- Gross sale
- Payment status
- Transaction reference
- Verified gateway response

It deliberately does NOT guess SenangPay fees or bank settlement.
`provider_fee`, `net_amount`, and `bank_received_amount` remain unreconciled until the actual settlement is known.
