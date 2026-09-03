# Quantum YiJing® v3.3.4c — Affiliate Production Hardening

v3.3.4b remains the frozen production rollback point.

## Scope
1. Status-change notification emails.
2. Permanent QA/test affiliate handling.
3. Exclude QA affiliate from real analytics and payouts.
4. Add `Affiliates` beside `Sales & Commerce` in `/admin`.
5. Make `/admin-affiliates` the central Affiliate Admin hub.

## Step 1 — Preview D1
Run the statements in:
`migrations/v3.3.4c-affiliate-production-hardening.sql`

Run them in Preview D1 first. If `is_test_account` has already been created, do not rerun that ALTER TABLE.

Expected:
- QY-A0002 = Approved, portal enabled, is_test_account=1
- QY-A0001 = Archived, portal disabled, is_test_account=1

## Step 2 — Backend email
Replace:
`functions/api/admin/affiliate-control.js`

The status update is written to D1 first. Email is attempted only after the successful status update.
Email uses the existing `RESEND_API_KEY` and optional `AFFILIATE_FROM_EMAIL`.

## Step 3 — Affiliate Detail JS
Copy:
`admin-affiliate-detail-v3.3.4c.js`

In `admin-affiliate-detail.html`, replace:
`/admin-affiliate-detail-v3.3.4b.js`
with:
`/admin-affiliate-detail-v3.3.4c.js`

Optional: add the test badge snippet directly below the Affiliate Account Control heading.

## Step 4 — Affiliate Admin hub
Insert `snippets/admin-affiliates-v3.3.4c-hub.html` into `/admin-affiliates.html`
below the existing header/admin toolbar.

Append `snippets/admin-affiliates-v3.3.4c-hub.css` to `admin-affiliates.css`.

The Admin group contains:
- /admin-affiliates
- /admin-affiliate-detail.html
- /admin-affiliate-products.html
- /admin-products-master.html
- /admin-affiliate-portal.html

The Portal / Testing group contains:
- /affiliate-activate.html
- /affiliate-login.html
- /affiliate-dashboard.html

## Step 5 — AOS navigation
Search the repository for `Sales & Commerce`.

Add `Affiliates` beside it, linking to:
`/admin-affiliates`

Do NOT link the main AOS item directly to `/admin-affiliate-detail`.

## Step 6 — Test-account filtering
Read `docs/TEST-ACCOUNT-FILTERING.md`.

Every real-business affiliate analytics/payout query should exclude:
`COALESCE(a.is_test_account,0)=0`

Do not apply this filter to QA login/detail/dashboard/link-generation.

## Step 7 — Preview tests
1. Load QY-A0002 and confirm it is the QA affiliate.
2. Approved -> Suspended with reason `v3.3.4c email test`.
3. Confirm status changes, portal disables, session is revoked, and email is received.
4. Restore Suspended -> Approved, enable portal, confirm restoration email and login.
5. Open `/admin-affiliates` and test all hub links.
6. Open `/admin`, click `Affiliates`, confirm `/admin-affiliates`.
7. Confirm QY-A0002 is excluded from real KPI/top-10/sales/commission/payout figures.

Suggested commit:
`v3.3.4c affiliate production hardening`
