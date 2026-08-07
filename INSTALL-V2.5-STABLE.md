# Quantum YiJing v2.5 Stable — Installation / Recovery Guide

## Purpose
This is the stable v2.5 CRM Intelligence & Follow-up release.

## Required Cloudflare configuration
Both Preview and Production must contain:
- Secret: `RESEND_API_KEY`
- Secret: `ADMIN_TOKEN`
- D1 binding: `ENQUIRIES_DB` -> `quantumyijing-enquiries`

## Database migration order — IMPORTANT
The D1 database must contain the v2.4 schema before v2.5 features can run.

Required order:
1. Base v2.3 schema
2. `database/migrate-v2.4.sql`
3. `database/migrate-v2.5.sql`

If v2.4 migration has already been applied, do NOT run it again.
If v2.5 migration has already been applied, do NOT run it again.

### Verification queries
Run these in Cloudflare D1 Console:

```sql
SELECT lifecycle_stage, last_contacted_at FROM enquiries LIMIT 1;
```

```sql
SELECT COUNT(*) AS total_students FROM students;
```

```sql
SELECT COUNT(*) AS total_activities FROM crm_activities;
```

```sql
PRAGMA table_info(enquiries);
```

The enquiries table should include v2.5 fields:
- `priority`
- `next_action`
- `tags`
- `contact_preference`

## Deploy
1. Work on branch `v2-development`.
2. Replace the update files in the repository.
3. Commit: `Finalize v2.5 stable CRM intelligence release`
4. Push origin.
5. Test the Cloudflare Preview deployment at `/admin`.
6. Confirm API calls return HTTP 200.
7. Merge to `main` only after Preview testing passes.

## Stable verification checklist
- Admin login works.
- Existing enquiries load.
- Priority saves and survives refresh.
- Next Action saves and survives refresh.
- Tags save and survive refresh.
- Contact Preference saves and survives refresh.
- Follow-up controls work.
- CSV export works.
- New enquiry sends both emails.
- New enquiry appears in D1 / CRM.
