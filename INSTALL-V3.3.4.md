# Quantum YiJing® v3.3.4 — Dynamic Affiliate Product Links & Eligibility

## Purpose
Only Active products/services with `Affiliate Eligible = Yes` appear in an affiliate member's private portal.

Each displayed item automatically carries that member's permanent affiliate code.

## Commission priority
1. Affiliate-specific override
2. Product-specific commission
3. Programme default commission

## Step 1 — Copy files
Copy:
- `functions/api/admin/affiliate-products.js`
- `functions/api/affiliate/portal/links.js`
- `admin-affiliate-products.html`
- `admin-affiliate-products.js`
- `admin-affiliate-products.css`

## Step 2 — Preview D1 migration
Run ONCE:
```sql
ALTER TABLE products ADD COLUMN affiliate_public_path TEXT NOT NULL DEFAULT '';
```
Then:
```sql
CREATE INDEX IF NOT EXISTS idx_products_affiliate_eligible ON products(affiliate_enabled,status);
```
Verify with:
```sql
PRAGMA table_info(products);
```

## Step 3 — Affiliate dashboard
Replace only the existing `My Affiliate Links` panel in `affiliate-dashboard.html`
with `affiliate-dashboard-v3.3.4-links-snippet.html`.

Append `affiliate-portal-v3.3.4-additions.css` to the bottom of `affiliate-portal.css`.

## Step 4 — Optional Admin navigation
Add the content of `admin-affiliates-v3.3.4-nav-snippet.html`
beside `Individual Affiliate Detail` in `admin-affiliates.html`.

## Step 5 — Commit / Push Preview
Suggested commit:
`v3.3.4 dynamic affiliate product eligibility and links`

## Step 6 — Test YJ12
Open:
`/admin-affiliate-products.html`

Enter Admin Token → Load Products.

For YJ12:
- Affiliate Eligible: Yes
- Commission: percentage / 20
- Public Page Path: enter the ACTUAL YJ12 public page path

Save.

Then login as QY-A0002 and open `/affiliate-dashboard.html`.
YJ12 should appear with its affiliate-specific link.

## Future YJ13
When YJ13 is created, mark:
- status = Active
- Affiliate Eligible = Yes
- set Public Page Path

It will automatically appear for all approved affiliates with their own codes.

If Affiliate Eligible = No, it will not appear.

No changes to payment logic in this release.
