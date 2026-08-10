# Quantum YiJing v3.2.1 — DOKU Migration Patch

This patch replaces the v3.2 website-side senangPay checkout route with a DOKU Checkout route while preserving Bank Transfer, Google Play Books, accounting, FX display and existing D1 records.

## IMPORTANT — safe rollout
The DOKU Malaysia account is migrated from senangPay. Client ID and Secret Key are already stored in Cloudflare Preview as DOKU_CLIENT_ID and DOKU_SECRET_KEY.

Do NOT make a real payment yet. The Malaysia-specific Checkout endpoint / notification payload must be confirmed against DOKU Malaysia before public activation. v3.2.1 therefore requires DOKU_CHECKOUT_ENDPOINT; if it is absent, checkout fails closed with a configuration message rather than sending money to an assumed endpoint.

## Install on v2-development
1. Back up / commit your current v3.2 branch.
2. Delete the old folder: functions/api/payment/senangpay/
3. Copy this patch folder `functions/api/payment/doku/` to your repository as `functions/api/payment/doku/`.
4. Replace repository `functions/product/[slug].js` with `functions/product-slug-v3.2.1.js` from this package (rename it to `[slug].js`).
5. In D1 run `database/migrate-v3.2.1.sql` ONCE.
6. Do NOT add or expose any secret in GitHub.
7. Commit: `Migrate v3.2 payment integration to DOKU v3.2.1`
8. Push Origin and wait for green Cloudflare Preview deployment.

## Cloudflare Preview
Already present:
- DOKU_CLIENT_ID = plaintext
- DOKU_SECRET_KEY = encrypted Secret

Still required before checkout testing:
- DOKU_CHECKOUT_ENDPOINT = DOKU Malaysia Checkout POST endpoint confirmed by DOKU Malaysia support/documentation.

Do not guess this value from the Indonesia DOKU documentation.

## DOKU notification URL
After DOKU Malaysia confirms the notification specification, the website endpoint prepared by this patch is:
https://YOUR-STABLE-PREVIEW-HOST/api/payment/doku/notify

The return/result endpoint is generated automatically per order:
/api/payment/doku/return?order=ORDER_REFERENCE

## Safety behavior
- Browser return never marks an order Paid.
- A server notification must pass HMAC verification before it can affect accounting.
- Unknown notification status shapes are logged but do not mark an order Paid.
- Provider fees / bank settlement remain unreconciled until actual settlement data is known.
- Emergency switch: run database/EMERGENCY-DISABLE-DOKU-v3.2.1.sql.
