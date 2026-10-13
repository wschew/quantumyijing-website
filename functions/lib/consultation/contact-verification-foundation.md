# C1-C2A-3B: local consultation contact verification

No public routes, email/WhatsApp provider adapters, PDF storage or intake/payment integration. Existing portal, QY authentication, CRM, subscriptions, accounting, affiliate and WhatsApp source is unchanged. No existing contact address or verified flag establishes ownership.

## Flow and scope

1. A live consultation customer context requests a challenge for a chosen email or an international E.164 WhatsApp number. Request bodies cannot supply customer IDs or verified flags. The subject is obtained from the committed customer identity guard.
2. The challenge expires within ten minutes, further bounded by the current context and portal expiry. It is bound to canonical customer, exact context generation, channel, recipient fingerprint and report_delivery purpose. The customer receives only its opaque ID, channel and expiry, never the response secret.
3. The dedicated QY consultation account reads private delivery instructions. It manually emails the challenge or manually sends it through the chosen WhatsApp account. This foundation supports MANUAL DELIVERY FOR BOTH CHANNELS. No send is performed by this code. QY marks delivery using authenticated Origin/CSRF and revision CAS. A delivery assertion alone is never proof of ownership.
4. The same customer/context returns the random challenge response. Only an exact HMAC-verified response to a live Delivered challenge can create a verification. It is single-use; repeated, stale, superseded, locked, expired or other-context responses fail.
5. verifiedContact resolves current authoritative evidence and decrypts only the verified contact value. It is a trusted server-side adapter, not a public serializer. A returned value is a snapshot, not standalone permission for a subsequent intake write. Later intake persistence must recheck proof ID, purpose, expiry, revocation, customer, context generation and consent inside its atomic transaction.

Contact ownership means possession of this challenge through the selected channel at verification time. It does not prove legal identity, adult eligibility, WhatsApp SIM ownership or future continuous control. Birth/adult/self-booking validation remains the existing intake requirement. It neither changes canonical CRM identifiers nor creates/registers accounts. Shared contacts are not automatically merged into canonical customers. Existing legacy portal cookie fixation risk still requires account-bound step-up or a verified trusted-host posture before private intake exposure; verifying an arbitrary chosen delivery address is not an independent fix for that risk.

## Cryptography and secrets

Recipients and manual response codes are encrypted with non-extractable AES-256-GCM keys, fresh 96-bit nonces and 128-bit tags. AAD explicitly binds record ID, customer, context/generation, channel, Challenge/Proof kind, key ID, fingerprint key ID/value, challenge key ID/digest and source challenge ID. Context fields are allowlisted. Proof ciphertext contains only contact, never the code. Challenge ciphertext contains the code solely to permit authorized manual QY delivery; no plaintext secret column exists.

Lookup fingerprints use HMAC-SHA256 over a domain-separated normalized channel/address, never bare hashes. Response digests use a separate HMAC key with a different domain and bind the full challenge identity/context/channel/fingerprint plus the 256-bit response. Verification uses native WebCrypto signature verification. Keys must be non-extractable, correct algorithm/length/usages and available under the recorded identifiers. Unsupported versions fail closed. Active/historical AES, lookup and response keys are supplied by server-owned providers; raw keys are never database/source/log fields. Runtime secret provisioning/rotation/recovery is NOT implemented here. Never alias the same actual AES key under different key IDs.

A permanent key-ID/nonce ledger rejects lifetime nonce reuse across challenge and proof ciphertexts, including REPLACE, without relying on recursive_triggers. No automatic nonce retry occurs. Ledger rows contain only key ID and random nonce, no customer reference. Retiring ledger state requires separate key-retirement design and approval.

## Transactions, attempts and replacement

Five additive tables: consultation_contact_control, consultation_contact_nonces, consultation_contact_challenges, consultation_verified_contacts, consultation_contact_events.

Every customer mutation rechecks both hashed cookies, CSRF, exact context version, active canonical customer and live parent inside the transaction. QY operations use the committed dedicated guard and independently repeat live QY session, account generation, enabled state and hashed credentials in SQL. ADMIN_TOKEN is not read or accepted. Returned/client actor IDs are never authority.

Atomic customer-wide quotas allow three requests and ten response attempts per fifteen-minute window. Each challenge permits five wrong responses before locking. Requesting a new contact or changing contexts does not reset these customer-wide limits. Malformed/unauthenticated/replayed/locked operations do not append unrestricted failure logs. Successful reservations and result events are bounded by the quotas. QY instruction access is audited once per QY session/challenge; later reads revalidate authorization without duplicate writes. Global traffic/CPU limits remain a prerequisite before public wiring.

The immediate audit gate requires changes()=1 after conditional reservations or mutations; zero rows abort the entire D1 batch. Confirmation revision/state CAS ensures concurrent responses create at most one proof. Later nonce/proof/audit failure rolls back counters, challenge state and events. No automatic mutation retry or blind delivery retry is implemented. Database errors return sanitized categories; no original exception/provider response is logged.

New requests supersede pending challenges for the same customer/channel and revoke that channel's previous verification before the replacement is verified. This includes a request from another legitimately authenticated context of the same customer. Email and WhatsApp remain independent channels. Changing contact does not amend financial/CRM records. Rotation, parent logout, expiry and customer deactivation invalidate the bound proof. Evidence does not automatically transfer to a new context generation.

BEFORE INSERT collision guards reject replacement of challenges, proofs, events and nonces before evidence can be erased. Challenge bindings/ciphertext are immutable. Valid transitions, bounded counters and revision increments are database enforced. Proofs cannot be reassigned or revived after revocation. Foreign keys preserve customer/context/source relationships. Event categories and actor references are fixed/opaque: Customer uses the consultation context, QY uses its dedicated session. No contact values, codes, birth information or PDFs enter operational audit records.

## Delivery and retention prerequisites

The manual operator response intentionally includes the chosen recipient and response secret ONLY after dedicated QY authorization. A future QY UI must prohibit logging, caching, screenshots/evidence capture or public serialization of those responses. Only customer confirmation creates ownership evidence; QY delivery approval alone cannot do so.

No automatic email, WhatsApp webhook, inbound-message processing or PDF delivery is added. A separately approved email adapter would need idempotency, delivery-failure handling and explicit live-provider approval. Challenge/contact evidence retention and legal-hold/deletion policy require review before real data; no automatic deletion exists. Logical challenge expiry prevents reuse but does not erase encrypted historical rows. No consultation-retention period is silently extended. Manual PDF delivery/deletion policy remains unchanged and no PDF workflow is implemented.

## Local tests and remaining gates

Tests use generated in-memory keys, synthetic contacts and the actual committed customer/QY guards. SQLite and local D1 exercise manual email/WhatsApp confirmation, both authentication boundaries, cross-customer/context substitution, replay, rate limits, revocation races, duplicate confirmation and late proof-insert rollback. Expiry is tested through an explicit test-only SQL clock substitution; other D1 tests use native database time. No provider is called.

Before public/Preview use: independent review; runtime key management and browser/primary-D1 validation; canonical account step-up disposition; delivery procedures and proof-freshness/retention policy; traffic controls; approved operator UI; atomic consent/intake authorization. No public endpoint is authorized by this commit.
