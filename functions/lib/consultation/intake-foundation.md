# C1-C2A-2 Step 1: remediated local private-intake foundation

No public routes, customer authentication, booking/payment integration, live repository or provider calls are installed. The existing portal identifies a canonical customer but does not preserve the verified contact used at login. WhatsApp contact ownership is not established. Customer access therefore defaults to denied behind unwired, server-owned verifier contracts. Do not modify frozen authentication to fill this gap.

## Storage and encryption

Five additive tables separate encrypted intake drafts, append-only consent events, command receipts, manual reviews and sanitized access events. No generic CRM, marketing, affiliate, analytics or AI serialization hooks are added. The legacy private-intake table is not used.

AES-256-GCM uses a fresh random 96-bit nonce and 128-bit tag. AAD binds intake ID, canonical customer ID, payloadVersion, schemaVersion and keyId. Context rejects unknown properties and the envelope is built from an explicit allowlist. Birth details/questions cannot be copied into envelope metadata. Key providers must return non-extractable 256-bit AES-GCM keys with the required usage. Unsupported keys/versions, malformed envelopes and failed authentication produce generic errors. No key bytes belong in SQL, source or evidence. Nonce collision is rejected by UNIQUE(key_id,nonce); do not reuse the same actual key under multiple identifiers. Ciphertext length remains observable.

payload_version changes only when encrypted payload bytes/key/schema change. revision is a separate metadata CAS counter and increments on every row update. Legal-hold and retention-review changes leave payload_version, nonce and ciphertext unchanged. The SQL trigger enforces this distinction. intakeUpdatePlan resolves the current stored versions and cryptographically authenticates the proposed next-version envelope before building SQL guarded by both versions. Relabelling stale ciphertext fails GCM; submitting an old version fails the trusted DB check. Read the current envelope through readPersistedEnvelope after authorization; never decrypt a caller-supplied envelope as though it were the current persisted record. AES alone cannot detect whole-database rollback; backups and recovery need separately reviewed freshness controls.

## Append-only evidence and consent

BEFORE INSERT triggers check every consent PK/unique collision, command composite PK collision and audit PK collision before REPLACE can delete old rows. RAISE(ABORT) rejects the statement regardless of recursive_triggers configuration. Existing UPDATE/DELETE guards remain. Ordinary noncolliding INSERTs work. Consent events require consecutive per-intake/purpose sequences, non-backdated timestamps, and a latest Granted event before Withdrawn. Customer ownership is enforced by composite foreign keys.

createConsentReader resolves DB-owned snapshots scoped to customer/intake/purpose. consentAllows is asynchronous and fails closed for untrusted, malformed, mismatched or withdrawn evidence and malformed policies. It re-reads the latest persisted event for every decision, so an earlier granted snapshot stops authorizing after withdrawal. Privacy, future calculations and marketing remain independent; no classroom sharing purpose exists. It is not a transaction guard for later mutations: a future operation must recheck consent and session authorization inside its own atomic persistence boundary.

withdrawConsent accepts a trusted snapshot, creates a fresh event ID and next sequence, preserves policy/purpose/customer linkage and rejects backdating. withdrawalPlan checks the prior grant ID/sequence/state against the latest stored event inside a CAS UPDATE, followed immediately by a changes()-guarded command receipt, new consent event and sanitized audit. Privacy withdrawal also adds a manual review record. The whole plan MUST run in one D1 batch. Concurrent withdrawal, stale snapshots, duplicate commands or any subsequent insert failure abort all effects. No automatic write retries are provided. A later replay service may return a prior receipt only after matching the customer, operation and keyed HMAC of canonical command content. fingerprint_key_id refers to a separate HMAC key; never persist an unkeyed private-input digest.

All plan builders, readPersistedEnvelope and createConsentReader are trusted internal persistence helpers, NOT authorization boundaries. Call dedicated QY session authorization or verified customer ownership before each operation. Later integration must atomically revalidate revocation, ownership and purpose authorization. No public endpoint may directly accept their customer IDs, fingerprints, actor references or policy configuration.

## Identity, data minimization and administrative access

Customer proofs are minted only from server-owned identity/contact verifiers, expire and are scoped to their canonical customer. Client IDs, roles and verified flags are not accepted in intake input. Validation calculates adulthood from birth date and requires adult/self-booking acknowledgements; it does not claim to independently authenticate a DOB. Verifiers must establish existing customer session, current contact ownership, CSRF/Origin for mutations and expiry. Administrative reads call the committed dedicated QY consultation session guard each time; shared ADMIN_TOKEN cannot bypass it. Tests include a real configured authentication service with a valid-session positive control.

A trusted country registry and approved nonempty policy versions/hashes are required. Contact values come from the verifier and remain encrypted. Operational projection contains only ID/revision. Audit construction uses fixed event categories, opaque event IDs, canonical customer references and timestamps, never birth information or questions. This step provides no future-application reader. Later calculations require verified identity, purpose-specific authorization/basis, minimum necessary fields and sanitized auditing.

## Retention and manual PDF policy

Completed intake expires at 23:59:59.999 MYT on its fifth calendar anniversary; February 29 clamps to February 28 in a non-leap anniversary year. Terminal expired/declined/cancelled-uncompleted intake expires at the end of calendar day 90 after the terminal MYT date. A final status must not carry a contradictory completion/terminal date. Pending drafts have no inferred deadline and need a separately approved draft policy before live use.

Expiry triggers REVIEW eligibility on the following millisecond, not deletion. Legal holds preserve records; withdrawal/deletion requests require authorized manual review. Optional future-calculation consent never extends intake retention. Statutory financial/audit retention remains separate. The committed legacy 24-month helper is untouched and MUST NOT govern these new records. A future booking adapter must set the new retention basis/deadline atomically.

No website PDF repository, Google Drive API, automated attachment or delivery is added. QY prepares and sends PDFs manually by Email or WhatsApp and deletes its delivery copy after confirmed delivery under the separately approved manual policy. This module implements no PDF workflow or retention extension.

## Remaining integration gates

Verified customer/contact bridge; runtime encryption/HMAC key management, rotation and backup recovery; atomic authenticated repository and revocation-race enforcement; approved policy documents/country registry; pending-draft policy; legal-hold authorization and manual deletion procedure. No Preview deployment or real-data use is authorized by this milestone.
