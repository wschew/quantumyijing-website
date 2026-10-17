# C1 Stage A4 — request first, individual offer price

**CONDITIONAL PASS for isolated synthetic Preview preparation; awaiting owner approval.** Local development/tests only. No remote access, D1 writes, migrations, deployments, outbound messages, staging/commits or server restart. Branch `c1-bazi-consultation-development`, starting HEAD `c50e54577619db7858d2dd7b4979014a174b5a41`. Pre-existing uncommitted work was preserved.

## Minimal architecture and operating steps

The active customer page now submits a guest consultation request using existing encrypted intake and anonymous admission controls. It displays RM1300 regular price, the server's current applicable promotion (RM980 while eligible), and: **Your final consultation price will be provided by QY after reviewing your request.** Birth/contact/questions/preferred appointment, privacy consents and a separate versioned booking-request acknowledgment remain. Contact details remain unverified. No customer account, OTP, price code or pricing invitation is required.

Submission creates an **UnderReview** booking, encrypted intake, existing privacy consents/audit and immutable request acknowledgment in one batch. It creates no offer, order, PaymentPending state or slot hold. Repeating the same command and content returns that same case; conflicting content is rejected. Preferences are not reservations and can be requested by more than one customer.

QY signs in through unchanged administrator authentication and refreshes cases. Inside an UnderReview case, choose **Issue individual-price offer**. The inline form shows regular/current selling prices as read-only references; enter final RM price, optional customer-facing description and proposed appointment in MYT. The requested time is prefilled where available. The API validates integer sen, positive price no higher than current applicable selling price, 72-hour lead time, aligned available time, authorization, CSRF and case version. There is no above-base approval override in this phase. Promotion eligibility and availability are rechecked in the write transaction.

Issuance creates the existing immutable offer and audit/command receipt plus an immutable individual-price record; the booking becomes Offered. **No slot is held at issuance.** The same successful command can be retried without creating another offer. Then use the existing **Create private offer link** case action and deliver that offer-scoped URL privately outside the application. This is the existing offer access mechanism, not a new pricing invitation system. No notification is sent.

Customer offer access shows proposed appointment, regular/base/final prices, description, original offer expiry and stored versioned terms. Explicit price/terms acceptance rechecks the current offer, token, booking version, expiry, 72-hour lead time and available window. It conditionally accepts the offer, creates the existing reservation, records immutable consent and marks the link used and booking PaymentPending in the same D1 batch. Overlap triggers arbitrate competing accepts. Failed acceptance rolls back the entire operation. Duplicate and concurrent identical acceptance returns the same successful state without another hold. Prices/accepted terms cannot be modified afterward. Later general promotion changes do not reprice an issued offer.

The original 48-hour offer/payment deadline is retained; acceptance does not start a fresh 48-hour period. PaymentPending is not confirmed. Trusted full-payment verification is still required; no provider, fake paid status or outbound integration is introduced. Existing cancellation, rescheduling, finance and PDF rules remain.

## Explicit change from Stage A/A2/A3

- Ordinary users submit requests, rather than obtaining a signed self-service checkout quote and automatically entering PaymentPending.
- New request-first cases cannot use the legacy offer API without an explicit final price to acquire a premature hold.
- New individual-price offers reserve only on acceptance. Older already-issued manual offers retain their existing hold behavior. Existing self-service bookings retain their accepted prices, private access, payment state and normal expiry/exception handling.
- `guest/quote`, `guest/invitation`, and new code/invitation issuance return HTTP 410 in A4. `guest/checkout` permits only replay of an already successful booking; a fresh or previously unsubmitted quote cannot create a booking. Underlying legacy modules/tables are retained, not repurposed into new bookings.
- Creation controls for codes/pricing invitations are removed from the dashboard. Historical invitation inventory/revocation remains administrative. Existing private **offer** links still work; old **pricing invitation** URLs show a retirement notice and never silently become requests.
- The old guest Submitted-request API remains for historical clients and QY review; it creates no automatic checkout or new request-first price commitment. Active A4 UI uses `guest/review-request`.

### Legacy invitation retirement risk and explicit procedure

Unused/revoked invitation rows are not converted, deleted or automatically rewritten. A4 denies new redemption at the adapter boundary, including previously issued quotes. Existing successful checkout retries return their original booking only.

