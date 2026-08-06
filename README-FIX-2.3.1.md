# v2.3.1 CRM Route Fix

This patch replaces the nested CRM API routes with one reliable endpoint:

- `/api/admin?action=stats`
- `/api/admin?action=enquiries`
- `/api/admin?action=export`
- `/api/admin?action=update&id=<id>`

## Install

1. Copy `admin.js` and the `functions` folder into the repository root.
2. Replace existing files when prompted.
3. Delete the old folder `functions/api/admin/` (the directory containing `stats.js`, `export.js`, and `enquiries.js`).
4. Keep the new file `functions/api/admin.js`.
5. Commit and push to `v2-development`.

No Cloudflare secret or binding changes are required.
