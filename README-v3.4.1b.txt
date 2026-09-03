Quantum YiJing® Academy Operating System
v3.4.1b — Coach Current-Month Potential + Standard Header Fix
Date: 2026-08-25

PURPOSE
This is a focused patch on top of v3.4.1a.
No SQL migration is required.

CHANGES
1. /admin-coach-payouts now uses the standard Quantum YiJing® admin header:
   - Quantum YiJing® logo and brand on the left
   - COACH OPERATIONS · v3.4.1b
   - Main Admin and Coach Hub navigation on the right

2. All Coaches Commission Overview now uses CURRENT-MONTH VERIFIED COLLECTIONS
   for course potential commission, regardless of the future course conduct date.
   Example: if YJ12 is conducted in September but verified student payments were
   received in August, those August collections contribute to August Potential Commission.

3. The Coach Portal summary card uses the same current-month collection logic.
   The detailed Course Coaching table still shows the complete/live course totals.

4. The All Coaches Overview Potential Commission card now displays the selected month
   in its label (for example: Potential Commission · August 2026).

ACCOUNTING RULES PRESERVED
- Potential Commission is a live management/motivation view.
- Approved for Payment and Paid are NOT changed by this patch.
- Month-end payout eligibility still follows the existing closing/finalization workflow.
- Service commission remains based on verified paid service cases in the selected month.
- A service fixed fee is not counted when there is no paid case/revenue for that month.

COURSE CURRENT-MONTH RULE
- Course revenue = verified Paid/External payment gross amounts received in selected month.
- Course participants = distinct paid orders in selected month.
- Course percentage commission = selected-month course revenue × assigned rate.
- Course fixed fee is included only in the month containing the first verified payment
  for that course product, preventing the same fixed fee from being repeated every month.

FILES TO REPLACE
/admin-coach-payouts.html
/admin-coach-payouts.js
/functions/api/admin/coach-commission-overview.js
/functions/api/coach/me.js

TEST AFTER DEPLOYMENT
A. Open /admin-coach-payouts
   Confirm standard logo/header is displayed.

B. Select August 2026 and click Load All Coaches Overview.
   For QY-C01, if the MYR 20,600 YJ12 collections were verified in August 2026,
   expected course values are approximately:
   Courses: 1
   Participants: 16
   Course Revenue: MYR 20,600.00
   Course Commission: MYR 8,240.00 (40%)
   Total Potential: MYR 8,240.00, assuming no August service commission.
   Approved and Paid remain MYR 0.00 until the payout workflow reaches those states.

C. Log in to /coach-portal
   Confirm the Potential Commission card is labelled with the current month and reflects
   verified collections received in that month even when the course occurs later.
