# Quantum YiJing® v3.3.4b-final

This is the corrected Affiliate Account Control portion of v3.3.4b.

NO NEW D1 COLUMNS are required if these already exist:
- portal_enabled
- admin_status_reason
- admin_status_updated_at
- admin_status_updated_by
- last_portal_disabled_at
- last_portal_enabled_at

## 1. Copy backend
Copy:
functions/api/admin/affiliate-control.js

## 2. Affiliate Detail HTML
Open:
admin-affiliate-detail.html

Insert the contents of:
admin-affiliate-detail-v3.3.4b-snippet.html

AFTER the affiliate profile / summary card and BEFORE the customer attribution / commission sections.

## 3. JS
Copy:
admin-affiliate-detail-v3.3.4b.js

Then in admin-affiliate-detail.html, immediately after:

<script src="/admin-affiliate-detail.js" defer></script>

add:

<script src="/admin-affiliate-detail-v3.3.4b.js" defer></script>

## 4. CSS
Append:
admin-affiliate-detail-v3.3.4b-additions.css

to the bottom of:
admin-affiliate-detail.css

## 5. Auth hardening
Read:
AUTH-HARDENING-v3.3.4b.txt

Make sure requireAffiliate() checks:
a.status='Approved'
AND a.portal_enabled=1

## 6. Commit / push Preview
Suggested commit:
v3.3.4b affiliate account status control

## 7. Test QY-A0002
1. Login as QY-A0002 first.
2. Admin Affiliate Detail -> load QY-A0002.
3. Affiliate Account Control should appear.
4. Set:
   Status = Suspended
   Portal Access = Disabled
   Reason = Preview suspension test
5. Save Account Status.
6. Confirm displayed affiliate status becomes Suspended.
7. Existing affiliate session should be revoked.
8. Affiliate dashboard/login should no longer work.
9. Restore:
   Status = Approved
   Portal Access = Enabled
10. Save again and confirm access works.

Suspended / Rejected / Archived force Portal Access = Disabled automatically.
