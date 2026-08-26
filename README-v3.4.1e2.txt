Quantum YiJing® Academy Operating System
v3.4.1e2 — Course Enquiry Validation Fix

FIXES
- Uses existing "General Enquiry" classification for /api/enquiry compatibility.
- Keeps course context in the enquiry message (SKU + course name).
- Keeps createOrder=false.
- Adds clear client-side validation for Full Name, Email, Question and consent.
- Improves API error reporting.

NO SQL MIGRATION.

REPLACE ONLY
/functions/product/[slug].js

TEST
1. Deploy Preview.
2. Open CM2 public product page.
3. Click "Enquire About This Course".
4. Fill Full Name, Email, Question and tick consent.
5. Submit.
6. Confirm a success reference appears.
7. Check CRM: enquiry should appear as General Enquiry with CM2/course context.
8. Confirm no order is created.

After enquiry is confirmed, test the separate "Register / Request a Place" form.
