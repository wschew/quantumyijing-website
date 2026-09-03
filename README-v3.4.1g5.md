Quantum YiJing® v3.4.1g5 — Combined Month-End Bank Payment Import + Validation + Posting

PURPOSE
Extends the existing /admin-month-end-bank-payments page.

Existing read-only workflow remains unchanged:
Approved Coach/Affiliate payouts → Load Bank Payment List → Export Combined Excel.

v3.4.1g5 adds:
Accounts completes bank transfers → fills Payment Date / Payment Reference in the same Excel → Admin uploads → Validate → Confirm & Mark Paid.

IMPORTANT SCOPE
This patch is ADDITIVE. It does NOT change commission calculation, approval logic, existing combined export, v3.4.1g4 individual Coach Mark Paid, existing Affiliate payout logic, orders/payments accounting, or DOKU.

NO D1 migration is required.

FILES
1. functions/api/admin/month-end-bank-payments-import.js
2. admin-month-end-bank-payments-import.js
3. MONTH-END-IMPORT-PATCH.html

INSTALLATION
A. Copy functions/api/admin/month-end-bank-payments-import.js into the same path in the project.
B. Copy admin-month-end-bank-payments-import.js to website root.
C. Open the CURRENT stable admin-month-end-bank-payments.html. Do NOT replace the entire page with an older copy.
D. Paste the section in MONTH-END-IMPORT-PATCH.html inside <main>, immediately AFTER the current combined bank-payment table.
E. Add the two script tags from the patch before </body> (only once).

EXCEL FIELDS USED
Type; Code; Payee Name; Currency; Net Payable; Payout Period; Payout Ref; Email; Payment Reference; Payment Date; Remarks.
Aliases such as Coach Code / Affiliate Code, Net Amount Payable, and Payout Reference are accepted.
Payment Date accepts YYYY-MM-DD, DD/MM/YYYY, or an Excel date cell.

SAFEGUARDS
- Type must resolve to Coach or Affiliate.
- Payout reference must exist in the corresponding D1 payout table.
- Excel amount must exactly match D1 total_commission to cents.
- Currency and payout period must match D1.
- Payment Date and Payment Reference are required.
- Only Approved payouts can be newly posted.
- Already-Paid rows are skipped safely.
- Duplicate rows in the uploaded file are rejected.
- Final preflight re-validates all rows before any new posting.
- If any row has a validation error, no new rows are posted.
- Database updates guard with WHERE status='Approved'.

EMAIL
Coach: same bilingual Coach + QY notification pattern proven in v3.4.1g4.
Affiliate: same bilingual Affiliate commission-paid notification pattern, and linked affiliate_commissions are marked Paid.
Email failure never reverses a valid accounting posting; failures are reported separately.

TEST PLAN — CURRENT RM9
1. Keep RM9 Coach payout Approved.
2. Open /admin-month-end-bank-payments and load August 2026.
3. Export Combined Excel.
4. Fill Payment Date = 2026-08-27.
5. Fill Payment Reference = TEST-BANK-MONTHEND-20260827-005.
6. Save Excel.
7. Upload under Import Completed Bank Payment File.
8. Validate File: expect 1 Ready, 0 Errors.
9. Confirm & Mark Paid.
10. Expect RM9 Paid, payment date/reference stored, Coach email received, QY email received.
11. Reload approved list: RM9 disappears.
12. Upload SAME Excel again: expect Already Paid · Skipped and no duplicate email.
13. After Coach passes, repeat with one Approved test Affiliate payout.

Do not freeze g5 until both Coach and Affiliate have passed through the combined import path.
