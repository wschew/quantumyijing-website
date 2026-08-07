# Quantum YiJing v2.5 — CRM Intelligence & Follow-up

## Before deployment
1. Confirm GitHub Desktop is on `v2-development` and has no local changes.
2. Copy the v2.5 update files into the repository and replace existing files.
3. In Cloudflare D1 open `quantumyijing-enquiries` → Console.
4. Run `database/migrate-v2.5.sql` **once**.
5. Do not change `RESEND_API_KEY`, `ADMIN_TOKEN`, or `ENQUIRIES_DB`.

## Commit
Use:
`Add v2.5 CRM intelligence and follow-up tools`

Push to `v2-development` and wait for Cloudflare Preview.

## Preview tests
- Open `/admin.html` on the latest Preview URL.
- Existing records should load.
- Open a record and set Priority, Preferred contact, Next action, Tags and Follow-up date.
- Save and reopen the record.
- Test Tomorrow / +3 days / +7 days / Mark contacted.
- Confirm the activity timeline records the action.
- Test Priority filter and CSV export.
- Submit a new website enquiry and confirm the two emails and database record still work.

Only merge into `main` after all Preview tests pass.
