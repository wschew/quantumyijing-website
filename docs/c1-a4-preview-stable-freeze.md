# C1 A4 Preview-stable baseline

Date: 17 October 2026 (Malaysia). Branch: c1-bazi-consultation-development.
Parent checkpoint: c50e54577619db7858d2dd7b4979014a174b5a41.
Intended annotated local tag: c1-a4-preview-stable. No push, merge or deployment is part of this freeze.

## Verified scope and evidence

Deployment: 83c1f12d, dedicated qy-c1-consultation-preview project and C1 Preview D1 734455fd-cdec-4e14-ad6f-96f80f22f3e7.
Approved origin: https://c1-bazi-consultation-develop.qy-c1-consultation-preview.pages.dev.
Tested package: .local-c1-package-preview-individual-offers-1792227841991 (local artifact; excluded from Git).
Worker SHA-256: de92370fbb69893bfc932239ec3cd635c64e8ab90d2b68945b42911aab7bd349.
Customer JavaScript SHA-256: 230fd3d3175e418889601ac87bbb2159118034416e523c79da78edbdcee7a4d8.
Dashboard JavaScript SHA-256: 4094a9847594d1dd4cff684dbaa2f71e8f287059512ca91f918f14d4208cb5ae.

Owner-attested final deployed acceptance: PASS, 657 checks, including automatic availability, RM880 acceptance, PaymentPending, one reservation, guarded synthetic cleanup and unchanged historical records. This evidence was supplied in the owner's freeze instruction; no new remote acceptance run was performed for the freeze. The private launcher intentionally does not save credentials or raw session output.

Prior read-only public checks matched the expected UI assets and verified customer/QY routes and safe API responses. The deployment-ID hostname is intentionally rejected by exact-origin checks; the approved branch alias is the customer/admin entry point. The previously approved disposable REST batch probe demonstrated constraint-error rollback and verified removal of its test table without consultation-record writes.

Final local checks: current-source in-memory Worker rebuild matches the tested package; all 34 package inventory entries, UI source assets and additive SQL match. JavaScript syntax, PowerShell parse, whitespace and 15 original migration pins pass. Launcher self-test: 143 assertions PASS. Cleanup suite: 35 cleanup checks plus 133 shared workflow checks, 168 total PASS. These suites overlap and their counts must not be added together or added to the owner's 657 deployed checks. PowerShell file execution was blocked by local execution policy; the Node stdin self-test passed without bypassing that policy.

## Frozen behavior

Guest encrypted-intake requests enter UnderReview with a nonbinding preferred MYT appointment. QY uses existing dedicated administrator authentication, CSRF and version guards to issue an immutable individual-price offer. A conflict-free proposal establishes audited availability when needed, without creating a hold. Private offer acceptance validates exact price/terms, expiry, lead time, active coverage and conflicts and atomically creates one Held reservation and PaymentPending. Verified full payment remains mandatory for confirmation. Bilingual request, administration and offer UI are included.

Existing booking, pricing, consent, payment and audit history is preserved. Original 15 pinned migrations are unchanged; additive guest/self-service/pricing/invitation/individual-offer SQL is retained, including historical Stage A2/A3 records and constraints. New discount/pricing-invitation issuance/redemption is retired at the active adapter boundary. The isolated private initialization/origin-alignment and owner-run test/cleanup tools are included as supporting C1 baseline tooling, not new public routes.

No Academy Production or shared payment/accounting, CRM, affiliate, subscription, email or WhatsApp module belongs to this change set. Default/Production deployment configurations remain disabled/unbound. Dedicated secret values and resource-specific local deployment configuration are not committed.

## Known limits

