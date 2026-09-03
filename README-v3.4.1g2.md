# Quantum YiJing v3.4.1g2

Tiny corrective patch for v3.4.1g1.

## Fix
Corrects the two JavaScript regular expressions in:
`functions/api/admin/coach-payouts.js`

- Payout month validation now accepts `YYYY-MM`, e.g. `2026-08`.
- Payment date validation now accepts `YYYY-MM-DD`.

## Installation
If the v3.4.1g1 SQL migration was already run successfully:
1. DO NOT run another SQL migration.
2. Replace only `functions/api/admin/coach-payouts.js` with this file.
3. Commit/push and deploy Preview.
4. Load QY-C01 / August 2026 again.
5. Confirm the MYR 6 eligible item appears.
6. Create Draft Payout.

The supplementary same-month payout rule from v3.4.1g1 is retained unchanged.
