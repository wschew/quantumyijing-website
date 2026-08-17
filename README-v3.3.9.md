# Quantum YiJing v3.3.9 — Affiliate Portal Activation Email

Scope: Affiliate activation email presentation only.

What changes:
- Same Quantum YiJing branded email format as v3.3.8.
- English and Chinese sections separated.
- Affiliate Code shown clearly.
- Prominent activation buttons.
- 7-day expiry shown in both languages.
- Raw activation URL included as fallback.
- Standard QY footer and sender.

What does NOT change:
- Activation token generation.
- SHA-256 token hashing.
- 7-day token expiry.
- Approved-affiliate validation.
- Portal activation/login logic.
- D1 schema.
- Payment/accounting.
- DOKU integration.

Install — Preview only:
1. Replace `functions/api/admin/affiliate-portal-activation.js`.
2. Commit `v3.3.9 standardize affiliate activation email`.
3. Deploy Preview.
4. Send a fresh activation email to an Approved test affiliate.
5. Verify email appearance before clicking the activation link.
