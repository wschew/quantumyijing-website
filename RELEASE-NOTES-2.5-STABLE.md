# Quantum YiJing v2.5 Stable

## CRM Intelligence & Follow-up
Stable release validated on Cloudflare Pages + Functions + D1.

### Included
- CRM Intelligence dashboard
- Lead priority: Hot / Warm / Normal / Low
- Preferred contact method
- Next Action field
- Tags
- Follow-up intelligence and quick actions
- Student lifecycle integration inherited from v2.4
- D1-backed enquiry records
- Admin-token protected dashboard
- CSV / Excel-compatible export
- Resend email workflow retained

### Stability note
v2.5 depends on the v2.4 D1 migration. The required database order is:

`v2.3 schema -> migrate-v2.4.sql -> migrate-v2.5.sql`

A missing v2.4 migration causes the v2.5 statistics API to return HTTP 500 because lifecycle/student/activity structures are absent.
