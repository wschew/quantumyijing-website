# C1 U3-B1 local Preview adapter

Status: LOCAL ONLY. No Cloudflare resource, public Pages file, deployment, remote migration or owner-server restart. Baseline 8e1980e7874fa0c2a9547b798c2cc4b9bb125246. This module is a factory for a future dedicated synthetic Preview Worker; it is not mounted in the existing website.

## Files and migration

New database/migrate-c1-preview-adapter.sql is ordinal 15 after meetings. It adds only consultation-specific synthetic customer registry, ephemeral transactional assertions, encrypted outbox and sanitized Preview events, plus replacement/immutability triggers. No customer or financial seed is in the migration. Existing Production migrations remain unchanged. The migration manifest now pins all 15 migrations; existing ledgers require verification of the original 14-entry prefix before the separately authorized fifteenth migration. Recompute and explicitly review the environment manifest fingerprint during a future maintenance checkpoint; do not silently change an existing immutable marker or rerun control DDL. U3-A's historical document describes the prior 14-entry checkpoint. A controlled marker-version upgrade procedure is a U3-B2 prerequisite for any already-provisioned database; no remote database exists or was touched here.

Use scripts/consultation-migration-verifier.mjs for file pins, then verifyApplied against authoritative ordered ledger and schema. Local tests apply each migration and its ledger row in one SQLite/D1 transaction. No migration-execution CLI, destructive down migration or automatic baseline adoption is supplied.

## Runtime and keys

createPreviewAdapter(env, config, manifest) uses U3-A validation and composes the existing workflow handler through a transaction-gated D1 wrapper. It returns fetch(request), not an exported default or a functions/api mount. Only /api/consultation/ paths are considered. GET/POST, exact origin, existing CSRF/cookie requirements and no-store responses remain enforced. Only non-secret id query parameters are allowed. Customer and QY authentication are still required for their respective operations; no ADMIN_TOKEN fallback.

Exact allowed env fields:
- CONSULTATION_DB: dedicated isolated synthetic D1 binding, never DB or ENQUIRIES_DB.
- CONSULTATION_PREVIEW_ENABLED: exact string true.
- CONSULTATION_SYNTHETIC_BOOTSTRAP_ENABLED: exact string true.
- CONSULTATION_MOCK_DELIVERY_ENABLED: exact string true.
- CONSULTATION_KEYRING: six-purpose versioned keyring.
- SUBSCRIPTION_AUTOMATION_ENABLED: absent/disabled; true rejects.

Unknown env bindings reject, including ADMIN_TOKEN, general databases and provider credentials. Future platform metadata must be explicitly reviewed rather than passed wholesale. config retains the U3-A database identity, expected ID, manifest hash, product/practitioner mappings, policy text/version/hash and country codes, and adds isolatedPreviewProject. The project must differ from quantumyijing-website; the canonical pages.dev hostname must belong to that dedicated project. Actual Cloudflare account/binding attestation remains a U3-B2 operator gate; a database marker alone cannot prove the attached remote resource's identity.

Required key purposes: intake, contact, lookup, challenge, meeting and new mockDelivery. mockDelivery is independent AES-256-GCM. Existing four/five-purpose callers remain supported by the shared consultation key importer; the adapter requires all six. Globally duplicate IDs or material reject. Old decryption versions must remain available. No key is generated, printed, provisioned or stored by this adapter. Dedicated consultation password provisioning and encrypted private key backup remain explicit operator actions; no source/default credentials or first-visitor setup.

## Atomic feature gate

Before each route dispatch, configuration, ledger, schema objects and environment marker are rechecked. Every service mutation, including UPDATE ... RETURNING and standalone run calls, is routed through a native D1 batch. The batch first inserts a NOT NULL/CHECK assertion conditional on the matching enabled synthetic marker and registered synthetic customer inventory, then executes the original statements in order, then removes the assertion. Failure aborts the entire batch. Original result indexing and changes()-dependent authorization checks are preserved. No SQL parsing/rewrite of the existing lifecycle statements is used.

A disable committed before the batch prevents every mutation. A disable occurring after a successful atomic commit cannot undo that earlier operation. Reads revalidate before dispatch and existing private reads use their native live authorization predicates; no claim is made that disable retroactively cancels already-authorized in-flight responses. Use the database marker as the distributed emergency stop; env binding changes alone cannot instantly change already-running isolates. Do not expose returned raw services or database wrapper as independent public endpoints.

## Synthetic customer bootstrap

POST /api/consultation/preview/bootstrap accepts only customerId. It requires the dedicated QY consultation session plus mutation CSRF and same-origin JSON. Only an explicitly provisioned enabled consultation_preview_synthetic_customers record whose canonical customer_reference begins SYNTHETIC- and status is Active can receive a one-hour synthetic portal session. Creation and sanitized QY attribution are atomic. The host-only Secure/HttpOnly/SameSite=Strict cookie contains random material; only its hash is persisted. There is no registration endpoint, password impersonation or existing Production session reuse.

