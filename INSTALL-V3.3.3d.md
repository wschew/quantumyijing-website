# Quantum YiJing® v3.3.3d — Unified Header Branding

This patch fixes the inconsistency where some affiliate pages showed only the QY logo and other affiliate admin pages showed only the Quantum YiJing® wording.

## New standard

All affiliate-related headers now use:

`[QY Logo] Quantum YiJing® | Section Name`

Examples:
- [Logo] Quantum YiJing® | Affiliate Portal
- [Logo] Quantum YiJing® | Affiliate Portal Admin
- [Logo] Quantum YiJing® | Affiliate Admin
- [Logo] Quantum YiJing® | Affiliate Detail

Logo asset:
`/images/quantum-yijing-3d-logo.png`

## Replace

- affiliate-login.html
- affiliate-activate.html
- affiliate-forgot.html
- affiliate-reset.html
- affiliate-dashboard.html
- admin-affiliate-portal.html
- admin-affiliates.html
- admin-affiliate-detail.html
- affiliate-portal.css

## Append

Append the contents of:
- `admin-affiliates-v3.3.3d-additions.css`
to the bottom of `admin-affiliates.css`

Append the contents of:
- `admin-affiliate-detail-v3.3.3d-additions.css`
to the bottom of `admin-affiliate-detail.css`

## No database/API changes

No SQL migration.
No JavaScript changes.
No Cloudflare environment-variable changes.

Suggested commit:
`v3.3.3d unify affiliate header branding`
