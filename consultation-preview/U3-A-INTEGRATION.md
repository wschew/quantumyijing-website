# C1 U3-A local integration contract

Status: local preparation only, NOT Preview or Production readiness. Baseline 2f554a2b6756ee0c803ca734679c56f1ac500243. No public route, provider, resource, account provisioning or migration runner is introduced.

## Frozen migration inventory

Manifest: database/c1-migration-manifest.json. Manifest fingerprint is SHA-256 of UTF-8 JSON.stringify(parsed manifest), not pretty-printed file bytes: 903f6b7b6b3445d102f089dd04c203c3660cc88ef1d79aa05b3749c3b4dd14e1.

SQL checksum algorithm: strict UTF-8 decode, remove a leading BOM, normalize CRLF to LF, retain every other character, SHA-256 UTF-8. Invalid UTF-8 rejects. This explicitly accommodates Git line endings. Existing SQL files are unchanged. Compatibility source files and the Academy portal prerequisite are pinned separately; base Academy tables must exist before the portal prerequisite. A checksum is an integrity pin, not a signature: protect the reviewed manifest through the local checkpoint and later release provenance.

1. `database/migrate-c1-integration-control.sql`
2. `database/migrate-c1-consultation-auth.sql`
3. `database/migrate-c1-consultation-customer-identity.sql`
4. `database/migrate-c1-bazi-consultation-foundation.sql`
5. `database/migrate-c1-consultation-customer-intake.sql`
6. `database/migrate-c1-consultation-contact-verification.sql`
7. `database/migrate-c1-consultation-account-stepup.sql`
8. `database/migrate-c1-consultation-workflow.sql`
9. `database/migrate-c1-consultation-workflow-lifecycle.sql`
10. `database/migrate-c1-consultation-capture-review.sql`
11. `database/migrate-c1-consultation-workflow-evidence-guards.sql`
12. `database/migrate-c1-consultation-preferences.sql`
13. `database/migrate-c1-consultation-availability.sql`
14. `database/migrate-c1-consultation-meetings.sql`

## Verification and applied ledger

Run node scripts/consultation-migration-verifier.mjs for FILE verification only. It does not inspect any database. verifyApplied(manifest, rows, schema) separately accepts authoritative ordered ledger rows and sqlite_master table/index/trigger names from the same database. It returns applied versus pending; it never schedules applied entries again. Unknown, reordered, changed ledger entries or disagreement between expected objects and ledger reject. It checks object presence, not semantic equivalence of arbitrary external DDL changes; later integration must compare normalized sqlite_master SQL definitions and relevant PRAGMA contracts against the reviewed fixture before mounting. Current runtime also rejects missing expected objects.

Future execution must: validate all pins and schema prerequisite definitions; verify database/account identity independently; confirm isolated synthetic marker; read ledger; stop if objects exist without ledger (including old local/Preview experiments). Do NOT automatically adopt unledgered objects. For an existing authorized database, obtain owner review of exact schema and evidence before any baseline adoption. Never infer success from CREATE IF NOT EXISTS.

Execute each pending SQL file and its ordinal/path/hash/timestamp ledger insert in one supported D1 batch transaction. First control DDL and its first ledger row belong to that same batch. Tests demonstrate this in SQLite and local D1; there is intentionally no remote execution CLI. Verify committed objects, ledger prefix, foreign keys and quick_check after each migration. On ambiguous response or failure, STOP; read ledger/schema before deciding whether any further action is authorized. Never retry blindly. No claim is made that all migrations are globally atomic as one release.

Ledger UPDATE/DELETE and primary/unique collision REPLACE attempts reject without recursive_triggers. The ledger records successful application, not approval authority. SQL administrators remain trusted; no trigger protects against an authorized administrator dropping tables/triggers.

## Repository schema compatibility

