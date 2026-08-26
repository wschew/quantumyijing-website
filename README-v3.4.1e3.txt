Quantum YiJing® Academy Operating System
v3.4.1e3 — Course Enquiry Button / Modal Fix

FIXES
- Enquiry button now opens the modal directly from the button action.
- Close button and backdrop also work directly.
- Adds SKU to the client-side product object.
- Corrects product-name property used by the enquiry payload.
- Keeps enquiry as General Enquiry with createOrder=false.
- No SQL migration.

REPLACE ONLY
/functions/product/[slug].js

TEST ORDER
1. Deploy Preview.
2. Open /product/quantum-self-hypnosis.
3. Click "Enquire About This Course".
   EXPECTED: modal opens immediately.
4. Fill Full Name, Email, Your Question, tick consent.
5. Click "Send Course Enquiry".
   EXPECTED: success reference appears.
6. Check CRM for the enquiry.
7. Confirm no order was created.
8. Only after the enquiry test passes, test "Register / Request a Place".
