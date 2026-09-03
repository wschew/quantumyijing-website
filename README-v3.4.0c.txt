Quantum YiJing® v3.4.0c — Service Seasonal Commission Rates

Purpose
- Add Edit to Service Coaching Overview.
- Allow the same approved coach to have different commission rates for the same service in different non-overlapping effective periods.
- Prevent overlapping rate periods, which could double-count the same service revenue.
- Protect historical commission terms after eligible revenue/cases already exist.

Files to replace
1. admin-coach-hub.html
2. admin-coaches.html
3. admin-coaches.js
4. functions/api/admin/coach-service-assignments.js

No SQL migration is required.

How seasonal rates work
Example Feng Shui Consultation:
- 2026-08-25 to 2026-12-31 = 70%
- 2027-01-01 to 2027-03-31 = 60%
- 2027-04-01 onward = 65%

The periods must not overlap.

Editing safeguard
- If an assignment has no eligible service revenue/cases yet, Admin may edit its coach/service/date/rate/fixed-fee/status.
- Once eligible revenue/cases exist, historical commission terms cannot be rewritten. Admin should end the period and create a new non-overlapping period for the new rate.
- Effective Until/status can still be used to close the operational period without deleting history.

Service selling prices remain managed under Products / Sales & Commerce, not Coach Management.
