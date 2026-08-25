Quantum YiJing® v3.4.1a — Coach Portal Monthly Commission + Admin All-Coach Overview

BASELINE
- Built on v3.4.1 / frozen v3.4.0c coach assignment foundation.
- No new SQL migration is required if migrate-v3.4.1-coach-payouts.sql was already applied.

CHANGES
1. Coach Portal course display no longer repeats the SKU when the course name already begins with the same SKU.
   Example: YJ12 + "YJ12 Yijing: Science of Prediction" is displayed as:
   YJ12
   Yijing: Science of Prediction

2. Coach Portal top commission card is now explicitly MONTH-SCOPED.
   Label example: "Potential Commission · August 2026".
   It includes:
   - course potential for courses conducted/overlapping the current month;
   - service commission from verified paid service cases in the current month.
   A future course such as September YJ12 is still visible in Course Coaching, but is not counted in August's top monthly potential card.

3. Service fixed fee safeguard.
   An ongoing service assignment with zero cases and zero verified revenue does NOT create a monthly payout candidate merely because it has an Additional Fixed Fee.
   The fixed fee is added only when that service has actual verified paid activity in the month.

4. Admin > Coach Payouts now includes "All Coaches Commission Overview" for the selected month.
   Shows each Approved coach with:
   - courses / participants
   - course revenue / course commission
   - service cases / service revenue / service commission
   - total potential commission
   - approved commission
   - paid commission
   Existing selected-coach payout detail remains below for drill-down and payout processing.

5. Coach Hub > Coach Payouts is enabled and links to /admin-coach-payouts.

INSTALL
Copy all files over the current v3.4.1 Preview files, preserving folders.
No SQL step is needed for this patch if v3.4.1 migration was already completed.

TEST
A. Coach Portal
- Login as QY-C01.
- Confirm YJ12 is not duplicated in the course name.
- Confirm top card says "Potential Commission · August 2026" (or the current month).
- Confirm September YJ12 potential remains visible in its row but is excluded from August top monthly total.
- Confirm service seasons with zero August cases do not add RM300/RM500 to August top monthly total.

B. Admin
- Open Coach Hub > Coach Payouts.
- Enter Admin Token and select August 2026.
- Click Load All Coaches Overview.
- Confirm every Approved coach appears and course/service breakdown is visible.
- Select an individual coach and continue existing payout workflow as before.