Every canonical customer in the dedicated database must be explicitly registered as synthetic or adapter initialization and guarded writes reject. This is an operator-controlled isolation invariant, not a mechanism to sanitize copied Production records. Never copy Production customers or sessions. Bootstrap establishes only synthetic portal authentication: it does not grant account step-up, independently reviewed contacts, report-contact ownership, intake consent or booking/payment confirmation. Existing context binding, canonical ownership, OTP and consent checks remain mandatory. Session revocation/deactivation continues to use authoritative portal/customer state.

## Persistent encrypted mock delivery

The optional consultation account-stepup prepareMockDelivery hook prepares encrypted delivery statements before the challenge is written. Preview inserts challenge, success event and encrypted outbox in the same guarded transaction. A zero-row outbox insert is an assertion failure and rolls everything back. The existing local callback behavior remains unchanged without this hook. Preview send only confirms the committed encrypted row exists; it does not perform network delivery or retry.

AES-GCM uses a random 96-bit nonce and a database unique (key_id, nonce) constraint. AAD binds environment database ID, origin, challenge ID, canonical customer ID, context ID/version and key ID. Only challenge reference, key ID, nonce, ciphertext and expiry are stored in the outbox. Code, recipient and channel are inside authenticated ciphertext. Outbox ciphertext cannot be replaced or updated. No browser storage or URLs are introduced.

POST /api/consultation/qy/preview/outbox accepts only challengeId and requires current dedicated QY authentication, CSRF and exact origin. It returns private synthetic delivery instructions only over the authorized no-store response; no list endpoint exposes them. Retrieval checks live challenge expiry/attempts/consumption, contact revocation, context version/expiry, parent session revocation/expiry, active customer and enabled synthetic registry. It records a sanitized OutboxRead authorization event attributable to the QY session; this event is not proof of delivery, customer verification or successful decryption. Tamper or key failures return a generic sanitized rejection. Retrieval does not consume the OTP; existing correct confirmation and replay controls remain authoritative.

The report-contact challenge flow remains separate and uses its already-encrypted manual instruction/delivery path. No automatic email, WhatsApp, SMS, Zoom or payment provider is configured. No payment adapter is mounted, and finance/reconciliation routes remain unavailable without their separately approved adapter. No financial tables are written.

## Local validation boundaries

Tests use synthetic credentials internally and never print codes or passwords. SQLite and actual workerd HTTP route tests cover authorization, CSRF, canonical ownership, encrypted outbox, wrong/correct OTP, replay, expiry, tampering, logout, failure rollback and feature-disable races. Two workerd isolates share one local D1 binding; adapter recreation and cross-isolate retrieval prove no in-memory outbox dependency. This is not a deployed Cloudflare restart test or a real-browser acceptance claim. The test Worker disables outbound fetch and uses only a local internal service binding between synthetic isolates.

A deliberately failing outbox trigger proves challenge and evidence rollback. Tamper tests temporarily modify only disposable local fixture data, restoring the protection trigger before testing the actual decryption failure. No accepted source constraints are weakened. No real customer data is used.

## U3-B2 prerequisites and recovery

- Owner-approved isolated account/project/database identities and exact origin; no shared Production resource or credentials.
- Sanitized actual schema reconciliation and product/practitioner mappings; synthetic-only seed procedure and immutable marker version/manifest upgrade design.
- Private six-purpose key provisioning, old-version preservation, backups/recovery and dedicated QY account provisioning.
- Approved versioned policy text/hashes; promotion remains inactive.
- Explicit static asset/API mounting package, compatible host/origin handling, platform metadata allowlist and measured Worker CPU/D1 query budget. Per-request full contract validation intentionally favors safety over performance at this stage.
- Persistent remote D1 lifecycle/retention and bounded synthetic cleanup procedure; no automatic deletion or destructive rollback is implemented. Outbox rows expire for access but remain encrypted until separately authorized cleanup. Preserve nonce history if any future cleanup deletes ciphertext.
- Isolated synthetic payment evidence integration before testing confirmation; no live provider integration or financial writes are authorized.
- Preview browser/mobile/bilingual acceptance. No Production readiness claim.

Recovery is disable-first and code-first with additive schema retained. Never reset the consultation database to recover credentials. Preserve ciphertext keys, consent and audit history. A malformed key/configuration or unknown schema stops access; no fallback to shared ADMIN_TOKEN, Production portal authentication, plaintext storage or real delivery is allowed.
## Recorded validation

Adapter suite: 51 passed, 0 failed, exit 0, with SQLite and two actual workerd isolates sharing local D1. Existing U3-A suite: 62 passed, 0 failed, exit 0. Existing eleven workflow regression suites: 639 passed, 0 failed, each exit 0. Combined: 752 passed, 0 failed. JavaScript syntax, whitespace, conflict-marker and nine-file Git scope checks passed. All 15 migration checksums verified. The owner server remained PID 8456 on port 8789. No commit was created.
