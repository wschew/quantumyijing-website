# Quantum YiJing® v3.3.3f — HARD Header Fix

The previous CSS-only hotfix was still being overridden by existing/global image rules.

This release uses INLINE `!important` dimensions directly on the logo `<img>`.
That prevents the logo from expanding to its intrinsic image size.

## 1. Replace these files

- `admin-affiliates.html`
- `admin-affiliate-detail.html`

These two files now hard-limit the QY logo to 58 × 58 px on desktop.

## 2. Fix `/affiliate`

Do NOT replace your full `affiliate.html`, because it contains the current working
landing-page design and bilingual application content.

Open:
`affiliate-header-v3.3.3f-snippet.html`

Copy the whole `<header>...</header>` block.

In your existing:
`affiliate.html`

replace ONLY its current `<header>...</header>` with the new block.

The new public header becomes:

[QY Logo] Quantum YiJing®                    EN | 中文 | Home

## 3. CSS

Append the contents of:

`affiliate-header-v3.3.3f-safety.css`

to the BOTTOM of:
- `admin-affiliates.css`
- `admin-affiliate-detail.css`
- `affiliate.css`

The inline styles are the primary safeguard; this CSS adds responsive behavior.

## 4. No backend changes

No SQL migration.
No JavaScript change.
No Cloudflare variable change.

Suggested commit:

`v3.3.3f hard fix affiliate headers`

## Expected result

`/admin-affiliates`
[58px logo] Quantum YiJing®     Affiliate Admin     Main Admin

`/admin-affiliate-detail`
[58px logo] Quantum YiJing®     Affiliate Detail    ← Affiliate Admin

`/affiliate`
[58px logo] Quantum YiJing®                          EN 中文 Home
