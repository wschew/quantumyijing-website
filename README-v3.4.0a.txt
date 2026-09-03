Quantum YiJing v3.4.0a — Coach Course + Service Assignment Patch

BASELINE
Install on top of tested v3.4.0 Coach Foundation. Affiliate and Payment/Accounting behavior is not modified.

CHANGES
1. Coach numbering changes from QY-C0001 to QY-C01. Migration converts existing coach codes.
2. Course selector displays SKU once: e.g. YJ12 · YJ12 Yijing: Science of Prediction.
3. Course coach commission = Eligible Course Revenue × Commission % + Additional Fixed Fee.
4. Participant Count and Eligible Course Revenue are removed from manual assignment inputs.
5. Course Participant Count and Eligible Course Revenue are calculated from Paid/External + Verified/Reconciled payments for orders containing the selected course product.
6. Potential commission updates whenever Admin or Coach Portal loads.
7. Admin chooses Course Commission Closing Date from course end date through maximum End Date + 5 days. Default is +5 days.
8. On/after closing date, the next Admin/Coach Portal refresh freezes participant count, eligible revenue and final commission. (Cloudflare Pages Functions have no independent timer; this is lazy automatic closing on first request after deadline.)
9. Adds ongoing Coach Service assignments for:
   - Feng Shui Consultation
   - Bazi Consultation
   - Auspicious Birthdate Selection
   - Auspicious Name Baby/Company
10. Service assignments use Effective From / optional Effective Until and independent commission %.
11. Service revenue automatically links when the QY Products table contains a product whose English name exactly matches the service name. Until such a product/order exists, revenue/cases correctly show 0.

INSTALL — PREVIEW ONLY FIRST
A. Copy/replace all files in this package to the same repository paths.
B. Run migrate-v3.4.0a-coach-course-service.sql ONCE on Preview D1.
C. Deploy Preview.
D. Hard refresh the browser.

TEST
1. Open /admin-coaches, enter Admin Token, Load Coach Data.
2. Existing QY-C0001 should now display QY-C01 after migration.
3. YJ12 should display once as SKU + course name.
4. Assign an Approved coach to YJ12. Set % and optional Additional Fixed Fee. Do not enter participant/revenue manually.
5. Verify Course Coaching Overview shows automatic Participants, Eligible Revenue and Potential Commission.
6. Assign the same/different Approved coach to each service with its own %.
7. Open Coach Portal. Confirm both Course and Ongoing Service sections appear.

IMPORTANT ACCOUNTING RULE
Potential commission uses actual qualifying payment records, not order list price. Final course commission is frozen only at the selected closing date, no later than 5 days after course end.