**An older deployment/rollback can re-enable the old redemption endpoints.** Before any rollback or reuse of old code, obtain owner approval to revoke remaining unused legacy code/invitation IDs through the existing authenticated, CSRF-protected `qy/discounts` / `qy/invitations` operations with `action: revoke`. Invitation-row revocation is available in the retained administrative inventory. This records the existing audit event and retains the original rows/verifiers; do not delete records or perform blanket unaudited SQL updates. No such remote revocation was performed in this phase.

## Additive migration 020 — required

`database/additive/c1-consultation-individual-offers.sql`, packaged as `offline/020-individual-offers-additive.sql`, adds:

1. `consultation_guest_request_terms`: original request policy version/hash, acknowledgment time and fingerprint key version; immutable history triggers.
2. `consultation_individual_offer_prices`: offer/command identity, regular/base/final price, customer-facing description and the exact issued policy text; consistency and immutable-history triggers.

This addition is necessary because applied migration 018 requires a discount verifier for a reduced final amount in its price table. Weakening that trigger or inventing a code for each new offer would violate the new workflow. The separate additive snapshot preserves 018's constraints and the existing offer/payment infrastructure. It also identifies offers whose hold must be created at acceptance, and retains the exact terms shown to that customer.

No existing table definition, original migration, booking, promotion, price, audit or payment record is rewritten. Original 15 pins and additions 016–019 are unchanged. The owner booking `BAZI-9debad86-d2fb-49d9-b4a9-f507e807d00b` was not accessed or modified remotely. Apply **020 once only**, after already-applied 019; do not rerun 017/018/019 or initialization. A failed remote import may be partial: inspect schema state before any retry. Local migration rollback testing does not establish Wrangler import atomicity.

## Local verification and evidence

| Scope | Result |
|---|---|
| Active A4 `scripts/test-consultation-individual-offers.mjs` | **83 assertions PASS** |
| Archived Stage A self-service | **57 assertions PASS** |
| Archived A2 pricing | **91 assertions PASS** |
| Archived A3 invitation/UI | **102 assertions PASS** |
| Source + packaged original migration pins | **15 PASS** |
| Changed JavaScript syntax | **14 files PASS** |
| Package inventory/isolation, Git diff and phase-file whitespace | **PASS** |
| Genuine local workerd/D1 attempt | **BLOCKED: spawn EPERM**; seven optional runtime checks not counted as passes |

Active A4 tests run the actual new bundled Worker with disposable transactional SQLite and actual UI handlers in a synthetic DOM. They seed pre-A4 RM980/RM1300 history with the retained A3 Worker before applying 020. Coverage includes request acknowledgment/intake validation and UnderReview, independent RM880/RM950 prices, admin session/CSRF/version, readonly references and RM parsing in the dashboard, private customer-specific display, explicit acceptance, deterministic competing-slot and identical-acceptance barriers, request retry/concurrency, partial-write rollback for issuance and acceptance, immutable prices, promotion changes, expiry without an issuance hold, preserved historical and legacy manual workflows, bilingual customer/QY controls, retired endpoint rejection and unverified-confirmation denial.

The archived suites run against `.local-c1-package-preview-invitations-1792209415133` with archived assets. They verify retained historical behavior, **not** that retired functionality is active or supported for new A4 bookings. Their test-only archive option avoids overwriting packages. A4 separately verifies historical access/replay and explicit rejection of new legacy redemptions.

Representative active acceptance: **13 submitted SQL statements**, **12.389 ms local host wall time**, **15 ms Node process CPU**. Counts include submitted read/write and Preview assertion statements, not separately counted trigger internals or actual D1 billing metadata. These are single samples, not percentiles or deployed Worker CPU. Work is bounded, native crypto and existing isolated D1 are reused, and no new external service, cron, payment platform or paid feature is added. This does not prove Cloudflare Free CPU compliance. Actual browser A4 interaction, deployed CPU and D1 runtime/cost remain unverified.

Optional owner-run **local-only** genuine workerd test (outside this sandbox):

```powershell
$env:QY_ESBUILD_PATH='C:\Users\WIN10\AppData\Local\npm-cache\_npx\32026684e21afda6\node_modules\esbuild\lib\main.js'
$env:QY_MINIFLARE_PATH='C:\Users\WIN10\AppData\Local\npm-cache\_npx\32026684e21afda6\node_modules\miniflare'
node scripts/test-consultation-individual-offers.mjs
```

