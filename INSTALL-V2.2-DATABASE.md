# Quantum YiJing v2.2 — Enquiry Database Setup

This update stores each successful website enquiry in Cloudflare D1 before sending the two emails. It also provides a protected CSV export that opens correctly in Microsoft Excel, including Chinese text.

## New binding and secret

- D1 binding name: `ENQUIRIES_DB`
- Export secret name: `ENQUIRY_EXPORT_TOKEN`

Never place either secret value in GitHub or website JavaScript.

## 1. Install the files

Replace/add these files in the `v2-development` branch:

- `functions/api/enquiry.js`
- `functions/api/export-enquiries.js`
- `database/schema.sql`

## 2. Create the D1 database

In Cloudflare Dashboard:

1. Go to **Storage & databases → D1 SQL database**.
2. Click **Create database**.
3. Name it: `quantumyijing-enquiries`.
4. Open the database and select **Console**.
5. Open `database/schema.sql`, copy all SQL, paste it into the console, and click **Execute**.
6. Confirm the `enquiries` table appears.

## 3. Bind D1 to the Pages project

Go to:

**Workers & Pages → quantumyijing-website → Settings → Bindings**

For **Preview**:

1. Choose environment **Preview**.
2. Add a **D1 database binding**.
3. Variable name: `ENQUIRIES_DB`.
4. Select database: `quantumyijing-enquiries`.
5. Save.

Repeat for **Production** using the same binding name and database. This gives one combined master enquiry list from Preview and Production. If you prefer test data to remain separate later, create a second Preview database.

## 4. Create the CSV export token

Generate a long private random value (at least 32 characters). Add it as an encrypted Secret in both Preview and Production:

- Name: `ENQUIRY_EXPORT_TOKEN`
- Value: your private random token

Do not share this token in chat, screenshots, GitHub, or email.

## 5. Commit and deploy

Recommended commit message:

`Add v2.2 enquiry database and CSV export`

Push to `v2-development`, wait for the Preview deployment, then submit a test enquiry.

## 6. Verify the saved record

Open:

**Cloudflare → D1 → quantumyijing-enquiries → Console**

Run:

```sql
SELECT id, reference, submitted_date, name, email, interest, status
FROM enquiries
ORDER BY id DESC
LIMIT 20;
```

The new test enquiry should appear with its date and reference number.

## 7. Export to CSV for Excel

The protected endpoint is:

`https://YOUR-PREVIEW-DOMAIN.pages.dev/api/export-enquiries`

Use Windows PowerShell (replace the URL and token):

```powershell
$headers = @{ Authorization = "Bearer YOUR_PRIVATE_EXPORT_TOKEN" }
Invoke-WebRequest `
  -Uri "https://YOUR-PREVIEW-DOMAIN.pages.dev/api/export-enquiries" `
  -Headers $headers `
  -OutFile "$HOME\Downloads\quantum-yijing-enquiries.csv"
```

Open the downloaded `.csv` in Microsoft Excel. The file contains a UTF-8 marker so Chinese characters display correctly.

Optional date filters:

`/api/export-enquiries?from=2026-08-01&to=2026-08-31`

Maximum rows per export defaults to 5,000. You can request up to 10,000:

`/api/export-enquiries?limit=10000`

## Security notes

- The public enquiry form can insert records only through the server-side Function.
- Database credentials are not exposed to the browser.
- CSV export requires the private Bearer token.
- Do not put the export token in a browser URL because URLs may remain in history.
- Customer data should be retained only as long as necessary and handled according to your privacy commitments.

## Rollback

Restore the previous `functions/api/enquiry.js`. The D1 database can remain; it will simply stop receiving new rows.
