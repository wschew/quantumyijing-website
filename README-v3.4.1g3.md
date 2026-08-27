# Quantum YiJing v3.4.1g3 — Coach Payout Recovery

Preview D1 recovery patch for the accidental deletion of:

- coach_payouts
- coach_payout_items

Before running:
1. Create a fresh D1 Time Travel bookmark in Preview.
2. Run migrate-v3.4.1g3-coach-payout-recovery.sql on Preview D1 only.

This patch:
- recreates both Coach payout tables;
- intentionally does NOT restore UNIQUE(coach_id,payout_period);
- keeps payout_reference unique;
- keeps UNIQUE(source_type,source_id,source_period) on payout items;
- restores the known MYR 5.00 Paid COACH-TEST-01 payout and its payout item.

After SQL succeeds:
1. Confirm the schema does not contain UNIQUE(coach_id,payout_period).
2. Confirm the MYR 5.00 payout is present and Paid.
3. Refresh /admin-coach-payouts.
4. Load QY-C01 / August 2026.
5. Confirm COACH-TEST-02 remains eligible for MYR 6.00.
6. Create Draft Payout.
7. Continue Approve → bank list → Mark Paid → notification testing.

Do not run this recovery SQL on Production.
