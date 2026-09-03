# Quantum YiJing v3.3.15k — Safe Payment Verification UI Cleanup

Built directly from the tested v3.3.15i baseline.

No D1 migration is required.

Replace ONLY:
- admin.html
- admin.js

This version removes exactly two UI statements and nothing else:
1. Settlement values reconciliation explanation above Settlement / payment date.
2. Gross Sale / Provider Fee / Net Settlement / Bank Received explanation above the Save button.

Preserved:
- full /admin Academy Operating System page
- Sales & Commerce dashboard
- Record Payment button
- Payment verification dialog
- Gross Sale field
- Settlement/payment date
- Customer receipt issuer
- Accounting notes
- manual gateway hash override
- Save Payment Record / Close buttons
- tested v3.3.15i payment and receipt workflow
