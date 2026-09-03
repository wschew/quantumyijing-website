# Quantum YiJing v3.3.16s2 — Record Payment Auto-fill

Focused UI safety patch for Affiliate Accounting.

## Change
- Approved payout rows now show **Record Payment**.
- Clicking it automatically supplies the correct internal payout ID to Section 4.
- Section 4 displays the human-readable payout reference and amount as read-only confirmation.
- Manual Payout ID entry is removed.

## Unchanged
No D1 migration. No payment, commission, attribution, reversal, carry-forward, payout approval, payout payment, affiliate application, or navigation rules are changed.

## Install
Replace only:
- `admin-affiliate-payouts.html`
- `admin-affiliate-payouts.js`

## Test
For the existing Approved RM60 payout, click **Record Payment**. Confirm Section 4 displays the correct `AFFPAY-...` reference and RM60 amount. Enter payment date/reference only after confirming the selected payout.
