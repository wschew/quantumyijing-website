Quantum YiJing® Academy Operating System
v3.4.1e — Course Enquiry vs Registration Enhancement

PURPOSE
Separate a casual course enquiry from an actual registration.

WHAT CHANGES
1. Adds "Enquire About This Course" to the product/course page.
2. Opens a course-specific enquiry form in a modal.
3. Enquiry submission uses the existing /api/enquiry endpoint with:
   interest = Academy Course Enquiry
   productId / productSlug attached
   createOrder = false
4. An enquiry therefore enters CRM only and does NOT create an order/payment.
5. Changes registration wording:
   Submit Registration Interest -> Register / Request a Place
   DOKU-enabled course -> Register & Continue to Payment

NO DATABASE MIGRATION REQUIRED.

REPLACE ONLY
/functions/product/[slug].js

DO NOT CHANGE
payment/accounting, DOKU, affiliate calculation, coach commission, or v3.4.1d registration-requirements logic.

PREVIEW TEST
1. Replace /functions/product/[slug].js and deploy Preview.
2. Open /product/quantum-self-hypnosis.
3. Confirm "Enquire About This Course" appears beside the course registration area.
4. Click it and submit one test enquiry.
5. Confirm a reference appears.
6. Check Admin CRM: enquiry should be recorded for CM2.
7. Confirm NO order was created by this enquiry.
8. Confirm normal CM2 registration still shows Gender, Meal Preference and Accommodation/Dietary Notes.
9. Confirm normal registration button reads "Register / Request a Place" unless online DOKU checkout is enabled.
