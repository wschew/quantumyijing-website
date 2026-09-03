# Quantum YiJing v3.3.16h — Generic Affiliate Product Link Fix

Install after v3.3.16g.

No D1 migration is required.

## Fix 1 — Affiliate portal GEN-AFF link
The `Generic Affiliate Payment` product now generates a real affiliate generic-payment URL:

`/generic-payment.html?aff=QY-Axxxx&purpose=General+Affiliate+Payment`

It no longer points to the non-existent internal landing page `/lp/generic-affiliate-payment-internal.html`.

The product type is displayed as `Generic Payment` instead of `Course`.

## Fix 2 — Real affiliate generic payments earn commission
The stable verification routine remains unchanged. After a generic payment is Paid + Verified, the affiliate post-hook now creates commission for **any approved affiliate-attributed generic payment**, not only Preview QA (`affiliate_test=1`) transactions.

Commission rate remains controlled by QY through `/admin-affiliate-payouts`. Existing historical commission rows retain their recorded rate.

## Preview QA link remains separate
The `Preview QA only — RM10 Generic Affiliate Test` link is unchanged and remains for testing only.

## Replace
- `affiliate-dashboard.html`
- `affiliate-dashboard.js`
- `functions/api/admin/generic-payment-verify.js`

Keep the v3.3.16g `admin.html` already installed.