Archived regression command pattern, with the runtime option unset unless intentionally testing workerd:

```powershell
$env:QY_C1_LEGACY_PACKAGE=Join-Path (Get-Location) '.local-c1-package-preview-invitations-1792209415133'
node scripts/test-consultation-selfservice.mjs
node scripts/test-consultation-pricing.mjs
node scripts/test-consultation-invitations.mjs
Remove-Item Env:QY_C1_LEGACY_PACKAGE
```

## Remaining limits

- Concurrent offers may propose one available time because issuance no longer holds it. Only the first eligible acceptance succeeds; others require QY follow-up. This phase adds no new offer-revision state machine. An expired/conflicted legacy case may require the existing exception process or a new request rather than editing its old offer.
- Accepted unpaid manual offers use existing QY expiry/financial-exception handling; old self-service lazy expiry remains scoped to old self-service records. Holds linked to possible payment evidence are not blindly released.
- Existing global anonymous admission limits and synthetic retained-request cap remain; capacity and long-term pending/audit retention need owner operational management.
- Existing private offer links are bearer access to a limited offer. Guest contact is not identity proof. Secure automated recovery/delivery is still unavailable; no public lookup/recovery route is added.
- Trusted live payment integration and approved real-customer policies remain absent. Preview testing is synthetic only; this is not commercial production approval.

## Exact files changed in Stage A4

1. `database/additive/c1-consultation-individual-offers.sql` — new
2. `functions/lib/consultation/guest-booking.js`
3. `functions/lib/consultation/workflow.js`
4. `functions/lib/consultation/workflow-lifecycle.js`
5. `functions/lib/consultation/selfservice-booking.js`
6. `functions/lib/consultation/preview-adapter.js`
7. `functions/lib/consultation/preview-composition.js`
8. `consultation-preview/customer.html`
9. `consultation-preview/guest-booking-ui.js`
10. `consultation-preview/qy.html`
11. `consultation-preview/workflow-ui.js`
12. `scripts/build-consultation-pages.mjs`
13. `scripts/test-consultation-selfservice.mjs`
14. `scripts/test-consultation-pricing.mjs`
15. `scripts/test-consultation-invitations.mjs`
16. `scripts/test-consultation-guest-ui.mjs`
17. `scripts/test-consultation-individual-offers.mjs` — new
18. `docs/c1-individual-pricing-stage-a4.md` — new

Other dirty/untracked files predate this phase. No Academy/shared authentication, payment/accounting or frozen module was edited.

## Prepared package and proposed deployment

Package: `.local-c1-package-preview-individual-offers-1792212377073`.

The existing deployed A3 `wrangler.jsonc` is copied unchanged. Project, approved branch alias/origin, product/practitioner IDs, dedicated `CONSULTATION_DB`, expected database UUID, synthetic flags and draft policies remain. Production/default environments are disabled and unbound; subscription automation remains false. No secrets are packaged, installed or replaced. Worker dependencies are restricted to isolated C1 modules. Public output contains only C1 assets/Worker; additive SQL is offline.

**Proposed commands only — owner approval required; not executed:**

```powershell
Set-Location 'C:\Users\WIN10\Desktop\qy-c1-bazi-consultation-development'
$package='.local-c1-package-preview-individual-offers-1792212377073'
$env:CLOUDFLARE_ACCOUNT_ID='f87d6f0679c6fe4c1c08af320850b52c'
npx.cmd wrangler d1 execute 734455fd-cdec-4e14-ad6f-96f80f22f3e7 --remote --env preview --config "$package/wrangler.jsonc" --file "$package/offline/020-individual-offers-additive.sql"
if ($LASTEXITCODE -ne 0) { throw 'STOP: inspect additive schema state; do not rerun blindly or deploy.' }
npx.cmd wrangler pages deploy "$package/public" --project-name qy-c1-consultation-preview --branch c1-bazi-consultation-development --config "$package/wrangler.jsonc"
```

