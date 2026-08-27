# Quantum YiJing v3.4.1g1 — Supplementary Coach Payout Patch

Purpose: permit a new payout batch in the same month after an earlier batch is already Paid or Cancelled, while still preventing two open Draft/Approved batches and preventing duplicate payout items.

Deployment order:
1. Run `migrate-v3.4.1g1-coach-supplementary-payouts.sql` on Preview D1.
2. Replace `functions/api/admin/coach-payouts.js`.
3. Deploy Preview.
4. Test QY-C01 / August 2026.

Expected test:
- Existing MYR 5 Paid payout remains unchanged.
- COACH-TEST-02 remains eligible at MYR 6.
- Create Draft succeeds and generates a second August payout reference.
- Approve the MYR 6 payout, but do not Mark Paid yet.
- Monthly Bank Payment List should then show the MYR 6 Approved Coach payout.
