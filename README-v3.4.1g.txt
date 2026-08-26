Quantum YiJing® v3.4.1g — Coach Payment Notice + Combined Month-End Bank Export

BASE / SAFETY
- Additive patch for the current working v3.4.1f environment.
- No D1 migration.
- Does NOT change v3.3.7 customer payment/accounting behaviour.
- Does NOT change coach commission calculation, closing, Draft creation or Approve logic.
- Existing Affiliate payout/payment logic is not replaced.

FILES
1) functions/api/admin/coach-payouts.js
   REPLACE the current file.
   Adds Coach + QY Resend notices only after a successful Approved -> Paid transition.
   If email fails, the payout remains correctly recorded Paid and the API returns email_warning.

2) functions/api/admin/month-end-bank-payments.js
   ADD this new read-only API.
   Reads only status='Approved' from coach_payouts and affiliate_payouts.

3) admin-month-end-bank-payments.html
   ADD to website root.

4) admin-month-end-bank-payments.js
   ADD to website root.
   Creates one self-contained .xlsx file in the browser. No external Excel library/CDN.
   Columns are auto-sized from actual contents (with a sensible maximum), headings/text wrap,
   top row is frozen, AutoFilter is enabled, and Net Payable is numeric.

5) ADMIN-EASY-LINK-PATCH.html
   Copy only this card/link into the existing /admin/ Easy Links grid.
   Do NOT replace the existing /admin/index.html with an older file.

NEW EASY LINK
/admin-month-end-bank-payments.html

COMBINED EXCEL COLUMNS
No. | Type | Code | Payee Name | Bank Name | Bank Account Name | Bank Account Number |
Country | Currency | Net Payable | Payout Period | Payout Reference | Email |
Payment Reference | Payment Date | Remarks

Type is explicitly Coach or Affiliate.
Coach rows appear first, Affiliate rows second.

COACH PAYMENT EMAIL
When an Approved Coach payout is marked Paid:
- Coach receives bilingual EN/ZH payment notice.
- QY receives internal payment notice.
- Uses RESEND_API_KEY.
- Default From: Quantum YiJing International Academy <info@quantumyijing.com>
- Default QY recipient: info@quantumyijing.com
Optional env overrides:
  COACH_FROM_EMAIL
  COACH_PAYOUT_NOTIFY_EMAIL

IMPORTANT TEST NOTE
The previous RM5 Coach payout is already Paid and cannot be reused because the stable guard correctly
allows Mark Paid only from Approved. Create a NEW small test payout to test the new email notices.

TEST ORDER
A. Deploy all files + add Easy Link.
B. Open /admin-month-end-bank-payments.html.
C. Select a month containing Approved Coach and/or Affiliate payouts and Load Bank Payment List.
D. Confirm Type column identifies Coach/Affiliate and totals are correct.
E. Export Combined Excel and confirm columns fit/wrap automatically.
F. Create a NEW Coach test payout -> Draft -> Approve.
G. Confirm it appears in the combined list before payment.
H. Mark Paid from the existing Coach Payout page with payment date/reference.
I. Confirm Coach receives email and QY receives email.
J. Reload combined list: the Paid Coach row must disappear because only Approved rows are exported.

FREEZE ONLY AFTER A-J PASS.