scripts/consultation-schema-compatibility.mjs projects exact CREATE TABLE statements from repository sources, with full source-file hashes in the manifest. It includes full columns/constraints for enquiries, products, orders, order_items, payments, customers, customer_identifiers, customer_enquiry_links and coaches; all Academy portal DDL and all C1 DDL are then exercised by tests. Payment ALTER statements come from database/migrate-v3.1.sql and root migrate-v3.3.15.sql. Root migrate-v3.4.0-coach-foundation.sql provides the practitioner contract.

The old local fixture omits required customer_reference, product sku/slug/type/name, coach code/name/email/status, order customer name/email, and payment provider fields. Its dummy coach has no Approved status, and dummy product has no CONSULT-BAZI mapping. Tests against simplified fixtures alone cannot prove integration compatibility. New fixtures supply synthetic required values and reject incomplete inserts. Existing local fixture is preserved unchanged; its mock financial INSERT statements are NOT suitable for the stricter schema or Preview reuse.

This is a compatibility projection of C1-consumed contracts, NOT the full deployed database or the complete historical Academy migration chain. Later product, accounting, subscription, coach and portal amendments may exist; repository evidence alone does not establish their deployed state. No deployed schema or data was accessed. U3-B needs an authorized sanitized schema inventory, required-column/type/constraint comparison and explicit product/practitioner ID mapping. Do not create or alter financial tables to satisfy C1. Orders, payments and their accounting eligibility remain read-only interfaces. Production financial records and credentials are prohibited in isolated Preview.

## Unmounted Worker composition

functions/lib/consultation/preview-composition.js imports only Worker-compatible consultation modules. It returns internal services and assertEnabled, no fetch export, Pages route or mounted controller. It does not import the Node HTTPS runner or SQLite fixture.

Server-only env: CONSULTATION_DB (dedicated D1 prepare/batch binding, no DB/ENQUIRIES_DB alias), CONSULTATION_PREVIEW_ENABLED exact true, CONSULTATION_KEYRING serialized five-purpose keyring. SUBSCRIPTION_AUTOMATION_ENABLED must remain absent/disabled; true rejects. Server-only configuration: environment preview, syntheticOnly boolean true, canonical HTTPS pages.dev origin, databaseId and expectedDatabaseId equal a non-production UUID, manifestSha256, positive productId/practitionerId, countryCodes, and policies consultation_privacy/future_calculations/marketing/booking with exact text/version/SHA-256. All text hashes are recomputed. Synthetic policy text in tests is not owner-approved legal text.

The dedicated binding must contain a reviewed complete migration ledger and singleton consultation_preview_environment marker matching UUID, origin, manifest hash, synthetic_only=1, enabled=1. Caller configuration cannot replace database marker checks. This marker is NOT Cloudflare API attestation; independently verify the actual binding ID before future deployment. The product must be CONSULT-BAZI, consultation, MYR1300; practitioner Approved. One pre-provisioned enabled dedicated consultation account must exist. No shared ADMIN_TOKEN dependency or automatic account creation.

Five independent key purposes: intake/contact/meeting AES-256-GCM, lookup/challenge HMAC-SHA256. Globally distinct IDs/material, explicit active versions, nonextractable imported keys. All five mandatory here; the existing four-purpose runtime helper remains unchanged. Missing/reused/wrong-length material fails closed. No keys are generated or persisted by composition. Persistent encrypted mock delivery requires its OWN separately approved key-purpose design in U3-B; do not silently reuse meeting/intake keys.

Composition requires a trusted injected transport with kind EncryptedPersistentSyntheticMock, matching databaseId and send function. This descriptor is a dependency contract, not proof of encryption/delivery. U3-A tests use a deliberately non-delivering stub. No persistent delivery implementation exists yet, so public mounting remains blocked. No capture adapter is composed: verified payment confirmation stays unavailable until a separately reviewed synthetic evidence adapter is integrated. All financial source tables remain untouched.

Every future mounted request MUST call assertEnabled before dispatch, including reads. Internal service references are not safe as independently exposed endpoints. Dedicated QY/customer authentication and CSRF still apply after environment checks. For state-changing operations, include the live enabled-marker check in the same atomic authorization transaction to close disable-versus-mutation races. U3-A does not change accepted guards; this is a required U3-B gate. Keep marker identity immutable; only enabled may change under future separate authorization.

