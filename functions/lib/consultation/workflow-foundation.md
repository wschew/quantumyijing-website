# C1-C3: integrated local workflow checkpoints

Status: integrated internal services and local screen templates; no public API mount.
Additive migrations are local-only. No provider calls or secret provisioning.
Not yet approved for remote Preview or real customer data.

## Implemented

workflow-runtime.js imports a server-supplied versioned secret keyring into nonextractable
AES-256-GCM (separate intake/contact purposes) and HMAC-SHA256 (separate lookup/challenge
purposes) CryptoKeys. Every role has an active key identifier and a retained version map.
Identifiers and raw material must be unique across roles and versions. Missing/invalid
configuration, unknown versions and all import errors use a fixed sanitized exception.
The keyring must originate from a runtime secret binding, never request input or a database.
The example shape is described without key values: each intake/contact/lookup/challenge
entry contains active and keys, where keys maps identifiers to 64 lowercase hexadecimal
characters representing independently generated 256-bit material.

requirePreviewWorkflowConfiguration requires an explicit string true, Preview environment,
canonical HTTPS pages.dev origin and an exact server-configured isolated database identity.
Known Production, P1 acceptance and R5 recovery IDs are denied. Subscription automation
must not be explicitly enabled. This is configuration validation only, not an authenticated
customer or QY guard, database attestation, or approval to expose any route.

JavaScript cannot guarantee erasure of immutable input strings. Raw temporary byte arrays
are cleared after import; no key material is returned, logged or persisted. Runtime binding
access must remain restricted. Key entropy must come from secure provisioning, not the
hex-format validator. Lost historical keys make existing ciphertext unrecoverable.

## Integration blockers found in committed source

1. The owner approved account-bound WhatsApp or Email OTP step-up, superseding mandatory
canonical-email-only step-up. WhatsApp is preferred only when independently reviewed and
securely bound to the canonical customer. Email is an alternative. A new delivery address,
portal login or report_delivery proof cannot substitute for canonical-account ownership.
When no trusted contact exists, options returns manualReviewRequired; dedicated QY review
must independently establish identity and contact ownership before enrollment. OTP remains
mandatory after that review. Existing CRM addresses are not automatically enrolled.

2. functions/api/payment/generic/create.js accepts a caller-supplied amount and creates orders
without consultation offer/policy ownership guards. It is not a safe direct consultation checkout
adapter. functions/api/admin/payment-verify.js and generic-payment-verify.js perform accounting,
commission/provisioning and receipt side effects. They must not be called from a synthetic test
or invoked as read-only verification helpers. Frozen modules remain unchanged.

3. functions/api/payment/doku/_shared.js markPaid sets paid_at using processing Date.now.
This does not prove provider capture time. The approved 48-hour rule requires independently
verified capture evidence; missing/ambiguous evidence must remain ExceptionReview, never
Confirmed. Choose an approved authoritative capture-evidence interface before live checkout.

## Required next implementation boundaries

- Account-bound step-up and server-side runtime secret provisioning/rotation/recovery design.
- Atomic repository rechecking live portal/context/QY sessions, contact proof and latest consent
  in each operation, including reads at their authorization boundary; zero-row CAS aborts batch.
- Consultation-specific booking/intake linkage; encrypted payload version distinct from metadata
  revision; Customer versus QY audit attribution. Do not reuse Customer-only mutation audit plans
  for QY writes. Use revised five-MYT-calendar-year intake policy, not legacy 24-month helper.
- Server-derived immutable offer and order linkage. Frozen accounting remains sole financial writer.
- Manual report metadata only: no PDFs, object keys, Drive API or automatic delivery. Existing
  consultation_reports upload/object-key design must not be wired into this manual workflow.
- Request/dashboard UI and protected endpoints only after the preceding guards are verified.
- Promotions remain Draft/Inactive; no automatic activation or scheduler.

No owner-approved runtime keys, isolated Preview database or canonical origin are provisioned
by this local checkpoint. No Production configuration has been read or changed.

## C1-C3 integrated local implementation

account-stepup.js uses eight-digit cryptographically generated single-use OTPs, purpose-separated
HMACs, a ten-minute expiry bounded by the context, maximum five guesses per challenge,
three challenges and ten aggregate guesses per customer in fifteen minutes. All delivery is
through an explicitly supplied local mock; no provider adapter or messages are implemented.
Trusted account contacts are separately AES-GCM encrypted and HMAC fingerprinted. QY review
is an explicit attestation with an opaque evidence reference, not automatic identity verification.
Contact revocation, parent/context revocation or generation changes invalidate account proofs.
A post-commit mock-delivery failure reports committed/Unknown and must not trigger blind retry.

workflow.js atomically links bookings to encrypted intake and versioned consent, checks account
step-up and report-contact proof in the same submission transaction, and maintains correct
Customer/QY audit attribution. Operational listings omit private fields. QY private reads require
a current dedicated session and latest matching consultation privacy grant. Requests, review,
72-hour appointment offers, 48-hour expiry/acceptance, immutable regular-price snapshots,
manual payment exception review, post-session completion, five-year retention and manual
report preparation/confirmed delivery metadata are implemented. Promotions cannot activate.

There is no financial writer or live checkout. Confirmation requires an approved server-side
readCaptureEvidence adapter returning authoritative verified full-payment data AND a matching
atomic SQL evidence predicate. Caller-supplied payment evidence is rejected. Missing capture
proof becomes ExceptionReview. No such live adapter is installed; DOKU callback processing
paid_at is explicitly insufficient. Order linkage/capture reconciliation must be approved and
implemented before end-to-end payment acceptance. No provider callback is executed in tests.