After an approved deployment: submit one invented request on a free preferred slot, verify UnderReview and no hold, issue RM880 through the case form, create/deliver its existing private offer link, explicitly accept and verify exactly one hold and PaymentPending. Do not pay, simulate payment, mark confirmed or alter the owner's existing bookings. Await owner review before any remote step.

## Request simplification follow-up

The active customer page now accepts a preferred MYT date and time directly, without a calendar availability lookup. New UnderReview requests do not require an availability window or an unoccupied slot. The existing 72-hour lead time, bounded date range, half-hour alignment, encrypted intake, consent, admission controls and idempotency remain. Legacy Submitted/self-service paths retain their historical safeguards.

Individual-price offer issuance remains authenticated, CSRF/version/pricing guarded and nonbinding; its early availability filter is removed. Customer acceptance retains the atomic active-window/overlap/lead-time checks and reservation transaction. Failure leaves the offer unaccepted and creates no hold or PaymentPending state; bilingual feedback directs the customer to QY for another time. No new pricing invitation, discount, token mechanism or payment integration is introduced. Existing offer expiry/exception procedures remain; this change does not add in-place revision of an already issued immutable offer.

Focused local verification: **92 assertions PASS**, actual bundled Worker with transactional SQLite and synthetic DOM. This includes no-window requests, nonbinding proposals, failed unavailable acceptance, exact MYT conversion, no calendar dependency, bilingual value preservation, races, rollback, historical prices and payment guards. Native workerd/D1 and deployed Free CPU are not verified by this run.

Prepared package: .local-c1-package-preview-individual-offers-1792221943969. Existing verified A4 wrangler.jsonc copied unchanged. No new migration is required for an environment already on A4 migration 020. No remote operations performed.

Follow-up files: functions/lib/consultation/guest-booking.js; functions/lib/consultation/workflow.js; consultation-preview/customer.html; consultation-preview/guest-booking-ui.js; scripts/test-consultation-individual-offers.mjs; this report.

## Individual-price button visibility correction

The case button is bound and opens the shared case-management section after the complete records list. Previously it provided no scroll/focus or local loading/error feedback, making a successful click appear unresponsive on a long dashboard. Remote runtime was not inspected; no deployed exception or expired-session cause is asserted.

The panel now becomes visible and scrolls into view while pricing loads; the selected reference is displayed, the completed form scrolls into view and focuses the final-price field. Pricing/render failures display the existing sanitized authentication/error feedback in the panel. No backend logic, authentication, booking, pricing, consent or payment state was changed.

97 focused local assertions PASS, including actual rendered button-handler invocation, selected case/proposed MYT time, RM880 field entry, visibility/scroll/focus, pricing-read failure, existing CSRF and offer issuance/acceptance/race/history tests. Tests use synthetic DOM and bundled Worker with transactional SQLite, not a real browser or native workerd/D1. Syntax, original migration pins and whitespace checked separately.

Prepared package: .local-c1-package-preview-individual-offers-1792223572159; unchanged Preview configuration copied from the preceding package; bundled Worker byte-identical. No migration required. Files changed for this correction: consultation-preview/workflow-ui.js; scripts/test-consultation-individual-offers.mjs; this report. No remote operations, deployment or Git mutations performed. Await owner approval.

## Private customer offer presentation simplification

Private-offer visitors now see Your Bazi Consultation Offer with a readable definition-list summary, dynamic MYT appointment/expiry, regular/base/final prices and a prominent final amount. The ordinary request introduction is hidden only for offer visitors. The service includes the 90-minute online Zoom consultation and personalized PDF report; payment remains separately instructed and confirmation requires verified full payment. Issued offer policy text remains unchanged and accessible beside the configured public privacy notice in an expandable disclosure. The checkbox explicitly acknowledges the displayed price, appointment, terms and privacy notice. Public guest/policies supplies the privacy notice; failure leaves acceptance unavailable. Both languages use the existing translation mechanism.

105 focused assertions PASS: English/Chinese heading, button and prices; readable layout; hidden request introduction; accessible unchanged issued terms and configured privacy text; unchecked consent sends no request; language switching preserves consent; successful customer acceptance and existing transactional race/rollback/history safeguards. Synthetic DOM/local transactional SQLite only; native workerd/D1 and real-browser/deployed CPU not verified.

