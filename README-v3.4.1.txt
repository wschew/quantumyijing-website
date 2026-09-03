Quantum YiJing® v3.4.1 — Coach Portal + Month-End Payout Workflow

BASELINE
- v3.4.0c is frozen and remains the Coach Management / Course & Service Assignment baseline.
- v3.4.1 builds on it. It does not intentionally change the tested v3.4.0c seasonal-service assignment behaviour.

NEW IN v3.4.1
1. Coach Portal upgraded
   - live course participants + eligible course revenue
   - potential course commission
   - final/locked course commission after closing date
   - ongoing service assignments and potential commission
   - approved-for-payment and paid totals
   - monthly payout history

2. Coach Payouts enabled in /admin-coach-hub
   - choose Approved coach + payout month
   - load eligible course/service commission
   - create Draft payout snapshot
   - approve only when coach bank details are complete
   - Mark Paid requires payment date + bank/payment reference
   - paid history is preserved

3. Coach bank-payment Excel export
   - Approved payouts only
   - coach/bank/account/net amount/payout reference/email
   - Payment Reference / Payment Date / Remarks columns are intentionally blank for the accounts team to fill after bank transfer

4. Accounting safeguards
   - finalized course commission is sourced from coach_course_assignments.final_commission
   - a finalized course is included only in its payout_eligible_month
   - service commission is calculated month-by-month from verified/reconciled Paid/External payments within that assignment's effective rate period
   - payout items are snapshotted into coach_payout_items, preventing the same source/month from being paid twice
   - Affiliate accounting/payment tables are not modified

SERVICE FIXED-FEE RULE IN THIS VERSION
- The existing v3.4.0c service rule is preserved: percentage commission + Additional Fixed Fee.
- For an active service assignment intersecting the selected payout month, the fixed fee is included once in that month's payout snapshot.
- If you later prefer the service fixed fee to apply only when at least one paid case exists, change that as a separate intentional rule patch rather than silently changing v3.4.0c semantics.

INSTALL ON PREVIEW
A. Run once on Preview D1:
   migrate-v3.4.1-coach-payouts.sql

B. Copy/replace these files preserving folders:
   admin-coach-hub.html
   admin-coach-payouts.html
   admin-coach-payouts.js
   coach-portal.html
   coach-portal.js
   functions/api/admin/coach-payouts.js
   functions/api/admin/coach-bank-payment-list.js
   functions/api/coach/me.js

The package also includes the current stable coach admin/API files for reference; you do not need to replace them if your v3.4.0c Preview is already working.

TEST SEQUENCE
1. Confirm /admin-coaches still shows existing v3.4.0c data unchanged.
2. Open /coach-portal and confirm courses + services load.
3. Use a month containing a finalized course or service assignment in /admin-coach-payouts.
4. Create Draft.
5. Approve.
6. Load Approved Bank List and export .xlsx.
7. After simulated bank transfer, Mark Paid with date/reference.
8. Re-open Coach Portal and confirm payout status/history and Commission Paid.

IMPORTANT
Do all tests on Preview D1 first. Do not merge to main/Production until the full v3.4.1 payout cycle is verified.
