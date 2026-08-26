Quantum YiJing® v3.4.1e4
Course Enquiry CRM + Email Fix

Purpose
-------
This is a surgical patch for the NEW "Enquire About This Course" flow.

The problem observed in v3.4.1e3:
- Website displayed the enquiry as accepted.
- No new enquiry appeared in CRM.
- QY received no enquiry notification email.
- Customer received no acknowledgement email.

Root cause
----------
The proven /api/enquiry endpoint contains an anti-bot honeypot rule:
    if (clean(body.website, 200)) return json({ ok: true });

If the new course-enquiry modal sends any non-empty value in `website`,
the backend deliberately returns success without storing or emailing.

v3.4.1e4 therefore reuses the existing stable enquiry pipeline and:
- forces the course enquiry `website` honeypot payload to blank;
- uses interest = "Academy Course";
- keeps productId/productSlug attribution;
- uses createOrder = false (enquiry only);
- does not touch /api/enquiry.js;
- does not touch registration, payment, CRM schema, affiliate or coach logic.

Installation
------------
Because the exact current v3.4.1e3 functions/product/[slug].js file was not
available as a source file in this chat, this package is intentionally a
SURGICAL PATCH rather than a replacement full [slug].js.

Open:
    functions/product/[slug].js

Locate the submit handler used by:
    "Enquire About This Course" / "Send Course Enquiry"

Apply the changes in:
    v3.4.1e4-course-enquiry-fix.patch.txt

Do NOT replace your whole [slug].js with an older file.

Test
----
1. Deploy Preview.
2. Open CM2 > Enquire About This Course.
3. Enter a new test name, e.g. test83.
4. Submit enquiry.
5. Confirm the page shows a reference number.
6. Check Admin CRM: test83 should appear as Academy Course.
7. Confirm QY receives the internal notification email.
8. Confirm customer receives the acknowledgement email.
9. Confirm NO order is created from the enquiry-only button.
10. Then test the separate Register / Request a Place flow to ensure it still
    creates the expected registration/order and payment path.

Version: v3.4.1e4
Date: 26 Aug 2026
