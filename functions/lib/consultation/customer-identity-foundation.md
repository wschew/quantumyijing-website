# C1-C2A-3A: read-only portal bridge and secure context foundation

LOCAL ONLY. No public endpoints, contact-verification records, providers or real credentials. Existing portal/admin/CRM/authentication source is unchanged.

## Identity and request boundaries

createCustomerIdentity requires an explicit server-owned authoritative primary D1-compatible binding and trusted canonical HTTPS origin. It does not call authenticatedCustomer(), update last_seen_at, query broad customer profiles, or accept IDs/verified flags from request JSON. portalIdentity derives only customerId, portalSessionId and expiresAt from a unique hashed portal token, active canonical customer and live unrevoked session. SQLite parses both ISO and existing CURRENT_TIMESTAMP dates as UTC; Windows local timezone parsing is not used. Future-issued or invalid session timestamps fail closed.

Cookie parsing accepts exactly one 64-character lowercase hexadecimal value for each relevant name. Missing, malformed, percent-encoded or duplicated values are rejected. Portal authentication is NOT proof of selected email or WhatsApp ownership. The separate encrypted-intake contact verifier remains unwired and denies access by default. The earlier portal magic-link concurrency/delivery limitations remain out of scope; consultation contexts do not repair or replace that login flow.

All reads pin the trusted request origin, require GET/HEAD, reject a conflicting Origin, and reject cross-site/same-site Fetch Metadata when supplied. Mutations require POST, exact Origin, application/json and same-origin Fetch Metadata when supplied. No CORS permission is introduced. Initial establishment uses the authenticated portal cookie plus the strict Origin/content-type checks as its bootstrap CSRF boundary; there is no context CSRF token yet. Existing active contexts cannot be replaced through establishment. Rotate/revoke require both cookies and the exact session-bound random CSRF token in x-qy-consultation-customer-csrf, validated by its hash in the authoritative SQL query and atomic mutation. Missing Origin is rejected for mutations even if the cookies and CSRF token are valid.

## Context state and secrets

One current context row per portal session; two new tables only: consultation_customer_contexts and consultation_customer_context_events. Context tokens and CSRF material are independent random 256-bit values. Only hashes are stored. The __Host-QY_CONSULTATION_CUSTOMER cookie is Secure, HttpOnly, SameSite=Strict, Path=/ and has no Domain. Its lifetime is at most 30 minutes and never extends beyond the live parent expiry. CSRF material is returned only in the intended no-store response; raw context material is carried only by Set-Cookie. Do not log response bodies/headers or include them in evidence.

The stable context ID identifies a lineage; its generation version advances at every establishment after expiry/revocation, rotation or revocation. Rotation/re-establishment replace BOTH token and CSRF hashes. Revocation never restores old credentials. Explicit establishment with a still-valid portal session may create a new generation after context expiry/revocation. This is not resurrection of the revoked token. Portal logout/deactivation/expiry blocks every generation until a valid portal session exists. A lost active context cookie cannot bypass CSRF through bootstrap; reauthenticate to obtain a new portal session or wait for expiry.

The bridge validates the parent again when validating a context, and context SQL ties the canonical customer and exact parent session together. Another customer or another portal session for the same customer cannot substitute a context cookie. Effective authorization expiry is the minimum of current parent and context expiry.

## Atomicity and revocation races

Prechecks are advisory. Establishment INSERT SELECT and all conditional UPDATEs recheck the parent token hash, active customer, expiry and revocation against database time. Existing rows use exact version CAS. Rotation/revocation additionally require current context token hash, CSRF hash, live context and generation. The immediately following event INSERT requires changes()=1; zero rows force a fixed trigger rejection and roll back the entire batch. No automatic retries are performed. A stale revoker cannot revoke a newly rotated generation; a revoked or expired context cannot rotate after an earlier precheck.

Events contain only opaque IDs, versions, fixed action labels and database timestamps. BEFORE INSERT rejects PK/unique replacement before SQLite deletes evidence, independent of recursive_triggers. Existing evidence cannot be updated/deleted. Context ownership is checked by database triggers without changing the frozen portal schema. Foreign keys RESTRICT deletion of linked parent/customer state; future portal cleanup/account-deletion policies must be reviewed before migration approval.

Returned principals are informational snapshots, not transferable authority. Every future private operation must call authorize again. Future intake mutations must ALSO incorporate live context/parent and latest consent checks into the same atomic intake transaction. No intake persistence or contact proof is added here. QY administrative authorization remains the separate committed dedicated QY account; never treat portal cookies or shared ADMIN_TOKEN as QY authority. Customer-versus-QY mutation audit attribution remains a later integration requirement.

## Tests and remaining gates

Synthetic SQLite and actual local D1 tests use the committed portal schema and production bridge/security functions. Controlled interleavings inject real database mutations between prechecks and batch execution; they do not claim to exercise all live distributed-runtime scheduling. Tests cover strict cookies, minimal read-only identity, expiry/revocation/deactivation, ownership substitution, CSRF/Origin, rotation, stale CAS, rollback and secret-free tables. No real browser/network/provider requests are made.

Before Preview/public wiring: independent review; owner-approved canonical origin/context lifetime; primary-binding and runtime validation; request-volume controls and context/event retention; existing portal login-risk disposition; verified contact module; atomic intake/consent authorization; QY audit attribution and runtime encryption/HMAC key management. Do not add a public endpoint, contact challenge, PDF workflow or deployment under this step.

## Credential issuance outcome

Creation/re-establishment and rotation require at least five seconds of parent lifetime inside the guarded mutation; revocation does not require that issuance headroom. After commit, credential issuance rechecks the exact context generation, new token/CSRF hashes, ownership, live parent and at least one second of remaining effective lifetime. A changed/expired parent or context returns 409 with committed:true and issued:false; a post-commit verification error returns 503 with those flags. Neither response contains credentials or Set-Cookie. These outcomes do NOT mean rollback occurred; do not automatically repeat the mutation. Reauthenticate or obtain an owner-directed recovery decision. Successful issuance reports committed:true and issued:true. Revocation after the final check is still enforced by fresh authorization on every subsequent operation.

## C1-C3 navigation recovery

New context credentials derive a stable CSRF secret with HMAC-SHA256, using the random 256-bit HttpOnly context-cookie token as the ephemeral key and an origin-bound, versioned domain-separation message. Only the CSRF hash and context-token hash persist. The session token is never returned to JavaScript; no CSRF, session credential, OTP or private intake is saved in web storage. Rotating the context cookie changes CSRF; ordinary resume does not rotate or extend anything.

The isolated controller's POST context/resume requires exact trusted Origin, JSON, same-origin fetch metadata and both strict session cookies. It revalidates live canonical ownership, parent session, context generation, expiry and the expected CSRF hash before returning the existing CSRF capability and minimal context metadata, with no-store and no CORS. This bootstrap intentionally recovers CSRF without requiring its lost prior copy; every business mutation still requires the normal session-bound CSRF guard. GET account/state independently reauthorizes and returns only pending-challenge metadata and current step-up proof state, never OTPs, contact contents or hashes.

Legacy active contexts issued with independent random CSRF cannot be recovered by this method: hash mismatch fails closed. They require their still-held original credentials, expiry or separately authorized authenticated rotation. Never overwrite or bypass a legacy hash on resume. Existing synthetic instances remain untouched until an owner-approved restart.
