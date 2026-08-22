# Quantum YiJing v3.3.16c — Affiliate Link Routing + RM10 Preview QA Payment

This is the patch AFTER v3.3.16b.
Do not reinstall/rename it as v3.3.16b; v3.3.16b remains the installed payout-email baseline.

## Purpose
1. Fix the obsolete YJ12 affiliate product URL:
   `/lp/yj12-yijing-science-of-prediction.html`
   -> `/product/yj12-yijing-science-of-prediction`
2. Add a Preview-only RM10 generic affiliate QA payment link to the private Affiliate Portal.
3. Carry `aff=QY-Axxxx` into the generic order.
4. After the generic payment is Paid + Verified, create one 20% QA commission for that affiliate.
5. This QA commission logic is accepted only when the payment was created on a `.pages.dev` Preview host.

## Migration
Run `migrate-v3.3.16c.sql` on PREVIEW D1 before testing.

## Replace / add
- affiliate-dashboard.html
- affiliate-dashboard.js
- generic-payment.html
- functions/api/payment/generic/create.js
- functions/api/admin/generic-payment-verify.js
- migrate-v3.3.16c.sql

Keep all other v3.3.16b files.

## Test flow
Affiliate Portal (QY-A0002)
-> Copy RM10 Affiliate QA Test Link
-> open in Incognito
-> generic payment page visibly shows QY-A0002
-> pay RM10 through DOKU
-> verify through frozen Sales & Commerce payment workflow
-> affiliate_commissions gets one Approved RM2.00 QA commission
-> Affiliate Portal Sales & Commission Statement should show the transaction
-> Affiliate Monthly Payout page should show Eligible Sales 1 / Sales RM10 / Commission RM2
-> then test Draft -> Approve -> Bank Transfer -> automatic Affiliate + QY Accounting payout emails

## Production safety
The `affiliate_test=1` commission-test mode is rejected unless the payment creation request is running on a `.pages.dev` hostname.
Generic payments on the production custom domain do NOT receive this QA commission behavior.