- This is a synthetic Preview-stable checkpoint, not commercial production or legal-policy approval. Trusted live payment, real outbound delivery and approved real-customer policies are not enabled.
- Deployed Cloudflare Free CPU/quota compliance and physical-authenticator compatibility are not established by this freeze. Local workerd attempts encountered sandbox EPERM; local tests use transactional SQLite/synthetic DOM, with separately reported remote evidence.
- Existing unaccepted offers are not backfilled or reissued automatically. Private offer URLs remain bearer credentials, shown privately and never stored in this record.
- Any overlapping Withdrawn window blocks automatic proposals; withdrawn history is not overridden. Multiple free proposals may exist; only an eligible nonconflicting acceptance can reserve.
- Ordinary A4 unpaid-hold cleanup is not an automatic cancellation feature. The approved synthetic cleanup is a private, exact-ID/version/finance-guarded atomic batch that releases a test hold and records OwnerReview while retaining availability, immutable acceptance and audit history.
- Retention, audit/window growth, anonymous admission capacity and operator exception handling remain operational responsibilities.
- Historical regression/local launcher fixtures reference excluded archived local packages. A fresh clone needs the separately retained reviewed package artifacts to reproduce those archive-dependent suites; their absence does not justify committing deploy packages or secrets.

## Exact baseline file inventory

- consultation-pages/config.template.json
- consultation-pages/worker.js
- consultation-preview/customer.html
- consultation-preview/guest-booking-ui.js
- consultation-preview/qy.html
- consultation-preview/workflow.css
- consultation-preview/workflow-ui.js
- database/additive/c1-consultation-guest.sql
- database/additive/c1-consultation-individual-offers.sql
- database/additive/c1-consultation-invitations.sql
- database/additive/c1-consultation-pricing.sql
- database/additive/c1-consultation-selfservice.sql
- docs/c1-a4-preview-stable-freeze.md
- docs/c1-guest-mvp-preview.md
- docs/c1-individual-price-stage-a3.md
- docs/c1-individual-pricing-stage-a4.md
- docs/c1-preview-admin-secret-activation.md
- docs/c1-pricing-stage-a2.md
- docs/c1-private-invitation-ui-refinement.md
- docs/c1-selfservice-stage-a.md
- docs/c1-synthetic-test-cleanup.md
- functions/lib/consultation/appointment-availability.js
- functions/lib/consultation/auth.js
- functions/lib/consultation/foundation.js
- functions/lib/consultation/guest-booking.js
- functions/lib/consultation/intake-validation.js
- functions/lib/consultation/pages-boundary.js
- functions/lib/consultation/preview-adapter.js
- functions/lib/consultation/preview-composition.js
- functions/lib/consultation/pricing-admin.js
- functions/lib/consultation/selfservice-booking.js
- functions/lib/consultation/workflow.js
- functions/lib/consultation/workflow-handler.js
- functions/lib/consultation/workflow-lifecycle.js
- scripts/align-consultation-preview-origin.mjs
- scripts/build-consultation-pages.mjs
- scripts/consultation-synthetic-cleanup.mjs
- scripts/initialize-consultation-preview.mjs
- scripts/initialize-consultation-preview.ps1
- scripts/run-c1-preview-acceptance.mjs
- scripts/run-c1-preview-acceptance.ps1
- scripts/test-c1-preview-launcher.mjs
- scripts/test-consultation-admin-secret.mjs
- scripts/test-consultation-guest-browser.mjs
- scripts/test-consultation-guest-calendar.mjs
- scripts/test-consultation-guest-mvp.mjs
- scripts/test-consultation-guest-ui.mjs
- scripts/test-consultation-individual-offers.mjs
- scripts/test-consultation-invitations.mjs
- scripts/test-consultation-preview-recovery.mjs
- scripts/test-consultation-pricing.mjs
- scripts/test-consultation-selfservice.mjs
- scripts/test-consultation-synthetic-cleanup.mjs

Excluded: all .local-c1-package*/ directories, .wrangler/, local target/config/secret material, logs, DPAPI payloads, disposable SQLite/probe artifacts and .local-c1-a4-verification-20261017.json. The latter may remain untracked after the freeze; no temporary artifact is staged.
