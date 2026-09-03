# Quantum YiJing v3.3.16w1 — Affiliate Bank Payment List (Affiliate Hub placement)

This is a navigation-placement correction to v3.3.16w. The bank payment/export feature remains unchanged.

## What changed
- Removed the direct **Bank Payment List** tab from the main `/admin` navigation.
- Kept **Bank Payment List** inside the **Affiliate Management Hub**, reached through `/admin` → **Affiliates**.
- No accounting, commission, refund, reversal, carry-forward, payout, attribution, or payment logic is changed.

## Install
Copy these files into the same paths in the website repository:

- `admin.html` → website root
- `admin-affiliate-hub.html` → website root
- `admin-affiliate-bank-payments.html` → website root
- `admin-affiliate-bank-payments.js` → website root
- `functions/api/admin/affiliate-bank-payment-list.js` → same Functions path

No SQL migration is required.

## Correct navigation
1. Open `/admin`.
2. Click **Affiliates**.
3. In the Affiliate Management Hub, click **Bank Payment List**.
4. Select the payout month and load/export the list.

## Accounting safeguard
`Net Amount Payable` continues to come directly from the approved `affiliate_payouts.total_commission`. Exporting the workbook does not mark a payout as Paid.
