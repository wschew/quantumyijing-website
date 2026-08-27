# Quantum YiJing® v3.4.1g6 — Affiliate Payout Standardization

This is an additive UI/operational patch only. It does not change Affiliate commission calculation, Paid+Verified+Accounting Eligible rules, refunds/reversals, carry-forward, payout creation/approval, individual Mark Paid backend, Coach payouts, g5/g5a month-end import, DOKU, or orders/payments accounting. No D1 migration is required.

## Terminology standardized
- 1. Select Payout Period → 1. Select Affiliate Payout
- 2. Eligible Commissions → 2. Selected Affiliate Payout Detail
- Net Payout → Commission to Pay
- 3. Payout Batches → 3. Payout History
- 4. Record Bank Transfer → 4. Individual Payment Recording + INDIVIDUAL FALLBACK
- Load Eligible Commissions → Load Affiliate Payout

A four-step Affiliate Payout Workflow guide is added, and the preferred normal payment route is clearly shown as Combined Coach + Affiliate Bank Payment List → Excel → Import → Validate → Confirm & Mark Paid.

## Install
1. Copy `admin-affiliate-payouts-standardize.js` to website root.
2. Open the CURRENT stable `admin-affiliate-payouts.html`.
3. Add immediately before `</body>`:
   `<script src="/admin-affiliate-payouts-standardize.js?v=3.4.1g6" defer></script>`
4. Commit/push: `v3.4.1g6 — Affiliate payout standardization`
5. Test in Preview only.

## First test
Open `/admin-affiliate-payouts` and confirm the standardized headings, workflow guide, Commission to Pay label, Individual Payment Recording fallback label, and Month-End Bank Payments link. Refund/Reversal and Accounting Overview must remain unchanged.
