# Quantum YiJing International Academy — v2.1.0

## Smart Enquiry System

### Added

- New premium two-column Contact section.
- General, Academy and Research domain email channels.
- Bilingual enquiry form with category selection.
- Cloudflare Pages Function at `/api/enquiry`.
- Resend-powered internal notifications.
- Bilingual visitor acknowledgement email.
- Reply-To configuration for natural Gmail replies.
- Honeypot, minimum completion time, allow-listed categories, validation and length limits.
- Responsive contact design for desktop, tablet and mobile.

### Changed

- Previous Google Form calls-to-action now lead to the new website form.
- Relevant buttons automatically preselect a suitable enquiry category.
- Footer enquiry link now targets the new Contact section.
- Static asset versions updated to v2.1.0.

### Security

- Resend credential is read only from the encrypted Cloudflare secret `RESEND_API_KEY`.
- No API key is included in browser code or this release package.
- Server responses disable caching and do not expose delivery-provider errors to visitors.

### Deployment requirement

The Cloudflare Preview environment must contain the encrypted secret `RESEND_API_KEY` before email submission can work.
