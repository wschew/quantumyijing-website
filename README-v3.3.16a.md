# Quantum YiJing v3.3.16a — Affiliate Payout Workflow Cleanup

No D1 migration is required.

Replace/add:
- functions/api/admin/affiliate-payout-affiliates.js
- admin-affiliate-payouts.html
- admin-affiliate-payouts.js
- admin-affiliate-payouts.css

Key changes:
1. Affiliate ID manual entry is replaced by a dropdown showing Affiliate Name + Affiliate Code.
2. Create Draft Payout is renamed Create Monthly Payout Draft.
3. Payout Batches is renamed Monthly Payouts.
4. The separate Record Bank Transfer section is removed.
5. An Approved payout now shows Payment Date + Bank/Payment Reference + Record Bank Transfer directly on the same payout row.
6. Users no longer type a Payout ID manually.

Workflow:
Select Affiliate + Month
→ Load Eligible Commissions
→ Review totals
→ Create Monthly Payout Draft
→ Approve
→ actually pay affiliate by bank transfer
→ enter bank transfer date + bank/payment reference on the same Approved payout row
→ Record Bank Transfer
→ payout becomes Paid

Relationship:
- Affiliate ID identifies the affiliate.
- Payout ID identifies one monthly payout record internally.
- Each payout record stores affiliate_id, so they are tied together automatically.
