# Quantum YiJing International Academy — v2.2 Installation

## Scope
v2.2 refines the automated customer and internal enquiry emails. It does not change the website form, Cloudflare secret name, routing rules, or Resend configuration.

## Before installation
1. Open GitHub Desktop.
2. Confirm repository: `quantumyijing-website`.
3. Confirm branch: `v2-development`.
4. Click **Fetch origin** and **Pull origin** if available.
5. Confirm there are no local changes.

## Install
Copy the supplied file into the repository and replace the existing file:

`functions/api/enquiry.js`

Do not modify or upload any Resend API key. The existing Cloudflare secret remains:

`RESEND_API_KEY`

## Test locally
The visual email itself cannot be sent through ordinary Live Server because the API route requires Cloudflare Pages Functions. You may still confirm that the website loads normally.

## Commit
Recommended commit summary:

`Refine v2.2 branded enquiry emails`

Commit to `v2-development`, push origin, and wait for the Cloudflare Preview deployment.

## Preview test
1. Open the latest Cloudflare Preview URL.
2. Submit one complete enquiry.
3. Confirm the customer receives a bilingual acknowledgement.
4. Confirm `info@quantumyijing.com` receives the internal notification.
5. Check the logo, softer header colours, reference number, links, and mobile email layout.

## Rollback
Replace `functions/api/enquiry.js` with the v2.1 version, commit, and push again.
