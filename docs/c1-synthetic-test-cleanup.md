# C1 A4 synthetic acceptance-test cleanup — local preparation only

No remote execution is authorized or implemented. No deployed application changes or migration are required.

## Decision

Use the offline parameterized plan builder `scripts/consultation-synthetic-cleanup.mjs`, not a maintenance endpoint. It exports a six-statement batch only; it has no network, credential handling, CLI executor or public route. It is not a general cancellation tool and must not be used for historical/customer bookings.

The state machine allows PaymentPending → OwnerReview. The generic workflow event enum does not include OwnerReview, so cleanup uses the existing lifecycle OwnerReview event and a general consultation event with explicit synthetic-maintenance meaning. It never claims expiry, cancellation, refund, payment or consultation completion.

## Frozen scope required before any future run

The owner must approve the exact run ID, owner approval reference, booking ID/reference, offer ID, Held reservation ID, expected booking version, synthetic customer/intake IDs, original request command ID and fingerprint, accepted snapshot hash, appointment timestamp and a run window no longer than six hours. The booking must have been created during that run and cleanup must finish before its deadline. Actual IDs do not exist until a separately approved remote test; none are guessed here.

The helper pins dedicated database UUID `734455fd-cdec-4e14-ad6f-96f80f22f3e7`, the approved C1 origin, manifest hash, enabled/synthetic-only marker, product/practitioner 1 and accepted MYR 88000 sen. It requires the synthetic registry and exact guest customer reference; exactly one booking for that customer, one offer, one reservation, request-first terms, and a used acceptance link. It expressly refuses the known historical references BAZI-faffbbee-4f2e-48d2-ad64-66e0337b6264 and BAZI-9debad86-d2fb-49d9-b4a9-f507e807d00b.

Finance guards reject any associated order binding, canonical customer/enquiry linkage, capture review/audit, confirmation or subsequent workflow evidence, rescheduling, replacement appointment or report record. Original/complete/terminal timestamps must be absent. These guards concern recorded associations; they cannot establish absence of off-system payments. The synthetic test must never attempt payment or link finance records.

## Atomic batch and affected records

All six statements must execute as ONE rollback-on-error batch on ONE database. Never submit them individually or assume a Wrangler multi-statement file is atomic.

1. Compare-and-swap exactly one PaymentPending booking to OwnerReview, incrementing row_version and updated_at.
2. Assert exactly one row changed; otherwise raise a hard SQLite error.
3. Change exactly the identified Held reservation to Released, conditional on the exact updated booking/offer/version.
4. Assert exactly one reservation changed; otherwise raise a hard error.
5. Append one consultation_events row: SyntheticTestHoldReleased, PaymentPending → OwnerReview, actor_role owner and the genuine approval reference; unique run/command ID and sanitized purpose metadata.
6. Append one consultation_workflow_lifecycle_events row: OwnerReview, actor_kind QY, approval/run references.

Assertions use SQLite integer-overflow errors when changes() is not one. The accepted offer, RM880 snapshot, accepted policy/consent, used-link evidence, encrypted intake, original audits and availability are unchanged. OwnerReview is intentionally retained for truthful owner follow-up; it is not a fabricated terminal cancellation. A repeat batch fails closed without another audit or mutation. If acknowledgement is uncertain, read exact state and audit IDs before considering any action; do not rerun automatically.

## Future execution gates — not authorized yet

Before creating remote test data, verify the Cloudflare account, project, branch, Preview binding and database UUID independently with the existing target-verification method. Prepare the exact parameterized plan from that run's known IDs, not by searching for a recent booking. Obtain explicit owner approval for remote test creation and cleanup.

A future executor must use a demonstrably atomic D1 batch mechanism, fail closed on every error, and never print credentials, private links, SQL parameters or intake. This helper deliberately supplies no remote executor. A schema/identity clone can share a marker; checking the actual Cloudflare resource metadata remains mandatory. Native D1 batch rollback and the changes() assertion behavior must be validated before relying on this plan remotely. If atomicity cannot be demonstrated, stop before creating a remote accepted hold.

Capture before/after fingerprints of all historical booking-related records in memory and report only comparison results. Only the two exact test rows may change, and only two audit rows may be appended. Do not delete records, change offer expiry, disable triggers, alter prices, rewrite consent or withdraw availability. Withdrawing an automatic window creates a scheduling block; it is not part of this cleanup.

## Local verification

Run `node scripts/test-consultation-synthetic-cleanup.mjs` with the optional QY_MINIFLARE_PATH variable unset. The test reuses the existing prepared A4 Worker and local fixture harness in memory, with disposable SQLite savepoint batches. It changes no source/package or remote resources and requires no credentials.

Result: **35 cleanup checks PASS**, plus **133 existing A4 fixture/workflow checks PASS** (**168 total**, not additional to the earlier 142-check run). Coverage includes exact-scope mismatches, expired run window, disabled/incorrect database identity, invalid booking/reservation states, confirmation, linked order, payment and capture-review evidence, reservation CAS failure, late audit failure, repeat rejection, successful cleanup and foreign-key integrity. Full database images are compared in memory: all historical rows and immutable tables are retained. Known historical references are explicitly excluded by the builder.

Local SQLite atomicity is demonstrated. Native workerd/D1 and remote cleanup are not verified by this test. No remote records were read or written. The deployed package remains unchanged.

Remaining risks: a six-hour approval expiry or newly recorded finance/state evidence intentionally blocks cleanup and requires fresh owner review; OwnerReview and historical intake/audit retention remain; actual remote atomic-batch behavior is a prerequisite, not a proven result. No immediate production/customer cancellation feature is introduced.
