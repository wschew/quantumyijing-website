# Quantum YiJing v2.4 — Academy Operating System Phase 1

This update upgrades the stable v2.3 CRM into a lead and student lifecycle manager.

## Before installing

- Work only on `v2-development`.
- Confirm GitHub Desktop shows `0 changed files` before copying the update.
- Keep the existing Cloudflare bindings/secrets unchanged:
  - `RESEND_API_KEY` (Secret)
  - `ADMIN_TOKEN` (Secret)
  - `ENQUIRIES_DB` (D1 binding)
- No new API key or Cloudflare secret is required for v2.4.

## 1. Copy the v2.4 files

Copy the update package into the repository root and replace existing files when prompted.

Updated files:

- `admin.html`
- `admin.css`
- `admin.js`
- `functions/api/admin.js`
- `functions/api/enquiry.js`

New files:

- `database/migrate-v2.4.sql`
- `INSTALL-V2.4.md`
- `RELEASE-NOTES-2.4.0.md`

## 2. Upgrade the D1 database — IMPORTANT

Do this **before pushing v2.4 to Cloudflare Preview**.

Cloudflare → Storage & databases → D1 → `quantumyijing-enquiries` → Console.

Open `database/migrate-v2.4.sql` in VS Code, copy the complete SQL, paste it into the D1 Console, and execute it once.

The migration adds:

- lifecycle stage tracking
- last-contacted tracking
- `students` table
- `crm_activities` timeline table
- supporting indexes
- an initial timeline entry for existing enquiries

Do not run `database/schema.sql` again. Do not run `migrate-v2.3.sql` again.

## 3. Commit and push

Recommended commit message:

`Add v2.4 Academy Operating System Phase 1`

Then:

1. Commit to `v2-development`
2. Push origin
3. Wait for Cloudflare Preview deployment

## 4. Test in Cloudflare Preview

Do not use VS Code Live Server for the CRM APIs. Open:

`https://<latest-preview>.quantumyijing-website.pages.dev/admin.html`

Test:

1. Login with the existing `ADMIN_TOKEN`.
2. Confirm the dashboard loads.
3. Open an enquiry.
4. Change lifecycle from `Lead` to `Prospect` and save.
5. Add a follow-up date and confirm it appears under Today's follow-ups when due.
6. Add an activity such as Call, WhatsApp or Email and confirm it appears in the timeline.
7. Use Convert to Student and confirm a Student ID such as `QY2026-0001` is created.
8. Confirm CSV export includes Student ID and Lifecycle Stage.
9. Submit a new website enquiry and confirm email + database + timeline entry all work.

## 5. Production release

Only after Preview tests pass, merge `v2-development` into `main` and verify:

- website enquiry form
- two enquiry emails
- D1 record
- `/admin.html`
- lifecycle and timeline
- student conversion
- CSV export

## Rollback

If Preview has a problem, do not merge to `main`. The production v2.3 release remains unchanged.
