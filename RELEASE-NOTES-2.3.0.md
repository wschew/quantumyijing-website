# Release Notes — v2.3.0
## Academy CRM Foundation

### Included from v2.2
- Softer branded bilingual customer confirmation email
- Academy logo and enquiry reference number
- Improved internal enquiry notification

### New CRM capabilities
- Permanent Cloudflare D1 storage for every valid website enquiry
- Automatic Malaysia date and time
- Private CRM dashboard at `/admin.html`
- Summary cards for total, today, month, new, follow-up and converted enquiries
- Breakdown by enquiry area, country and month
- Search by name, email, phone, country, reference or message
- Filters by status, area and date range
- Status workflow: New, Contacted, Follow-up, Converted, Closed
- Follow-up dates and private notes
- Excel-compatible UTF-8 CSV export
- Token-protected administrator APIs

### Cloudflare bindings and secrets
- `ENQUIRIES_DB` — D1 database binding
- `RESEND_API_KEY` — existing Resend secret
- `ADMIN_TOKEN` — new CRM administrator secret

### Security
- No customer records are exposed through the public site
- Dashboard APIs require an Authorization bearer token
- Admin page is marked `noindex`
- Secrets are never stored in the repository

### Upgrade path
v2.3 supersedes the uninstalled v2.2 and v2.2.1 packages. Install v2.3 directly over the working v2.1 branch.
