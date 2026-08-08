# Quantum YiJing v2.8 — Marketing CRM

## Purpose
v2.8 connects the v2.7 Digital Business Platform marketing attribution data to the Academy Operating System CRM.

## Prerequisites
- v2.7.x public website deployed
- v2.7 D1 migration already applied
- ENQUIRIES_DB binding configured in Preview and Production
- ADMIN_TOKEN configured in Preview and Production

## 1. Install code on v2-development
Copy the v2.8 update files into the repository while on `v2-development`.
Do not merge to `main` until Preview testing passes.

Suggested commit:
`Add v2.8 Marketing CRM and attribution analytics`

## 2. Run the D1 migration ONCE
Cloudflare → D1 → quantumyijing-enquiries → Console

Run `database/migrate-v2.8.sql` once.

Verification:
```sql
PRAGMA table_info(enquiry_attribution);
```
Confirm `utm_term` exists.

## 3. Preview test link
Replace the host with the newest Cloudflare Preview deployment:

`/lp/membership.html?utm_source=tiktok&utm_medium=social&utm_campaign=aug2026_membership&utm_content=membership_video&utm_term=yijing&aff=AFFTEST01`

Submit a test enquiry.

## 4. Verify D1 attribution
```sql
SELECT
  e.reference,
  e.name,
  a.marketing_source,
  a.utm_source,
  a.utm_medium,
  a.utm_campaign,
  a.utm_content,
  a.utm_term,
  a.affiliate_code,
  a.landing_page
FROM enquiries e
JOIN enquiry_attribution a ON a.enquiry_id=e.id
ORDER BY e.id DESC
LIMIT 5;
```

Expected for the test lead:
- utm_source: tiktok
- utm_medium: social
- utm_campaign: aug2026_membership
- utm_content: membership_video
- utm_term: yijing
- affiliate_code: AFFTEST01
- landing_page: /lp/membership.html

## 5. Verify Academy Operating System
Open `/admin` on the same Preview deployment.
The top bar should say `Academy Operating System · v2.8`.

Tabs:
- CRM & Follow-up
- Students
- Marketing

The CRM table shows Source and Campaign/Affiliate.
The person detail dialog shows attribution fields.
The Marketing tab shows channel, campaign, affiliate and landing-page analytics.

## 6. Production
Only after Preview testing passes:
- merge `v2-development` into `main`
- wait for Production deployment
- test `/admin` on quantumyijing.com
