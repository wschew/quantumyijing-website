# Quantum YiJing v3.3.11 — Affiliate Monthly Payout & Reconciliation

Built on frozen v3.3.10b stable.

Scope:
- Adds auditable `affiliate_payout_items` junction table.
- Adds admin payout workflow: Draft → Approved → Paid.
- Links commissions to exactly one payout batch.
- Records bank transfer payment date/reference.
- Marks linked commissions Paid with paid_at.
- Existing affiliate dashboard Monthly Payout History will use existing `affiliate_payouts`.

Install:
1. Run `migrate-v3.3.11.sql` in Preview D1.
2. Copy the 5 API files into `functions/api/admin/`.
3. Copy `admin-affiliate-payouts.html` and `admin-affiliate-payouts.js` to site root.
4. Deploy to Preview and test.

No DOKU changes.
No changes to frozen v3.3.10b dashboard layout.
