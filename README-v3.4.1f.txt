Quantum YiJing® v3.4.1f — Admin Product / Course / Service Directory

PURPOSE
Adds one easy administration directory where you can see and select all created products,
courses and services, with Active/Approved shown by default.

FILES
1. admin-product-directory.html
   Copy to the website ROOT.

2. ADMIN-LINK-PATCH.html
   This contains the one additive link to insert into the existing /admin/ module-tabs navigation.

WHY THE MAIN admin.html IS NOT INCLUDED
The existing /admin/ page contains the stable CRM, Students, Marketing, Sales & Commerce,
Affiliate, payment/accounting and other modules. This patch deliberately does NOT replace
admin.html with an older copy. Add only the supplied link to the current /admin/ navigation.

DEFAULT DIRECTORY BEHAVIOUR
- Status defaults to Active / Approved.
- Filter: All / Courses / Services & Consultations / Memberships / E-books / Digital /
  Physical / Events / Other.
- Search by SKU, English name, Chinese name or slug.
- Public View opens /product/<slug>.
- Edit sends Admin to the existing Product Master.
- Data comes from the existing stable endpoint:
      /api/admin?action=commerceproducts

NO SQL migration.
NO payment/accounting change.
NO enquiry code change.
NO v3.4.1e6 enquiry behavior change.

REUSABLE ENQUIRY RULE
Keep v3.4.1e6's product-page enquiry flow as the standard for YJ12 and future courses/services:
the public course enquiry must POST to the existing /api/enquiry routine, create a CRM enquiry
record, and trigger both customer and QY notification emails. Do not create a parallel enquiry
pipeline.
