# Quantum YiJing v3.3.6a — Backend Route Repair

This repair is based on the current uploaded `functions/api/admin.js`.

## Cause fixed
The v3.3.6 backend file ended immediately after `savePayment(context)`.
It was missing:
- `makeOrderReference()`
- `createOrder(context)`
- `export async function onRequest(context)`

Without `onRequest`, Cloudflare Pages did not register `/api/admin`, so requests
such as `/api/admin?action=stats` fell through to the website HTML page. The Admin
browser then attempted to parse `<!doctype ...>` as JSON.

## Install
1. Replace ONLY:
   `functions/api/admin.js`
   with the supplied `admin.js`.
2. Do not change root `admin.js` or `admin.html`.
3. No D1 migration is required.
4. Commit as `v3.3.6a backend route repair`.
5. Push to `v2-development`.
6. Wait for Preview deployment.

## First verification
Open this in the Preview browser:
`/api/admin?action=stats`

Expected:
- If not logged/authenticated: JSON such as `{"error":"Unauthorized"}`.
- If the browser request includes valid admin authorization through the Admin UI,
  the Admin dashboard should load normally.

You should NOT see the homepage HTML at `/api/admin?action=stats`.

## Then test
1. Open Preview `/admin`.
2. Confirm People & Enquiries loads.
3. Confirm Sales & Commerce orders load.
4. Then resume v3.3.6 partial-payment test:
   - RM1,400 test order
   - Bank Transfer
   - This Payment Amount = RM500
   - Payment Status = Paid
   - Verification = Verified
   Expected after save:
   - Paid to Date = RM500
   - Balance Due = RM900
   - Order status = Partially Paid

## Important
- No DOKU notification/signature code is changed.
- No D1 data is changed by this repair.
