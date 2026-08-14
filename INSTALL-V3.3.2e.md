# Quantum YiJing® v3.3.2e

Small upgrade on top of v3.3.2d.

## Change
Replaces the generic `Monthly Affiliate Sales` graph with:
`Monthly Affiliate Sales by Product Category`

Categories:
- Courses
- Consultations
- Books / eBooks
- Digital Products
- Physical Products
- Memberships
- Events
- Other

The graph uses `affiliate_commissions.product_id -> products.product_type`.

Only successfully paid affiliate sales are counted.
Reversed and Cancelled commissions are excluded.

## No SQL migration required.

Replace:
- `functions/api/admin/affiliate-analytics.js`
- `admin-affiliates.html`
- `admin-affiliates.js`

Append:
- `admin-affiliates-v3.3.2e-additions.css`
to the end of your existing `admin-affiliates.css`.

Commit suggestion:
`v3.3.2e affiliate sales by product category`

Deploy to Preview first and test `/admin-affiliates.html`.
