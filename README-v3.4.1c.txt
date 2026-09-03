Quantum YiJing® Academy Operating System
v3.4.1c — Coach Portal Standard Header + Monthly Commission Chart

Purpose
1. Standardize /coach-portal header with the Quantum YiJing® 3D logo and Coach Portal version line.
2. Add a 12-month Monthly Commission Earned chart to motivate coaches and make commission trend visible.
3. The current month uses live Potential Commission.
4. Previous months are calculated from verified paid collections occurring in each respective month, using the commission rule active for the coach assignment.

Files to replace
- /coach-portal.html
- /coach-portal.js
- /functions/api/coach/me.js

No SQL migration is required.

Important accounting/display rule
- This chart is motivational/operational, not a payout ledger.
- Past bars = commission generated from verified payments collected in that month.
- Current month bar = live Potential Commission for the current month.
- Approved for Payment and Commission Paid remain controlled by the existing payout workflow and are not changed by this patch.

Recommended test
1. Deploy all 3 files together.
2. Login to Coach Portal.
3. Confirm standard header shows logo + Quantum YiJing® + COACH PORTAL · v3.4.1c.
4. Confirm Potential Commission label includes the current month.
5. Confirm chart contains the latest 12 months.
6. For August 2026, with the existing YJ12 verified collections, the current bar should match the Potential Commission card (currently MYR 8,240.00 in the test data shown).
