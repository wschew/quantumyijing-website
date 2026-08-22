# Quantum YiJing v3.3.16e — Stable Payment Verification + Affiliate Post-Hook

This version fixes the v3.3.16d HTTP 500 regression.

## Root cause
v3.3.16d introduced new notification type values:
- CustomerVerifiedReceipt
- InternalAccountingReceipt

But the existing D1 table has this CHECK constraint:

notification_type IN ('CustomerReceipt','InternalPaymentNotice')

Therefore the new values can violate the D1 CHECK constraint and generate HTTP 500.

## Design correction
v3.3.16e does exactly what the user requested:

**Do not rewrite the proven generic-payment verification routine.**

It restores the v3.3.15k payment save + generic verification + receipt routine.

Affiliate commission creation is now a separate NON-BLOCKING post-hook that runs only
AFTER the proven payment verification and both QY receipt emails have completed.

Therefore:
- Payment verification cannot be broken by affiliate logic.
- Customer receipt cannot be broken by affiliate logic.
- QY accounting receipt cannot be broken by affiliate logic.
- Affiliate commission failure is reported as a warning instead of returning HTTP 500.

## No new D1 migration
No migration is required.

## Replace
- admin.html
- admin.js
- functions/api/admin/payment-verify.js
- functions/api/admin/generic-payment-verify.js

Keep:
- v3.3.16b affiliate payout/email files
- v3.3.16c affiliate attribution / generic QA fields
- v3.3.16d standardized generic-payment.html

## Retest test73
No new DOKU payment is needed initially.

1. Deploy v3.3.16e.
2. Open Sales & Commerce.
3. Find test73 / QY-20260822-840C66.
4. Click Record Payment.
5. Set/confirm:
   - Payment status = Paid
   - Verification = Verified
   - Gross sale = RM15.00
   - Date = 22/08/2026
6. If the manual override box appears because the hash is unavailable, independently verify DOKU evidence and tick it.
7. Click Save Payment Record.
8. Expected:
   - no HTTP 500
   - customer QY receipt sent
   - QY accounting receipt sent
   - Paid + Verified + Accounting Eligible
   - affiliate commission post-hook attempts QY-A0002 commission creation
9. Reload Test Partner2 affiliate dashboard/detail.
10. If affiliate commission still does not appear, the Admin success message will show the exact affiliate commission SQL/schema warning without damaging the payment workflow.
