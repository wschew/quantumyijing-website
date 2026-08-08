# Quantum YiJing® v3.0 — Actual Code Package

## Your current database state
During setup, the v3.0 product columns were already added to D1 and YJ12 was inserted successfully. Therefore **do not run `database/migrate-v3.0.sql` again on this database**.

## Install code
1. Stay on `v2-development`.
2. Copy this update package into the repository and replace matching files.
3. Optional but recommended for the current YJ12 record: run `database/fix-yj12-content-current.sql` once. It only standardizes YJ12 bilingual text; it does not change schema.
4. Commit with: `Add actual v3.0 dynamic product funnel`
5. Push origin and wait for the Cloudflare Preview deployment.

## First functional test
Open:

`/product/yj12-yijing-science-of-prediction?utm_source=facebook&utm_medium=paid_social&utm_campaign=yj12_sep2026&aff=AFFTEST01`

Expected page:
- YJ12 Yijing: Science of Prediction
- 26–27 September 2026
- 10:00 AM – 5:00 PM
- Live via Zoom
- Master Chew Wai Soon
- YJ12 banner artwork
- RM1,400 early-bird price through 31 August 2026
- RM1,800 normal fee
- EN / 中文 switch
- Registration-interest form

## Funnel test
Submit one test registration. Then verify:
- CRM: enquiry appears.
- Marketing: Facebook / paid_social / yj12_sep2026 / AFFTEST01 appears.
- Sales & Commerce: a Pending YJ12 order is created at the effective price.

## Fresh v2.9 installation only
`database/migrate-v3.0.sql` is retained for a future untouched v2.9 database. It must never be rerun after the v3.0 columns exist.

## Optional attribution columns
The code is backward-compatible with the v2.9 `enquiry_attribution` schema. The optional script `database/optional-v3.0-product-attribution.sql` adds product_id/product_slug if desired later. Do not run it if those columns already exist.

## Payment
v3.0 creates Pending orders only. It does not send customers to SenangPay. Live payment integration is reserved for v3.1.
