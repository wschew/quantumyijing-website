# Quantum YiJing v3.3.16i — Product / Course Affiliate Commission Creation Fix

Install after v3.3.16h.

## No D1 migration required

## Replace / add
- `functions/api/admin/payment-verify.js`
- `functions/api/admin/affiliate-product-commission-repair.js`
- `admin-affiliate-payouts.html`
- `admin-affiliate-payouts.js`
- `admin-affiliate-payouts.css`

## What this fixes
For normal affiliate products/courses such as YJ12:

1. Affiliate code stays attached to the order.
2. Payment is recorded Paid.
3. QY verifies payment.
4. Existing stable customer + QY receipt routine runs unchanged.
5. A non-blocking post-hook creates the product affiliate commission from the product master commission configuration.
6. Commission is created as `Approved` and becomes eligible for monthly payout.

The stable generic affiliate payment flow is not changed.

## Commission source
Normal products/courses use their own `products` configuration:
- `affiliate_enabled`
- `commission_type`
- `commission_value`

For YJ12 at RM1,400 and 20%, expected commission = RM280.00.

## Repair existing test75 without another DOKU payment
Open `/admin-affiliate-payouts` and use:
**Repair Missing Product / Course Commission**

Order reference:
`QY-20260822-C0EE8A`

This only creates the missing affiliate commission. It does not modify payment status and does not resend receipt emails.

## Safety / idempotency
- Existing commission rows are detected and not duplicated.
- Affiliate commission failure does not roll back a verified payment or receipt emails.
- Only Approved affiliates and affiliate-enabled products create commissions.
