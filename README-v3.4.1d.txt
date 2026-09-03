Quantum YiJing® Academy Operating System
v3.4.1d — Course Registration Requirements + CM2 Residential Course Support

IMPORTANT VERSION NOTE
v3.4.1c is already the Coach Portal Standard Header + Monthly Commission Chart patch.
Therefore this new patch is correctly numbered v3.4.1d to avoid a version collision.

PURPOSE
1. Add reusable course-specific registration requirements without hard-coding CM2.
2. Support:
   - Gender: Male / Female
   - Meal preference: Normal / Vegan
   - Accommodation included
   - Optional accommodation / dietary notes
   - Registration / check-in time
   - Course end / check-out time
3. Store the extra registration answers in structured D1 records.
4. Add the supplied CM2 hero banner at:
   /assets/courses/cm2-quantum-self-hypnosis.jpg
5. Preserve the existing order/payment/DOKU/accounting and coach-commission rules.

THIS PATCH DOES NOT CHANGE
- payments
- orders accounting logic
- DOKU checkout/notification logic
- affiliate commissions/payouts
- coach commission calculations/payout eligibility

FILES TO ADD / REPLACE
ADD:
- /migrate-v3.4.1d.sql
- /admin-products-registration-v3.4.1d.js
- /functions/api/admin/product-registration-settings.js
- /functions/api/course-registration.js
- /assets/courses/cm2-quantum-self-hypnosis.jpg

REPLACE:
- /functions/product/[slug].js

ONE SMALL EDIT TO EXISTING FILE
Open /admin-products-master.html
Immediately before </body> add:
<script src="/admin-products-registration-v3.4.1d.js?v=3.4.1d" defer></script>

DATABASE
Run migrate-v3.4.1d.sql on PREVIEW D1 only first.

CM2 PRODUCT MASTER
SKU: CM2
Slug: quantum-self-hypnosis
Category: course
Price: 1399
Currency: MYR
Name EN: Quantum Self Hypnosis
Name 中文: 量子自我催眠
Start Date: 11/09/2026
End Date: 13/09/2026
Instructor: Master Chew Wai Soon
Delivery EN: 3D2N Residential Course · Penang
Delivery 中文: 3天2夜住宿课程 · 槟城
Language EN: Chinese
Language 中文: 中文
Hero Image URL: /assets/courses/cm2-quantum-self-hypnosis.jpg

CM2 REGISTRATION REQUIREMENTS
After the Product Master enhancement appears:
✓ Ask Gender (Male / Female) · required
✓ Ask Meal Preference (Normal / Vegan) · required
✓ Accommodation Included
✓ Ask Accommodation / Dietary Notes (recommended)
Registration / Check-in Time: 14:00
Course End / Check-out Time: 12:00

TEST ORDER
1. Deploy all files to Preview.
2. Run SQL migration in Preview D1.
3. Add the one script line to admin-products-master.html.
4. Reload /admin-products-master.
5. Confirm "Registration Requirements" appears.
6. Save CM2 as Draft first.
7. Set the CM2 registration requirements above and click Save Registration Requirements.
8. Change CM2 to Active.
9. Open /product/quantum-self-hypnosis (or your normal product route).
10. Confirm:
   - supplied hero banner displays
   - Male/Female appears and is required
   - Normal/Vegan appears and is required
   - accommodation/meal inclusion notice appears
   - 2:00 PM check-in and 12:00 PM course-end/check-out appear
11. Submit ONE test registration.
12. Verify the normal enquiry/order is created.
13. D1 verification query:

SELECT
  e.reference,
  e.name,
  p.sku,
  crd.gender,
  crd.meal_preference,
  crd.accommodation_notes,
  crd.created_at
FROM course_registration_details crd
JOIN enquiries e ON e.id=crd.enquiry_id
JOIN products p ON p.id=crd.product_id
ORDER BY crd.id DESC
LIMIT 10;

EXPECTED
The CM2 registration row should show Gender and Meal Preference as structured data.

ROLLBACK
Because this patch is additive, rollback is simple:
- restore previous /functions/product/[slug].js
- remove the script line from admin-products-master.html
- leave the two new tables in D1 (harmless), or drop them only if you intentionally want a full rollback.

FREEZE RULE
Do not modify the stable payment/accounting or coach payout behaviour while testing this patch.
