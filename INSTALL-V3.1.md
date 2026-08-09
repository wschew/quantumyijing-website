# Quantum YiJing v3.1 — Unified Payment & Accounting Foundation

## Purpose
v3.1 does NOT activate live SenangPay checkout yet.
It establishes one accounting model for:
- SenangPay
- Bank Transfer
- Google Play Books
- Cash / Manual
- Marketplace / Other

The system stores:
Gross Sale → Provider/Platform Fee → Net Amount → Bank Received

Customer receipt issuer is also recorded separately:
- Quantum YiJing
- External Platform
- Not Applicable

## Install
1. Stay on `v2-development`.
2. Replace the included files.
3. Run `database/migrate-v3.1.sql` in Cloudflare D1 ONCE only.
4. Commit:
   `Add v3.1 unified payment and accounting foundation`
5. Push Origin.
6. Wait for the green Preview deployment.
7. Open `/admin` and confirm `Academy Operating System · v3.1`.

## First tests
### Bank Transfer
- Order total RM 1,400
- Method: Bank Transfer
- Gross: 1,400
- Fee: 0
- Net: 1,400
- Bank received: 1,400
- Verification: Verified
- Receipt issuer: Quantum YiJing

### Google Play Books
Example:
- Gross sale: RM 100
- Platform fee: RM 30
- Net amount: RM 70
- Bank received: RM 70
- Status: External
- Verification: Reconciled
- Receipt issuer: External Platform

The dashboard should show Gross Sales, Provider Fees, Net Amount and Bank Received separately.

## Important
Receipt PDF generation/email is NOT activated in v3.1. The `receipts` table is created now as the foundation for the later automatic receipt module.
