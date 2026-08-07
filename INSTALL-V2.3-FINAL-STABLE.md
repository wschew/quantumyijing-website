# Quantum YiJing International Academy — v2.3 Final Stable CRM

This package consolidates the working v2.3 CRM, the v2.3.1 Cloudflare route fix, and a permanent browser-cache fix.

## For an existing v2.3 installation

If you already configured Cloudflare Preview and Production with:

- `RESEND_API_KEY` — Secret
- `ADMIN_TOKEN` — Secret
- `ENQUIRIES_DB` — D1 binding to `quantumyijing-enquiries`

then **do not recreate any secrets or database**.

### 1. Replace files

Copy this package over the repository root and replace matching files.

The final CRM function layout must be:

```
functions/
  api/
    admin.js
    enquiry.js
```

Delete the obsolete folder if it still exists:

```
functions/api/admin/
```

Also remove the obsolete endpoint if present:

```
functions/api/export-enquiries.js
```

The CRM CSV export is now handled securely through `/api/admin?action=export`.

### 2. Confirm the cache-fixed admin page

`admin.html` should load:

```
admin.css?v=2.3.2
admin.js?v=2.3.2
```

This prevents an old cached `admin.js` from calling the retired nested API routes.

### 3. Commit to development

Recommended commit message:

```
Finalize v2.3 stable Academy CRM
```

Commit to `v2-development`, push origin, and wait for the Cloudflare Preview deployment.

### 4. Preview test

Open the newest Cloudflare Preview URL:

```
https://YOUR-PREVIEW.pages.dev/admin.html
```

Do **not** use VS Code Live Server for CRM testing. `127.0.0.1:5500` cannot run Cloudflare Pages Functions or access the deployed D1 binding.

Test all of the following:

1. Submit a public website enquiry.
2. Confirm the Academy notification email arrives.
3. Confirm the customer acknowledgement email arrives.
4. Open `/admin.html` and enter the `ADMIN_TOKEN`.
5. Confirm the new enquiry appears.
6. Open the record and change its status.
7. Add a follow-up date and private notes, then save.
8. Refresh and confirm the changes persist.
9. Test search and filters.
10. Click **Export to Excel (CSV)** and open the file in Excel.

### 5. Production release

After Preview passes all tests:

1. Confirm Production still has `RESEND_API_KEY`, `ADMIN_TOKEN`, and `ENQUIRIES_DB`.
2. Merge `v2-development` into `main` using the normal release workflow.
3. Wait for the Production Cloudflare deployment.
4. Test one real enquiry at `https://quantumyijing.com`.
5. Open the private CRM at `https://quantumyijing.com/admin.html`.

Do not add the CRM URL to the public website navigation. Bookmark it privately instead.

## Security notes

- CRM APIs require `Authorization: Bearer <ADMIN_TOKEN>`.
- The admin page is marked `noindex,nofollow,noarchive`.
- The admin token is kept in browser session storage only after login and is removed on logout.
- Customer data is served only through the authenticated admin API.
- Secrets must remain in Cloudflare and must never be committed to GitHub.

For a future multi-user CRM, replace the shared admin token with Cloudflare Access or individual user authentication.
