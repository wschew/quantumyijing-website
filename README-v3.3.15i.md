# Quantum YiJing v3.3.15i — Record Payment Click Fix

Built from v3.3.15h.

No D1 migration is required.

Replace only:
- admin.html
- admin.js

## Root cause

v3.3.15h correctly removed the Payment & Accounting Records section.
That section also contained the `#newPaymentButton` element.

However, `admin.js` still executed:

`$('newPaymentButton').addEventListener(...)`

Because the element no longer existed, JavaScript initialization stopped at that line.
The delegated click handler for the Orders table was therefore never registered.

That is why `Record Payment` appeared on screen but clicking it did nothing.

## Fix

- The obsolete New Payment button binding is now optional/guarded.
- The Orders -> Record Payment delegated click handler is registered normally.
- Clicking Record Payment always refreshes the background payment data first.
- The exact order's Record Payment / Settlement dialog then opens.
- Existing v3.3.15f/h payment verification, manual hash override, receipt emails and Gross-only accounting design are unchanged.

## Test

1. Open Sales & Commerce.
2. Find test70 / QY-20260821-AE68AC.
3. Click Record Payment.
4. The Record Payment / Settlement dialog should open.
5. Confirm Gross Sale and payment evidence.
6. If gateway hash is unavailable, use the manual verification override.
7. Set Verification = Verified and Save.
8. Confirm customer receipt + QY accounting receipt.
