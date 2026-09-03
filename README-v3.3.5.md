# Quantum YiJing v3.3.5 — Payment & Accounting Cleanup

This patch is intentionally limited to Admin Payment & Accounting.

DO NOT modify DOKU notification signature verification in this version.

## Files

1. `admin.js`
   - Complete replacement based on the uploaded current admin.js.
   - Removes SenangPay defaults from Record Payment.
   - Detects DOKU from the selected order.
   - Keeps bank received blank until settlement is actually recorded.
   - Uses the selected order currency instead of hard-coded MYR.
   - Adds separate Settlement Status handling.

2. `admin-payment-dialog-v3.3.5.html`
   - Replace only the existing `<dialog id="paymentDialog"> ... </dialog>` block in `admin.html`.

3. `functions-api-admin-paymentsave-v3.3.5.js`
   - Contains the validation-set changes and the replacement `savePayment(context)` backend function.
   - Do NOT replace the entire `functions/api/admin.js` file with this fragment.

4. `migrate-v3.3.5.sql`
   - Adds `settlement_status` and `reconciled_at`.
   - Normalizes legacy `verification_status='Reconciled'`.

## Deployment order — Preview first

1. Make a backup/commit of the current stable v3.3.4c.
2. Apply `migrate-v3.3.5.sql` to the PREVIEW D1 database.
3. Replace the payment dialog block in `admin.html`.
4. Replace your current `admin.js` with the supplied `admin.js`.
5. In `functions/api/admin.js`:
   - update payment validation sets as shown;
   - replace only `savePayment(context)` with the supplied function.
6. Commit as v3.3.5-preview.
7. Deploy Preview.
8. Test:
   - Existing DOKU order opens with Payment Method = DOKU and Provider = DOKU.
   - Bank Received is blank by default.
   - Settlement Status defaults to Pending.
   - Saving a DOKU payment does not change DOKU signature/notification code.
   - Bank Transfer can be recorded manually.
   - External Platform + Google Play Books can be recorded.
   - Currency follows the order.
9. Only after successful Preview testing, apply the migration/code to Production.

## Important accounting behavior

Payment Status = customer/payment event.
Verification = whether the payment itself is verified.
Settlement Status = whether the provider payout/bank receipt has been settled/reconciled.

A DOKU payment can therefore be:
- Payment Status: Paid
- Verification: Verified
- Settlement Status: Pending
- Bank Received: blank

Later, after bank settlement:
- Settlement Status: Reconciled
- Provider Fee: actual fee
- Net Amount: actual net
- Bank Received: actual bank amount
- Settlement Date: actual settlement date
