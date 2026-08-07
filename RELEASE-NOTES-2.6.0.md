# Quantum YiJing v2.6.0 — Student Management Phase 1

v2.6 extends QY-AOS from CRM intelligence into day-to-day student administration.

## New
- Dedicated Students module inside the private Academy Operating System.
- Student dashboard totals: Total, Registered, Active Students, Graduates and Alumni.
- Programme and country distribution summaries.
- Student search by Student ID, name, email, phone, country or programme.
- Student lifecycle and programme filtering.
- Student detail records linked back to the original CRM enquiry.
- Editable programme, lifecycle stage, enrolled date, graduated date and private student notes.
- Student changes recorded automatically in the shared CRM activity timeline.
- Student-specific Excel-compatible CSV export.
- Conversion from CRM lead to student continues to create a `QYYYYY-####` Student ID.

## Database
No new migration is required for v2.6. It uses the `students` and `crm_activities` structures introduced in v2.4. Prior migration order remains:

`v2.3 schema → migrate-v2.4.sql → migrate-v2.5.sql`
