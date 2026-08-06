# Quantum YiJing Website v2.1 — Installation Guide

## What this update adds

- A bilingual English/Chinese contact section.
- A secure website enquiry form.
- A Cloudflare Pages Function at `/api/enquiry`.
- An internal enquiry notification sent to `info@quantumyijing.com`.
- A bilingual acknowledgement sent to the visitor.
- Resend API integration through a Cloudflare encrypted secret.
- Honeypot, timing checks, validation and field-length limits.

The Resend API key is **not included** in this package and must never be committed to GitHub.

## A. Install the files on `v2-development`

1. In GitHub Desktop, confirm the repository is `quantumyijing-website` and the branch is `v2-development`.
2. Click **Fetch origin**. If **Pull origin** appears, click it.
3. Confirm there are no local changes.
4. Make a local backup of the repository folder.
5. Copy the contents of this package into the repository root.
6. Replace `index.html` and `script.js` when Windows asks.
7. Confirm these new files exist:
   - `enquiry.css`
   - `enquiry.js`
   - `functions/api/enquiry.js`

## B. Local visual test

Open `index.html` with Live Server and test:

- English/Chinese switching.
- Contact form layout on desktop and mobile.
- Required-field validation.
- Course and service buttons scroll to the form and select an appropriate category.

The email submission itself will not work in ordinary Live Server because `/api/enquiry` is a Cloudflare Pages Function. Test actual email delivery after deployment to Cloudflare Preview.

## C. Add the Resend key securely in Cloudflare

1. Open Cloudflare Dashboard.
2. Go to **Workers & Pages**.
3. Select the `quantumyijing-website` Pages project.
4. Open **Settings → Variables and Secrets**.
5. Under the **Preview** environment, add a new secret:

   Name: `RESEND_API_KEY`

   Value: paste the new private Resend API key.

6. Select **Encrypt** or **Secret**, not plain-text variable.
7. Save.
8. Do not put the key in GitHub, VS Code, `script.js`, `enquiry.js`, or any HTML file.

For the first test, add it to **Preview only**. Add the same secret to **Production** only when v2.1 is approved for release.

## D. Commit and deploy

Commit summary:

`Add v2.1 smart bilingual enquiry system`

Then:

1. Commit to `v2-development`.
2. Push origin.
3. Wait for the Cloudflare Preview deployment to finish.
4. Open the latest Preview URL.

## E. End-to-end preview test

Submit a test enquiry using an email account you can access.

Confirm:

1. The browser displays the bilingual success message.
2. `info@quantumyijing.com` receives the internal notification through Cloudflare Email Routing.
3. The visitor receives `Enquiry Received | 已收到您的咨询`.
4. Replying to the internal notification addresses the visitor.
5. Replying to the visitor acknowledgement addresses `info@quantumyijing.com`.
6. Both emails display correctly on desktop and mobile.

## F. Production release

Only after Preview approval:

1. Add `RESEND_API_KEY` as an encrypted secret in the **Production** environment.
2. Merge `v2-development` into the production branch.
3. Test one production enquiry.

## Rollback

If the deployment fails, revert the v2.1 commit in GitHub Desktop or restore the backed-up `index.html` and `script.js`, then remove the four newly added paths:

- `enquiry.css`
- `enquiry.js`
- `functions/api/enquiry.js`
- `RELEASE-NOTES-2.1.0.md`
