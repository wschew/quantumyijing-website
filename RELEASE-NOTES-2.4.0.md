# Quantum YiJing International Academy — v2.4.0
## Academy Operating System (QY-AOS) — Phase 1

### New

- Lead-to-student lifecycle: Lead → Prospect → Registered → Active Student → Graduate → Alumni
- Today's follow-up task panel with overdue highlighting
- Student conversion from an existing enquiry
- Automatic Student ID generation (`QY<year>-####`)
- Per-person activity timeline
- Manual timeline activities: Call, WhatsApp, Email, Meeting, Brochure Sent, Payment, Course and Note
- Lifecycle distribution dashboard
- Student-aware search and CSV export
- Activity history automatically records CRM changes, follow-up changes and student conversion
- New enquiries automatically create an initial timeline event

### Existing features retained

- Resend bilingual enquiry emails
- Cloudflare D1 enquiry storage
- ADMIN_TOKEN secured dashboard
- Search/filtering
- Notes and follow-up dates
- Excel-compatible CSV export
- Cloudflare Preview → Production workflow

### Database migration required

Run `database/migrate-v2.4.sql` once against the existing `quantumyijing-enquiries` D1 database before deploying this version.

### No new secret required

Continue using the existing:

- `RESEND_API_KEY`
- `ADMIN_TOKEN`
- `ENQUIRIES_DB`
