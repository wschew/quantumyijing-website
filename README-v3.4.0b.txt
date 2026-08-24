Quantum YiJing® v3.4.0b — Coach Assignment Cleanup

Purpose
- Fix duplicate course labels such as "YJ12 · YJ12 Yijing: Science of Prediction".
- Add safe removal of open course-coach assignments.
- Add safe ending of ongoing service assignments while preserving history.
- Keep service selling prices outside Coach Management. Coach Management sets commission rules only.

Install
1. Copy these replacement files into the same paths in the v3-development branch:
   /admin-coach-hub.html
   /admin-coaches.html
   /admin-coaches.js
   /functions/api/admin/coach-assignments.js
   /functions/api/admin/coach-service-assignments.js
2. Commit and deploy Preview.
3. No SQL migration is required for v3.4.0b.

Test
A. Load /admin-coaches with Admin Token.
B. Confirm course selector and Course Coaching Overview show: YJ12 · Yijing: Science of Prediction (only one YJ12).
C. Create a temporary open course assignment. In Course Coaching Overview click Remove. It should disappear.
D. Confirm a closed/finalized course assignment shows Locked and cannot be removed.
E. Create a temporary service assignment. Click End Assignment. It should remain in history as Inactive, with an Effective Until date.
F. Confirm service price is not entered anywhere in Coach Management. Service prices remain managed centrally in Products / Sales & Commerce.

Accounting safeguard
- This patch does not modify payment, order, affiliate accounting, or frozen payout logic.
- No database schema changes.
