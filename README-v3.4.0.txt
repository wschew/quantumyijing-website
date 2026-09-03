Quantum YiJing v3.4.0 — Coach Management & Commission Foundation

PURPOSE
Foundation only. This release does NOT create coach payouts yet.
It creates a separate Coach domain so the frozen Affiliate and Payment/Accounting logic is untouched.

INSTALL
Copy all files to matching paths in the repository.
Run migrate-v3.4.0-coach-foundation.sql once on PREVIEW D1 only for initial testing.
Deploy Preview.

NEW ADMIN FLOW
/admin -> Coaches -> Coach Management Hub -> Coach Management

TEST ORDER
1. Run D1 migration.
2. Open /admin and confirm Coaches link.
3. Open Coach Management Hub.
4. Enter Admin Token and Load Coach Data.
5. Create one test coach, status Approved, Portal Access Enabled, password >= 8 characters.
6. Reload and confirm QY-C0001 is in Approved list.
7. Assign QY-C0001 to YJ12.
8. Set commission mode and participant count; confirm Potential Commission.
9. Open /coach-login and log in with test coach credentials.
10. Confirm Coach Portal shows assigned YJ12, participant count and potential commission.

COMMISSION MODES
- fixed_per_participant: participant_count x fixed amount
- percentage_of_revenue: eligible_course_revenue x commission_rate / 100
- fixed_course: fixed amount for the course

COURSE COMPLETION
When Course Status becomes Conducted:
- participant count is locked
- final commission is frozen from the potential commission value
- payout eligible month is set from the course end/start month

IMPORTANT
v3.4.1 will implement the month-end Coach Payout workflow similar to Affiliate Payouts.
No Affiliate tables, Affiliate payout code, Payment code or DOKU code are changed by v3.4.0.
