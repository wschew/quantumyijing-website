# Release Notes — v2.3 Final Stable CRM

## Stable CRM foundation

This release consolidates the v2.3 Academy CRM and subsequent fixes into one clean package.

### Enquiry workflow
- Website enquiry form backed by Cloudflare Pages Functions
- Permanent D1 storage before email delivery
- Automatic Malaysia date/time and unique enquiry reference
- Academy notification email to `info@quantumyijing.com`
- Branded bilingual customer acknowledgement email

### CRM dashboard
- Private administrator login using `ADMIN_TOKEN`
- Total, today, monthly, new, follow-up and converted statistics
- Top enquiry areas, countries and monthly enquiry summaries
- Search by name, email, phone, country, reference or message
- Filter by status, area and date range
- Status workflow: New, Contacted, Follow-up, Converted, Closed
- Follow-up dates and private notes
- UTF-8 CSV export compatible with Microsoft Excel

### Stability fixes
- Consolidated CRM backend into a single Cloudflare Pages Function: `functions/api/admin.js`
- Retired nested `/api/admin/...` route files that caused 404 errors in deployment
- CRM frontend now calls `/api/admin?action=...`
- Permanent cache version added to `admin.js` and `admin.css` so `/admin.html` works without manually adding `?v=231`
- Removed obsolete standalone enquiry-export endpoint; export is authenticated through the CRM API

### Cloudflare configuration
Both Preview and Production require:

```
RESEND_API_KEY   Secret
ADMIN_TOKEN      Secret
ENQUIRIES_DB     D1 database binding
```

No new Cloudflare secrets or database are required when upgrading from the already-working v2.3 installation.
