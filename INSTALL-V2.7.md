# Quantum YiJing® v2.7 — Digital Business Platform / Marketing Foundation

## Before you start
- Work on `v2-development` only.
- Confirm v2.6 Stable is already working.
- Keep `RESEND_API_KEY`, `ADMIN_TOKEN` and `ENQUIRIES_DB` unchanged.
- v2.7 does **not** activate SenangPay live checkout yet.

## 1. Copy the update files
Extract the v2.7 update package into the repository and replace matching files.

## 2. Run the D1 migration once
Cloudflare → D1 → `quantumyijing-enquiries` → Console.
Run `database/migrate-v2.7.sql`. If the Console rejects a large multi-statement block, execute it table-by-table.

Verification:
```sql
SELECT name FROM sqlite_master WHERE type='table' AND name IN ('enquiry_attribution','content_items','products','campaigns','orders','order_items','payments');
```
You should see seven table names.

## 3. Preview test
Commit to `v2-development`, push, wait for Cloudflare Preview, then test:
- `/events.html`
- `/promotions.html`
- `/news.html`
- `/products.html`
- `/lp/membership.html?utm_source=tiktok&utm_medium=social&utm_campaign=membership_test&aff=AFFTEST01`
- Submit the landing-page enquiry and confirm both emails arrive.

Verify attribution:
```sql
SELECT e.reference, e.name, a.marketing_source, a.utm_source, a.utm_campaign, a.affiliate_code, a.landing_page
FROM enquiries e JOIN enquiry_attribution a ON a.enquiry_id=e.id
ORDER BY e.id DESC LIMIT 5;
```
For the test link, expect TikTok / membership_test / AFFTEST01 / `/lp/membership.html`.

## 4. SenangPay
No merchant key is required for v2.7. Live SenangPay checkout will be integrated in a later commerce release. When enabled, store the secret as a Cloudflare encrypted secret, never in HTML/JS/GitHub.

## 5. Legal pages
The included legal pages are operational templates, not a substitute for legal advice. Have Malaysian counsel review them before major paid advertising, international commerce or high-volume data collection.

## Suggested commit
`Add v2.7 Digital Business Platform marketing foundation`
