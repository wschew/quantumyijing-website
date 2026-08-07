# Quantum YiJing v2.6 — Student Management Phase 1

## Prerequisite
v2.5 Stable must already be working. The D1 database must have both prior migrations applied in this order:

1. `database/migrate-v2.4.sql`
2. `database/migrate-v2.5.sql`

v2.6 does **not** require a new database migration. It uses the existing `students` and `crm_activities` tables created by v2.4.

## Installation
1. Make sure GitHub Desktop is on `v2-development`.
2. Extract the v2.6 update package into the repository root and replace matching files.
3. Commit with: `Add v2.6 Student Management Phase 1`
4. Push origin.
5. Wait for the Cloudflare Preview deployment.
6. Open the new Preview URL and visit `/admin`.
7. Log in with the existing `ADMIN_TOKEN`.
8. Use the new **Students** tab to test student management.

## Preview test checklist
- CRM & Follow-up tab still works.
- Students tab opens.
- Existing converted students appear.
- Student totals and programme/country charts load.
- Search and lifecycle filters work.
- Student record opens and saves Programme, Lifecycle, Enrolled Date, Graduated Date and Private Notes.
- Changes appear in the activity timeline.
- Student CSV export downloads correctly.
- Converting a CRM lead to a student causes the student to appear in the Students module.

Do not merge into `main` until Preview tests pass.
