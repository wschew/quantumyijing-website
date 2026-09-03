# Quantum YiJing v3.3.5b — Pending DOKU Display Fix

Scope: front-end Admin display only.

## What it fixes
Older DOKU payment records store numeric zeros because `provider_fee`, `net_amount`, and `bank_received_amount` are NOT NULL in the existing D1 schema.

For a record that is all of:
- Provider = DOKU
- Payment status = Pending
- Verification = Unverified
- Settlement status = Pending

the Admin Payment & Accounting table now displays:
- Gross = actual gross amount
- Fee = —
- Net = —
- Bank received = —

This is display-only. It does not change D1 data and does not touch DOKU notification/signature code.

## Install
1. Replace the root `admin.js` with the supplied `admin.js`.
2. Commit as `v3.3.5b`.
3. Push to `v2-development`.
4. Test Cloudflare Preview.
5. Expected DOKU pending rows: `RM 1400.00 | — | — | —`
6. Expected Bank Transfer test row remains numeric, e.g. `RM 1400.00 | RM 0.00 | RM 1400.00 | RM 1400.00`.

Do not run another SQL UPDATE for the pending DOKU zeros.
Do not merge to Production until Preview is verified.
