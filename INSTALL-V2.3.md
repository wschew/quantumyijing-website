# Quantum YiJing International Academy v2.3
## Academy CRM Foundation — Installation Guide

v2.3 includes all v2.2/v2.2.1 improvements. Install it directly over the working v2.1 branch; do not install v2.2 first.

## 1. Install the files

1. In GitHub Desktop, confirm repository `quantumyijing-website`, branch `v2-development`, and no local changes.
2. Fetch/Pull before starting.
3. Copy the contents of the v2.3 update package into the repository root and replace matching files.
4. Confirm these paths exist:

```
admin.html
admin.css
admin.js
database/schema.sql
functions/api/enquiry.js
functions/api/admin/enquiries.js
functions/api/admin/enquiries/[id].js
functions/api/admin/stats.js
functions/api/admin/export.js
```

## 2. Create the Cloudflare D1 database

In Cloudflare, open **Storage & databases → D1 SQL database → Create**.

Database name:

```
quantumyijing-enquiries
```

After creation, open the database **Console**, paste the complete contents of:

```
database/schema.sql
```

Run the SQL once. The `enquiries` table and indexes should be created.

> `database/migrate-v2.3.sql` is only for a site that already installed v2.2.1. Do not run it on a new database.

## 3. Bind D1 to the Pages project

Open:

**Workers & Pages → quantumyijing-website → Settings → Bindings**

Add a **D1 database binding** to both Preview and Production:

```
Variable name: ENQUIRIES_DB
Database: quantumyijing-enquiries
```

Use the same database for Preview and Production so all real enquiries are kept in one CRM. Test records can be deleted later from the D1 console.

## 4. Add the CRM administrator secret

Create one long private token in a password manager. Recommended: at least 32 random characters.

Add it as an encrypted secret to both Preview and Production:

```
Name: ADMIN_TOKEN
Value: your private random token
```

Keep the existing secret:

```
RESEND_API_KEY
```

Do not place either secret in GitHub, HTML, JavaScript files, screenshots or chat messages.

## 5. Deploy Preview

Commit message:

```
Add v2.3 Academy CRM foundation
```

Commit to `v2-development`, push, and wait for the Cloudflare Preview deployment.

If bindings or secrets were added after the build, redeploy the Preview once more.

## 6. Test the public enquiry workflow

On the latest Preview URL:

1. Submit an enquiry.
2. Confirm the visitor receives the bilingual branded confirmation.
3. Confirm `info@quantumyijing.com` receives the internal notification.
4. Confirm a new row appears in the D1 `enquiries` table.

## 7. Open the private CRM

Open:

```
https://YOUR-PREVIEW-URL/admin.html
```

Enter the exact `ADMIN_TOKEN` value. The token is stored only in the browser's session storage and is cleared when you log out or close the session.

Test:

- Summary statistics
- Search and filters
- View an enquiry
- Change status
- Add follow-up date and private notes
- Export CSV and open it in Excel

## 8. Production release

Only after Preview testing is complete:

1. Confirm Production has `ENQUIRIES_DB`, `RESEND_API_KEY`, and `ADMIN_TOKEN`.
2. Merge `v2-development` into the production branch.
3. Test one live enquiry.
4. Bookmark `https://quantumyijing.com/admin.html` privately. Do not place an admin link in the public navigation.

## Security model

The dashboard is not indexed by search engines and all CRM API requests require the bearer `ADMIN_TOKEN`. This is appropriate for a single-administrator first release. A future version should replace the shared token with Cloudflare Access or individual user authentication before adding staff accounts.
