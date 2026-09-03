# Quantum YiJing v3.3.5c — Payment Dialog Accounting Defaults

Scope: root Admin `admin.js` only.

## What it fixes

For a pending DOKU order, Record Payment / Settlement now opens with:
- Payment method: DOKU
- Provider: DOKU
- Payment status: Pending
- Verification: Unverified
- Gross amount: order total
- Provider fee: blank
- Net amount: blank
- Amount received in bank: blank
- Settlement status: Pending
- Settlement date: blank
- Receipt issuer: Quantum YiJing

A blank DOKU provider fee no longer causes Net Amount to auto-calculate to Gross Amount.

## Bank Transfer behavior

Bank Transfer defaults to:
- Provider fee: RM 0.00
- Net amount: Gross amount
- Bank received: blank until confirmed
- Settlement status: Pending

## External Platform behavior

External Platform defaults to:
- Provider/platform fee: blank
- Net amount: blank
- Bank received: blank
- Settlement status: Pending
- Receipt issuer: External Platform

## Install — Preview only

1. Replace the root `admin.js` with the supplied `admin.js`.
2. Commit as `v3.3.5c`.
3. Push to `v2-development`.
4. Test Preview using:
   - one DOKU order;
   - one Bank Transfer order;
   - one External Platform/manual test if desired.
5. Do not merge to Production until the three flows are confirmed.

No D1 migration is needed.
Do not modify DOKU notification/signature verification code.
