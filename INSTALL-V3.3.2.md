# Quantum YiJing® v3.3.2 — Installation Guide

## Purpose

v3.3.2 adds:
- Public Affiliate Programme page
- Affiliate application form
- D1 application API
- Public programme-settings API
- Separate Affiliate Admin page
- Pending → Approve / Reject
- Automatic affiliate code generation (`QY-A0001`, `QY-A0002`, ...)
- 12-month membership activation on approval
- Optional Resend notification/welcome emails

## 1. Copy files into the existing project

Copy the files/folders from this package into `quantumyijing-website`.

Important new files:
- `affiliate.html`
- `affiliate.css`
- `affiliate.js`
- `admin-affiliates.html`
- `admin-affiliates.css`
- `admin-affiliates.js`
- `functions/api/affiliate/apply.js`
- `functions/api/affiliate/settings.js`
- `functions/api/admin/affiliates.js`
- `database/migrate-v3.3.2.sql`

## 2. Preview D1 migration

Run only:

```sql
CREATE INDEX IF NOT EXISTS idx_affiliates_email_status
  ON affiliates(email,status);
```

Then verify:

```sql
SELECT name FROM sqlite_master
WHERE type='index' AND name='idx_affiliates_email_status';
```

## 3. Required Cloudflare binding

The Functions expect the existing D1 binding to be named:

`DB`

If your existing QY Functions use a different D1 binding name, update `env.DB` in the three new API files to match the current project.

## 4. Admin token

The Affiliate Admin API expects the existing secret:

`ADMIN_TOKEN`

Open:
`/admin-affiliates.html`

Enter the same Admin Token you currently use for QY Admin.

## 5. Optional Resend email

The code uses:
- `RESEND_API_KEY`
- optional `AFFILIATE_FROM_EMAIL`
- optional `AFFILIATE_ADMIN_EMAIL`

If only `RESEND_API_KEY` exists, defaults are:
- From: `Quantum YiJing <info@quantumyijing.com>`
- Admin notification: `info@quantumyijing.com`

If your existing Resend variable names differ, adjust the new API files before deployment.

## 6. Preview deployment test

After pushing to the development branch and Cloudflare Preview deployment:

1. Open `/affiliate.html`
2. Submit one test affiliate application
3. Confirm success reference is shown
4. Open `/admin-affiliates.html`
5. Enter Admin Token
6. Load `Pending`
7. Confirm bank account is masked in the list
8. Click Approve
9. Confirm code such as `QY-A0001`
10. Confirm membership expiry is 12 months from approval
11. Confirm the approved row is visible

## Security note

The Admin list intentionally masks bank account numbers. Full bank details should later be exposed only through a dedicated authorised payout/detail endpoint, not in general lists.

## Important

Do not deploy to Production until the complete application → approval flow has been tested in Preview.