## Isolated identity and distributed mock-delivery design (U3-B prerequisite)

Never use Production cookies, customers, ADMIN_TOKEN or portal credentials. Use a separate synthetic database and exact allowlisted origin. Existing __Host consultation cookies remain host-only Secure/HttpOnly; bootstrap may establish only explicitly provisioned synthetic identities. No first-visitor registration. Do not expose the current loopback bootstrap unchanged on pages.dev. Account OTP step-up continues to require independently reviewed account-bound contact; report-contact verification remains separate.

Replace process Map outbox with encrypted persistent synthetic delivery records tied to database/environment, challenge ID, customer/context ID/version, purpose/channel, expiry and consumed/revoked state. Use AEAD plus unique nonces and an approved independent mock-transport key purpose; do not persist plaintext OTP, contacts or private instructions. Write challenge/outbox intent atomically, use an idempotent command key, and clearly distinguish queued intent from available delivery. Worker restarts must not lose pending messages. QY retrieval must recheck dedicated session, intended challenge/customer binding, expiry and attempts; no secret in list metadata, audit, errors or logs; no-store protected response only. Confirmation, replay and rate limits remain authoritative in challenge tables. TTL cleanup is explicit and synthetic-only, not a real-data retention policy. No network provider adapter or delivery fallback is allowed.

## Recovery and operations gates

No down migrations, automatic restore, financial repair or destructive rollback. Disable only the consultation Preview gate/marker under separate approval, then stop requests and inspect sanitized evidence. Preserve additive schema and append-only evidence during code-first recovery. Preserve old key versions and policy versions needed for existing ciphertext/evidence; never replace the database or lose keys as a password recovery shortcut. Provision the dedicated QY account through reviewed private local setup only; no secrets in manifests or command arguments.

Synthetic database disposal requires explicit owner approval, exact account/project/database ID verification, synthetic-only marker and an inventory of only newly created resources. No generic cleanup command is provided. Never target the existing Production database or shared Preview databases.

Authentication/decryption/configuration errors fail closed with sanitized errors; no plaintext/secret diagnostics or fallback to shared authentication. No automatic promotion activation. Report PDF storage remains unsupported; manual preparation/delivery tracking only. Meeting secret retention and backup/key retention policies still require owner approval. Completed private-intake retention is five MYT calendar years; terminal uncompleted retention 90 calendar days, holds preserved, no automatic deletion.

## Required U3-B decisions/evidence

- Exact isolated resource identities, sanitized deployed schema contract, synthetic seed mappings, branch/origin and no-production binding attestation.
- Reviewed public mounting with per-request and atomic mutation feature gates, host isolation and runtime CPU tests.
- Persistent encrypted mock outbox, synthetic identity bootstrap, key provisioning/rotation/recovery and dedicated account provisioning.
- Approved versioned policy text/hashes; promotion stays inactive.
- Synthetic-only payment evidence adapter; real provider reconciliation and live checkout remain out of scope.
- Browser acceptance in English/Chinese on iPhone/Android/desktop; current tests are synthetic API/module/UI-handler tests, not browser acceptance.

No server restart, public endpoints, provider sends, remote operations, Production access, Git commit or deployment performed in U3-A.

## Local validation results

U3-A integration: 62 passed, 0 failed, exit 0 (SQLite, local D1, actual composition import/fail-closed workerd smoke). Existing suites: meetings 30; account step-up 248; availability 48; preferences 13; workflow 50; booking UI 23; customer resume 18; report navigation 15; bilingual 29; foundation 142; runtime 23. Each exit 0; existing subtotal 639, combined 701. No real-browser rendering claim. Local D1 uses supported quick_check plus foreign_key_check; SQLite uses full integrity_check. D1 rejected integrity_check, so that unsupported check was replaced rather than claimed as passed.

No existing tracked files changed. No commit, server restart or remote operations.
