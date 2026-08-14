# Quantum YiJing® v3.3.4b — Product & Affiliate Administration Controls

## Adds
1. Product Admin: create/edit SKU, slug, category, status, price, currency, names, descriptions, course dates, early-bird fields, instructor, delivery, language and hero image.
2. Affiliate Account Control: Pending/Approved/Rejected/Suspended/Archived, portal enable/disable, session revocation, reason/note.

## Step 1 — Preview D1
Run each ALTER once:
```sql
ALTER TABLE affiliates ADD COLUMN portal_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE affiliates ADD COLUMN admin_status_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliates ADD COLUMN admin_status_updated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliates ADD COLUMN admin_status_updated_by TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliates ADD COLUMN last_portal_disabled_at TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliates ADD COLUMN last_portal_enabled_at TEXT NOT NULL DEFAULT '';
```
Then:
```sql
CREATE INDEX IF NOT EXISTS idx_affiliates_status_portal
ON affiliates(status, portal_enabled);
```
Verify:
```sql
PRAGMA table_info(affiliates);
```

## Step 2 — Copy backend
- functions/api/admin/products-master.js
- functions/api/admin/affiliate-control.js

## Step 3 — Product Admin
Copy:
- admin-products-master.html
- admin-products-master.js
- admin-products-master.css

Test `/admin-products-master.html` with YJ12.

## Step 4 — Affiliate Detail controls
Insert `admin-affiliate-detail-v3.3.4b-snippet.html` after the existing profile/summary area in `admin-affiliate-detail.html`.

Add after the existing admin-affiliate-detail.js script:
```html
<script src="/admin-affiliate-detail-v3.3.4b.js" defer></script>
```
Copy `admin-affiliate-detail-v3.3.4b.js`.
Append `admin-affiliate-detail-v3.3.4b-additions.css` to `admin-affiliate-detail.css`.

## Step 5 — Auth hardening
In `functions/api/affiliate/auth/_auth.js`, inside `requireAffiliate()`, select `a.portal_enabled` and add:
```sql
AND a.portal_enabled=1
```
Use `_auth-v3.3.4b-snippet.txt` as reminder.

## Step 6 — Optional admin navigation
Add links from `admin-main-v3.3.4b-nav-snippet.html` to admin.html.

## Step 7 — Preview test
Suggested commit:
`v3.3.4b product and affiliate admin controls`

Test Test Affiliate2:
- login first
- set Suspended
- confirm dashboard access is blocked
- restore Approved
- Enable Portal
- confirm login works again

If all tests pass, freeze v3.3.4b.