consultation-preview contains isolated customer/QY screen templates with no browser storage,
no credential logging and private DOM clearing controls. workflow-handler.js is an internal
controller, NOT a deployed or public endpoint. No API route file mounts it. Therefore these
screens require a separately verified local/isolated Preview host to mount the controller;
they must not be presented as already remotely usable. Test-only mock delivery is never an
approved production transport. Existing homepage, portal and administration pages are unchanged.

Commands reject duplicate/stale requests safely; there are no automatic retries. D1 batches
use immediate changes()==1 event gates to abort zero-row CAS/authorization failures. SQL
collision triggers protect new account proofs/audits and workflow receipts against REPLACE.
Financial tables and the legacy PDF-object tables are not written. Intake retention is managed
through intake-policy.js; legacy foundation retention helpers remain unchanged.

Before any real-data/Preview mounting: independent security review, runtime key provisioning
and recovery/rotation, dedicated isolated primary database and origin verification, approved
privacy/policy text and hashes, documented independent QY identity-review evidence standards,
contact/challenge audit retention policy, mock/provider separation, browser acceptance, atomic
payment/order adapter and end-to-end verified-capture race tests. Rescheduling, unaccepted-offer expiry/slot release, protected no-show/cancellation and manual
report follow-up/deletion metadata are now implemented in workflow-lifecycle.js. Payment
exception resolution still requires an approved authoritative capture-evidence adapter.

## Lifecycle milestone

Replacement appointments use a separate append-only schedule, preserving the original accepted
offer, price, policy, order and original appointment. A replacement is future-dated and within
23:59:59.999 MYT on calendar day 30 of the original appointment. It is not a new payable offer;
the initial 72-hour offer requirement is not incorrectly imposed on an approved reschedule.
The original held/confirmed reservation is released atomically with the approved replacement.
Bidirectional SQL overlap triggers protect initial and replacement reservations. All reads and
completion/no-show guards use the effective current appointment, not the old immutable offer.

Timely pending free-reschedule requests retain eligibility through Owner Review and prevent
forfeiture. One free use is consumed only after approved replacement. Additional/late requests
need explicit authenticated QY owner approval. Unavailable/out-of-window cases remain Owner
Review without extension/refund/forfeiture. Cancellation/no-show is QY-controlled, not automatic;
a lawful exception or QY delivery inability routes to ProviderRemedyPending. Financial tables
are never written. Unaccepted finally expired offers get 90-MYT-calendar-day intake retention;
accepted timeout instead goes to ExceptionReview with no premature terminal retention.

Manual report Unknown/FollowUp does not claim delivery. Same-channel retry can subsequently
record confirmed delivery. Deleted records only attest external manual deletion after confirmed
delivery; no website file is uploaded, stored or deleted. Changing delivery channel requires a
separate customer-authorized contact update and is not silently allowed by these methods.

Apply migrate-c1-consultation-workflow-lifecycle.sql after all prior consultation migrations in
an isolated local/Preview database only when separately authorized. No migration is executed
remotely by local development. The lifecycle tests use synthetic historical fixtures, explicitly
not real payment-provider evidence. Initial schema and module scope remain consultation-only.

## Approved capture review and local demonstration

Authoritative verified provider capture time is primary. Missing or ambiguous evidence requires independent QY finance verification, an opaque supporting-evidence reference and SHA-256, and an immutable attributable audit. A known late provider capture cannot be overridden by an earlier manual claim. Recording finance review never confirms a booking; a separate authenticated reconciliation command checks full verified payment, canonical customer/order ownership, immutable price, capture deadline and live reservation atomically. Financial source tables remain read-only. No provider adapter uses paid_at as a substitute capture timestamp.

The runnable demonstration uses HTTPS loopback, an in-memory synthetic database, ephemeral encryption keys and mocked OTP/capture delivery. It is not a remotely deployed Preview. The real provider signed-capture normalization adapter remains an integration prerequisite. Mock OTP delivery is memory-only and must be replaced by an isolated, encrypted distributed mock transport before Cloudflare Preview mounting. No live checkout is connected.

The local capture-review and evidence-guard migrations follow the lifecycle migration. Replacement collisions are rejected at every relevant unique key. Native SQL rechecks appointment start at confirmation.

## U2-C meeting boundary

Meeting management is internally mounted only. Optional runtime purpose meeting uses independent nonextractable AES-256-GCM keys; existing four-purpose callers are unchanged, while the meeting service requires explicit meeting keys. AAD binds publication, canonical customer, booking, effective appointment identity/version/times and key ID. Nonces remain unique in retained metadata after explicit ciphertext deletion. No plaintext is included in operational listings or sanitized audits. QY mutation CAS, publication state, ciphertext and audit commit in one D1 batch. Customer reads recheck live account step-up/ownership, Confirmed state and the current schedule in the same batch as coalesced sanitized read evidence. Explicit revocation/deletion requires current QY authentication and CSRF. Rescheduling invalidates by schedule identity comparison, without a new financial or lifecycle state.

There are no Zoom API calls, provider sends or automatic retention jobs. Customer join URLs have a deliberately conservative zoom.us /j/ allowlist; host/start credentials are unsupported and rejected. Key provisioning, recovery, backup retention and broader URL formats require separate approval before remote/real-data use. Immutable JavaScript strings cannot be reliably zeroized; byte buffers are cleared where possible, and credentials are never intentionally logged or persisted in browser storage.
