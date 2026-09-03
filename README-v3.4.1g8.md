# Quantum YiJing® v3.4.1g8
## Affiliate Password Reset Email Diagnostics + Recovery

### Root cause
The existing forgot-password function calls:

`await sendEmail(...)`

but ignores the returned result.

`sendEmail()` does NOT throw when Resend rejects the email. It returns:
- `{ok:true}` on success
- `{ok:false,status:...}` on failure
- `{skipped:true}` when `RESEND_API_KEY` is absent

Therefore the page can show the generic success message even when no reset email was accepted.

### What g8 changes
- Captures `sendEmail()` result.
- Writes clear Cloudflare logs for:
  - generic ineligible/nonexistent account response
  - missing RESEND_API_KEY
  - Resend rejection
  - successful email acceptance
- Invalidates older unused password-reset tokens before creating a fresh token.
- Keeps the public response generic (`{ok:true}`) to avoid account enumeration.
- Adds the raw reset URL as fallback text in the email.

### What g8 does NOT change
- login.js
- activate.js
- _auth.js hashing
- Affiliate accounting
- Coach accounting
- Month-end payout processing
- D1 schema

No migration required.

### Install
Replace only:

`functions/api/affiliate/auth/forgot.js`

(or whatever current filename contains the forgot-password POST handler)

with the g8 version.

Commit:
`v3.4.1g8 — Affiliate password reset email diagnostics`

Deploy Preview.

### Test
1. Open `/affiliate-forgot`
2. Enter the QY-A0004 email.
3. Click Send Reset Link.
4. Open Cloudflare Functions logs immediately.
5. Search for one of:
   - `affiliate forgot password: reset email accepted`
   - `affiliate forgot password: reset email failed`
   - `affiliate forgot password: email skipped`
6. If accepted, check Inbox + Spam.
7. If failed, send the exact Cloudflare log line/status so the next fix can target the Resend rejection precisely.
