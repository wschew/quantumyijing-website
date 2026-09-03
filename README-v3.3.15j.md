# Quantum YiJing v3.3.15j — Payment Verification UI Cleanup

Built directly from tested v3.3.15i.

No D1 migration is required.

Replace only:
- admin.html
- admin.js

## Change
Removed the two redundant payment-verification explanatory statements:
1. The settlement-values reconciliation notice above Settlement / payment date.
2. The Gross Sale / Provider Fee / Net Settlement / Amount Received in Bank reconciliation notice near the Save button.

## Preserved
- Generic payment workflow
- YJ12 payment workflow
- Record Payment click fix
- Manual verification override when gateway hash verification is unavailable
- Gross Sale verification
- Customer receipt email
- QY accounting receipt email
- Receipt/payment dates
- Existing payment/accounting logic

No payment behavior or database logic was intentionally changed.
