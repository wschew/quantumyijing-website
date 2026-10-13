# C1-C3 step 1: runtime prerequisites (local checkpoint)

Status: preparatory foundation only; NOT an integrated or Preview-ready workflow.
No routes, user interface, migrations, provider calls or secret provisioning are added.

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

1. Legacy portal cookie QY_PORTAL_SESSION lacks the __Host prefix. The consultation bridge
rejects duplicate cookies, but a lone valid attacker-owned domain cookie is not distinguishable
from a host-only cookie. Chosen report-contact verification alone does not establish ownership
of the canonical portal account. Proposed additive solution: a separate account-bound step-up
to the canonical email read from authoritative customer state, with a distinct challenge purpose,
context generation, contact fingerprint and atomic checks. Do not reuse a report_delivery proof
as account step-up. Canonical address changes/revocation must invalidate that proof. Owner
review is pending; there are no sensitive public endpoints in this checkpoint.

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
