# Quantum YiJing® v3.3.3b

Password Reset PBKDF2 compatibility patch.

Problem:
- v3.3.3a fixed activation from 210000 to 100000 PBKDF2 iterations.
- `reset.js` still explicitly requested 210000.
- Cloudflare therefore returned HTTP 500 during password reset.

Fix:
- `reset.js` now uses 100000 iterations.
- The new password hash stores `password_iterations = 100000`.
- Existing sessions are revoked after successful password reset.

No SQL migration required.

Replace:
`functions/api/affiliate/auth/reset.js`

Suggested commit:
`v3.3.3b fix affiliate password reset PBKDF2`

After deployment, request a NEW password-reset email and use the NEW reset link.
