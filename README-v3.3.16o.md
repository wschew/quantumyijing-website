# Quantum YiJing v3.3.16o — Affiliate Header + Admin Quick Link

## Changes
1. `/affiliate` now uses the standard Quantum YiJing logo asset:
   `/images/quantum-yijing-logo.png`
   instead of the missing `/images/logo.png`.

2. `/admin` gets an easy-access `Affiliate Programme` tab/link.
   It opens `/affiliate` in a new tab so the administrator does not lose the admin dashboard session.

## Install — easiest method
- Replace your project `affiliate.html` with `affiliate-v3.3.16o.html` (rename it to `affiliate.html`).
- Replace your project `admin.html` with `admin-v3.3.16o.html` (rename it to `admin.html`).

If you do not want to replace the full admin.html, use:
`admin-v3.3.16o-affiliate-programme-link-snippet.html`
and insert it immediately after the existing `Affiliates` link.

## No database work
- No SQL
- No D1 migration
- No payment logic changes
- No commission logic changes
- No payout logic changes
- No attribution logic changes

## Preview test
1. Open `/affiliate` and confirm the QY logo appears at the top-left beside the Quantum YiJing® name.
2. Open `/admin`.
3. Confirm the module navigation now contains:
   CRM & Follow-up | Students | Marketing | Sales & Commerce | Affiliates | Affiliate Programme | Affiliate Payouts
4. Click `Affiliate Programme`; `/affiliate` should open in a new browser tab.