Package: .local-c1-package-preview-individual-offers-1792226595423. Worker, QY HTML/JavaScript and customer request form match the preceding package byte-for-byte. Preview wrangler configuration is copied unchanged; no secret values are packaged or overwritten. No schema/migration/backend changes, remote access, deployment or Git actions.

Files changed for this UI refinement: consultation-preview/customer.html; consultation-preview/guest-booking-ui.js; consultation-preview/workflow.css (offer-scoped styles only); scripts/test-consultation-individual-offers.mjs; this report. Await owner approval.

## QY-approved automatic appointment availability

New individual-price offer issuance validates the existing 90-minute duration, 72-hour lead time, price, case version, administrator session and CSRF. A shared scheduling predicate rejects Held/Confirmed reservation overlaps, Active replacement appointments and any overlapping Withdrawn availability. The schema has no separate blocked-date table: Withdrawn is treated conservatively as an explicit block even where another Active window overlaps. Automatic issuance never reactivates or replaces a withdrawn row. No new unblock mechanism is introduced.

The existing atomic offer batch creates a precise Active availability window only if no existing Active window fully covers the appointment, plus the existing immutable Created availability event with QY session and command attribution. The guarded offer insert repeats the conflict and lead-time checks inside the transaction; later failure rolls back availability, audit, offer, price metadata and command receipt. Existing covering windows are reused; successful command retries create nothing again. No reservation or PaymentPending state is created at issuance. Customer preferences never create availability.

Customer acceptance repeats active coverage, withdrawal/conflict, lead-time, offer/token/version/price-consent checks inside the same transaction as reservation and PaymentPending. Competing unaccepted offers may share a free proposal, but only one overlapping acceptance commits. Failed conflicting acceptance returns APPOINTMENT_UNAVAILABLE only after scoped private-link validation. Invalid/expired/changed links use the same generic OFFER_CHANGED_OR_EXPIRED code. Unknown infrastructure errors remain generic; raw SQL and private details are never returned. Both customer and QY messages are bilingual. QY may edit and manually resubmit the form after a definitive availability conflict; uncertain failures still require refresh, with no automatic retry.

No migration is required; existing tables, triggers and immutable histories are reused. Existing offers are not backfilled, reissued, repriced or accepted. In particular BAZI-faffbbee-4f2e-48d2-ad64-66e0337b6264 was not accessed remotely or changed. If it lacks coverage, deploying this code will not repair it retroactively; separate owner-approved existing-dashboard availability handling is required. Historical RM980/RM1300 behavior and price/consent/payment safeguards remain tested.

Focused local result: **133 assertions PASS** using actual bundled Worker/local transactional SQLite and synthetic DOM, including automatic window/audit creation, reuse/idempotency, no early hold, Held/Confirmed conflict rejection, withdrawal, concurrent issuance creating one covering window, competing acceptance with one winner, late-write rollback of window and audit, safe retry, customer conflict text in both languages, expiry codes, history and authentication/CSRF. Active replacement appointment and adjacent-boundary behavior are checked directly against the shared SQL predicate in a separate disposable SQLite probe. Native workerd/D1 and real-browser/deployed CPU were not verified. Representative submitted statement counts: 20 for automatic offer issuance, 14 for successful acceptance; excludes trigger internals and actual D1 billing metadata. Existing retained availability/audit growth needs operational retention management; no paid service or unbounded maintenance loop is added. Withdrawn overlaps require deliberate owner scheduling resolution and cannot be overridden by issuing an offer.

Package: .local-c1-package-preview-individual-offers-1792227841991. Verified Preview wrangler configuration copied byte-for-byte, dedicated CONSULTATION_DB UUID and branch unchanged; default/Production remain disabled and unbound. Existing secrets are not included or replaced. Existing original migration pins remain unchanged. No remote access, database writes, deployment or Git staging/commit/push/merge/tag.

Files changed for this phase: functions/lib/consultation/appointment-availability.js (new); functions/lib/consultation/workflow.js; functions/lib/consultation/guest-booking.js; functions/lib/consultation/workflow-handler.js; functions/lib/consultation/preview-adapter.js; consultation-preview/workflow-ui.js; consultation-preview/guest-booking-ui.js; scripts/test-consultation-individual-offers.mjs; this report. Local implementation PASS; Preview readiness remains conditional on native runtime validation. Await owner approval.
