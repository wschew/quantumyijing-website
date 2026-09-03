# Quantum YiJing v3.3.16d — Verified Payment Post-Processing Fix

Install this AFTER v3.3.16c.

No new D1 migration is required.

## Replace / add
- admin.html
- admin.js
- generic-payment.html
- functions/api/admin/generic-payment-verify.js
- functions/api/admin/payment-verify.js

Keep all v3.3.16b / v3.3.16c affiliate payout files and migrations.

## What this fixes

### 1. Already Verified payment could miss downstream actions
Previously, Admin `paymentsave` only called the verifier when the backend returned
`shouldVerify=true`. If a payment row had already become `Paid + Verified` but its
receipt/commission post-processing had not run, reopening it showed "Already verified"
and no manual override checkbox, but saving it did not repair the missing downstream work.

v3.3.16d always calls the idempotent verifier whenever the Admin saves a payment with:
- Payment Status = Paid
- Verification = Verified

The verifier can safely complete missing post-processing for an already Verified payment.

### 2. Final verified receipts use their own notification keys
The final customer receipt and QY accounting receipt now use:
- `CustomerVerifiedReceipt`
- `InternalAccountingReceipt`

They are separate from gateway/payment-received notices, so a previous payment notice
cannot suppress the final verified receipt.

### 3. Affiliate QA commission
For the Preview-only generic affiliate QA order created by v3.3.16c:
- affiliate code is preserved
- commission creation remains idempotent
- Paid + Verified processing creates one Approved affiliate commission
- expected RM10 QA sale at 20% = RM2 commission

### 4. Generic Payment visual cleanup
The generic payment page now uses the same modern sans-serif family as the current QY site
instead of the serif appearance seen in the test screenshot.
The RM10 / purpose URL prefill is also made robust.

## Retest existing test72
You do NOT need to pay again.

1. Deploy v3.3.16d.
2. Open `/admin`.
3. Locate test72 / QY-20260822-8B5759.
4. Click Record Payment.
5. It should show Paid + Verified and may say already verified.
6. Click Save Payment Record once.
7. v3.3.16d will run the idempotent post-verification processor even though it was already Verified.
8. Expected:
   - Customer QY verified payment receipt email
   - QY accounting verified receipt email
   - payment accounting_eligible = YES
   - QY-A0002 commission created as Approved
   - RM10 sale / 20% / RM2 commission
9. Reload Test Affiliate2 detail / portal.
10. Reload Affiliate Monthly Payout for August 2026.
