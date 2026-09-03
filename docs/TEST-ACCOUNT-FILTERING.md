# Permanent QA Affiliate Handling

`affiliates.is_test_account = 1` identifies internal QA/test affiliates.

Business-facing reports, rankings, KPIs, payout totals and affiliate sales analytics must exclude
test affiliates by default.

When an analytics query already joins `affiliates a`, add:

```sql
AND COALESCE(a.is_test_account,0)=0
```

High-priority places:
- Affiliate KPI cards
- Monthly new affiliates
- Monthly affiliate funnel
- Monthly active affiliates
- Monthly affiliate sales
- Affiliate sales by country
- Top 10 affiliates
- Commission totals
- Payout generation
- Affiliate exports

Do NOT exclude QA affiliates from:
- Admin Affiliate Detail
- Affiliate login/authentication
- Affiliate dashboard
- Product-link generation

Existing accounts:
- QY-A0002: permanent QA affiliate; keep active.
- QY-A0001: legacy test affiliate; archive and disable, but do not physically delete yet.
