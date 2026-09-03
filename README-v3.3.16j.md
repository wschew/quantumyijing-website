# Quantum YiJing v3.3.16j — Affiliate UX, Attribution, Compliance & T&C Cleanup

Baseline: tested v3.3.16i.

## IMPORTANT — Preview first
Run `migrate-v3.3.16j.sql` on Preview D1 before deploying the JS/API changes.

## Replace
- admin-affiliate-payouts.html
- admin-affiliate-payouts.css
- admin-affiliate-payouts.js
- affiliate-dashboard.html
- affiliate-dashboard.js
- admin-affiliate-detail-v3.3.4c.js
- functions/api/admin/payment-verify.js
- functions/api/admin/generic-payment-verify.js
- functions/api/admin/affiliate-payout-candidates.js
- functions/api/admin/affiliate-payout-create.js

## Add
- functions/api/affiliate/compliance.js
- functions/api/admin/affiliate-attribution-compliance.js
- affiliate-v3.3.16j.js
- affiliate-v3.3.16j.css
- affiliate-v3.3.16j-form-snippet.html
- migrate-v3.3.16j.sql

## One small manual integration
The original public Affiliate Application HTML was not included in the later incremental packages.
Open the current `affiliate.html` in your repository and insert the contents of:
`affiliate-v3.3.16j-form-snippet.html`
inside the existing application `<form>`, immediately before its Submit/Application button.

Do NOT replace the existing application submission function.
The v3.3.16j add-on saves compliance/T&C metadata separately, preserving the existing working application workflow.

## Changes

### 1. Payout/Reconciliation typography
Font sizes are normalized to the other QY admin pages.

### 2. 12-month Customer Attribution
On a qualifying affiliate payment verification:
- first qualifying customer email creates an Active 12-month attribution;
- subsequent purchases do NOT reset the 12-month clock;
- an active attribution remains with the original affiliate;
- after expiry, a later qualifying referral may create/reassign a new 12-month period.

The existing Customer Attributions table is populated by the v3.3.16j admin-detail add-on.

### 3. Preview QA card removed
The RM10 Preview QA card is removed from individual affiliate dashboards.
Normal Generic Affiliate Payment and normal product links remain.

### 4. T&C / payout policy
Application requires acceptance of Terms version `QY-AFF-2026-08-V1`.

Normal payout:
- previous calendar month's eligible commissions
- normally paid during days 1–7 of following month.

Live course:
- commission remains pending until the live course has been conducted;
- it enters the course month's payout cycle.
Example:
customer pays 17 Aug 2026 for course on 26 Sep 2026
→ commission becomes payout-eligible after 26 Sep
→ normally paid 1–7 Oct 2026.

The payout candidate/create APIs now enforce that live-course timing using `products.starts_on`.

### 5. Nationality / identification
Application add-on requires:
- Nationality
- Identification Type
- Identification Number
- Malaysian → NRIC / MyKad
- Non-Malaysian → Passport / National ID

Full ID is stored only in the restricted compliance table.
Routine admin display returns only a masked form ending in the last four characters.

### 6. Terms audit
Stored:
- terms_version
- terms_accepted_at
- approximate request country
- identification hash + masked last four

## Test sequence
1. Apply Preview D1 migration.
2. Test a fresh affiliate application and verify T&C/ID fields.
3. Load that affiliate in Admin Affiliate Detail; confirm masked compliance data.
4. Make one affiliate-attributed verified sale with a NEW customer email.
5. Reload Admin Affiliate Detail → Customer Attributions; confirm Active row with 12-month expiry.
6. Confirm Preview QA card is gone from Affiliate Portal.
7. Check Affiliate Payouts typography.
8. For live-course timing, load payout month before course date: commission should not be payable.
9. After course date, load course month: commission becomes eligible.
