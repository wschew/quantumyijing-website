# Quantum YiJing® v3.4.1g9
## Affiliate Duplicate-Email Login + Forgot Password Fix

### Confirmed root cause

The Preview D1 database contains more than one Affiliate record using the same email address.

Example confirmed:

- QY-A0001 — Archived — portal disabled
- QY-A0004 — Approved — portal enabled

The old Login and Forgot Password functions used:

WHERE lower(email)=lower(?)
LIMIT 1

With no status filter and no ordering, D1 could return the older Archived record first.

That caused:

- Login → `Invalid email or password`
- Forgot Password → generic success page but no email

even though QY-A0004 was correctly Approved and activated.

### v3.4.1g9 fix

Both lookup functions now explicitly select only the current active Affiliate account:

WHERE lower(email)=lower(?)
  AND status='Approved'
  AND COALESCE(portal_enabled,0)=1
ORDER BY id DESC
LIMIT 1

This preserves Archived historical Affiliate records while ensuring authentication selects the valid current account.

### Files changed

Replace only:

- `functions/api/affiliate/auth/login.js`
- `functions/api/affiliate/auth/forgot.js`

### What is NOT changed

No changes to:

- `_auth.js`
- `activate.js`
- Admin activation recovery
- Affiliate accounting
- Coach accounting
- commissions
- payouts
- month-end Excel import
- D1 schema

No migration is required.

### Install

1. Replace the two files above.
2. Commit:
   `v3.4.1g9 — Affiliate active-account lookup fix`
3. Deploy Preview.

### Test order

#### Test A — direct login
First try `/affiliate-login` using the password previously created for QY-A0004.

Expected:
- successful sign-in
- Affiliate Portal opens
- `last_login_at` is populated for QY-A0004

#### Test B — Forgot Password
If the password is still unknown/wrong:

1. Open `/affiliate-forgot`
2. Enter the QY-A0004 email
3. Send reset link
4. Expected Cloudflare log:
   `affiliate forgot password: reset email accepted`
5. Reset email should arrive
6. Open newest reset link and create a new password
7. Login with the new password

### Important

Do not delete QY-A0001 merely to fix authentication.
Keeping Archived historical records is appropriate; the application should select the valid Approved account correctly.
