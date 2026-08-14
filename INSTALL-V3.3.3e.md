# Quantum YiJing® v3.3.3e — Header Logo Size Hotfix

Problem:
The QY logo on `/admin-affiliates.html` and possibly `/admin-affiliate-detail.html`
is being enlarged by an older/global header image CSS rule.

Fix:
Append the contents of:

`affiliate-admin-header-v3.3.3e-hotfix.css`

to BOTH:

- `admin-affiliates.css`
- `admin-affiliate-detail.css`

No HTML change.
No JavaScript change.
No SQL migration.

Expected desktop header:
[58px QY Logo] Quantum YiJing®     Affiliate Admin / Affiliate Detail

Suggested commit:
`v3.3.3e fix affiliate admin logo size`
