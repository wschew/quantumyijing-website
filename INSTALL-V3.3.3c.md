# Quantum YiJing® v3.3.3c — Brand & UI Standardization

This is a front-end visual patch on top of v3.3.3b.

## Main changes

1. Affiliate Portal pages now use the existing official QY logo:
   `/images/quantum-yijing-3d-logo.png`

2. Portal pages load the main site stylesheet first:
   `/styles.css`

3. `affiliate-portal.css` is now portal-layout styling only, so typography follows the same main-site style system.

4. Standardized header, buttons, input fields, card spacing and blue/white treatment.

## Files to replace

- affiliate-login.html
- affiliate-activate.html
- affiliate-forgot.html
- affiliate-reset.html
- affiliate-dashboard.html
- admin-affiliate-portal.html
- affiliate-portal.css

No JavaScript changes.
No D1 migration.
No backend changes.

## Install

Copy the files over the existing v3.3.3b project.

Suggested commit:

`v3.3.3c standardize affiliate portal branding`

Deploy to Preview first.

## Verify

Open:
- `/affiliate-login.html`
- `/affiliate-dashboard.html`
- `/affiliate-forgot.html`
- `/affiliate-reset.html`

Confirm:
- official Quantum YiJing logo appears in header;
- typography looks consistent with quantumyijing.com;
- portal header remains responsive on mobile;
- login/reset/dashboard functionality is unchanged.
