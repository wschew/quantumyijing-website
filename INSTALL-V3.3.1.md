# Quantum YiJing® v3.3.1 — Preview Installation Guide

Install in Preview D1 only. Because Cloudflare D1 previously rejected one large batch, run the migration in small sections.

## Step 1 — Affiliate membership fields
Copy section A from `database/migrate-v3.3.1.sql` and execute once.

Verify with:
```sql
PRAGMA table_info(affiliates);
```

Expected new fields:
- membership_started_at
- membership_expires_at
- last_renewed_at
- renewal_status
- renewal_reminder_30d_sent_at
- renewal_reminder_7d_sent_at
- expiry_notice_sent_at

## Step 2 — Customer attribution
Copy section B and execute once.

Verify with:
```sql
SELECT name
FROM sqlite_master
WHERE type='table' AND name='affiliate_customer_attribution';
```

Expected: `affiliate_customer_attribution`

## Step 3 — Programme settings
Copy section C and execute once.

Verify with:
```sql
SELECT id, programme_enabled, default_commission_rate, referral_days,
       affiliate_membership_months, customer_attribution_months,
       renewal_reminder_30_days, renewal_reminder_7_days, expiry_notice_enabled
FROM affiliate_settings
WHERE id = 1;
```

Expected defaults:
- affiliate_membership_months = 12
- customer_attribution_months = 12
- renewal_reminder_30_days = 1
- renewal_reminder_7_days = 1
- expiry_notice_enabled = 1

Do not install on Production until Preview has been verified.
