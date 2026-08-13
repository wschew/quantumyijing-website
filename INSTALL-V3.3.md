# Quantum YiJing® v3.3 — Installation Guide

## Scope

v3.3 establishes the database foundation for the YJ12 Affiliate Programme and the new Registration/Payment workflow.

This package does **not yet change the public website or Admin UI**. It prepares D1 so those features can be added safely in the next steps.

## Important

Install on **Preview D1 first**.

Do not run `migrate-v3.3.sql` more than once on the same database because it uses `ALTER TABLE ... ADD COLUMN` statements.

## Step 1 — Copy the migration file

Place:

`database/migrate-v3.3.sql`

inside the existing Quantum YiJing website project.

The project should then contain, among others:

- `database/migrate-v3.2.sql`
- `database/migrate-v3.2.1.sql`
- `database/migrate-v3.3.sql`

## Step 2 — Commit to the development branch

Use the existing `v2-development` branch / Preview workflow.

Suggested commit message:

`v3.3 affiliate and registration database foundation`

## Step 3 — Open Cloudflare D1 Preview database

In Cloudflare:

1. Open the Quantum YiJing project.
2. Open D1.
3. Select the **Preview** database, not Production.
4. Open the SQL Console.

## Step 4 — Run migration

Open `database/migrate-v3.3.sql`.

Copy the whole file and paste it into the Preview D1 SQL Console.

Run it once.

## Step 5 — Expected result

The migration should create these tables:

- `affiliates`
- `affiliate_commissions`
- `affiliate_payouts`
- `affiliate_payout_items`
- `affiliate_settings`

It also adds affiliate/registration fields to `orders`.

The final verification queries should show:

### Affiliate settings

- programme_enabled = 1
- default_commission_rate = 20
- referral_days = 30
- commission_hold_days = 14
- payout_frequency = Monthly
- customer_name_visible_to_affiliate = 1

### YJ12

- affiliate_enabled = 1
- commission_type = percentage
- commission_value = 20 (unless an existing value was already configured)

## Step 6 — Stop after Preview verification

Do **not** run this on Production yet.

Send the SQL Console result/screenshots to ChatGPT for verification.

After successful verification, the next development step is:

1. Affiliate public application page
2. Affiliate Admin management
3. Affiliate code generation
4. Referral attribution
5. Separate YJ12 Register & Pay form
6. Commission ledger
7. Month-end payout workflow
