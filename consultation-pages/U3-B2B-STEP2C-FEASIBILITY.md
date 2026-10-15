# U3-B2B Step 2C — Free-only administrator authentication

Date: 2026-10-15. **Proposed architecture qualification: UNKNOWN. Implementation and activation remain BLOCKED pending owner decisions and verification.** Remain on Cloudflare Free. The earlier Step 2B plan-change suggestion is superseded by this owner decision; it is not a recommendation for this phase.

## Scope and baseline

Observed branch: `c1-bazi-consultation-development`. Required and observed HEAD: `3655583f3dfb806dc46cfda8ed575a100da7b8fd`.

The working tree was **not clean at Step 2C entry**: it contained the five unstaged/untracked Step 2B investigation files. Those files were preserved without edits in this phase. No AGENTS.md was found in the workspace inventory. Step 2C adds only this report, two test-only scripts and measurement JSON. There are no application, authentication, deployment, dependency or SQL changes. Existing PBKDF2 remains enabled exactly as before, at 600,000 iterations with unchanged password requirements. Nothing was staged or committed.

Step 2B found isolated PBKDF2 Node process CPU p50/p95/max of 141/172/172 ms; successful packaged administrator login was 156/172/234 ms. Actual workerd login host wall time was 494.596/581.484/1669.309 ms, with workerd CPU unavailable. The old login path was therefore blocked for Free qualification, not proven to exceed a particular deployed meter. Other measured routes reached 21/50 D1 statements. [Step 2B report](U3-B2B-STEP2B-RESULTS.md).

Current implementation review:

- `auth.js` reserves a guessing attempt, reads the dedicated account, performs PBKDF2 and then atomically creates the session/audit. Valid-length wrong usernames also incur the KDF. Edge protection alone cannot remove that legitimate-login cost.
- Sessions use dedicated `__Host-QY_CONSULTATION` cookies, hashed random session/CSRF tokens, an eight-hour maximum, account enablement, expiry and `password_version` checks. Mutation paths enforce exact origin and CSRF.
- Authorization also exists inside atomic SQL in `workflow-guards.js` and `customer-contact.js`. Updating only the JavaScript login/authorization function would leave incomplete revocation enforcement.
- The account schema requires PBKDF2 fields and exact iteration strength. The existing audit event CHECK admits a fixed vocabulary. Preview composition expects exactly 15 migrations, and validates their object inventory/ledger/hash on live requests.

## Recommended architecture

Investigate **dedicated QY WebAuthn login using ES256/P-256 with mandatory user verification**, then issue the existing C1 session cookie. Customer authentication, customer identity, OTP proofs, encryption/HMAC separation, origin/CSRF, financial restrictions and Production isolation stay intact. No external identity service is required for this design.

Prefer two independently held, UV-capable, device-bound authenticators: a routine authenticator and a physically separate reserve. Use authenticator PIN/biometric verification, not touch-only possession. Hardware acquisition/custody is an owner decision; Free-only hosting does not imply devices have no cost. Synced passkeys are an alternative only if the owner explicitly accepts the sync-account/recovery trust boundary. FIDO describes both synced and device-bound passkeys. [FIDO passkeys](https://fidoalliance.org/passkeys/).

Use `attestation: 'none'` initially to avoid certificate-chain/metadata-service complexity. This does **not** prove hardware provenance, manufacturer, secure-element storage or independence of two devices. Owner-attested physical custody plus the signed backup-eligibility flag is a policy input, not manufacturer attestation. If cryptographic hardware provenance becomes mandatory, stop and scope an attestation design and registration CPU investigation separately; do not silently weaken that requirement.

Keep the PBKDF2 source, verifier and strength unchanged during investigation and implementation testing. A future Free-only cutover would require explicit authorization to stop requiring routine online PBKDF2 and to prevent a public password fallback from bypassing passkeys or retaining the CPU blocker. That routing/policy change is **not authorized or performed here**. PBKDF2 can remain part of an owner-controlled offline maintenance procedure, never the sole proof authorizing a new authenticator.

Architecture flow: trusted Preview origin → bounded ceremony endpoint → validated WebAuthn response → single-use D1 transaction → dedicated C1 session → fresh account/session/credential checks on every private request. Optional Access protection can precede this flow after separate owner approval and verified coverage.

## RP and browser boundary

Proposed RP ID, taken from existing server-owned Preview constants:

`c1-bazi-consultation-development.qy-c1-consultation-preview.pages.dev`

Only accepted origin:

`https://c1-bazi-consultation-development.qy-c1-consultation-preview.pages.dev`

These are proposed bindings, **not an attestation that the hostname is provisioned, approved or owner-controlled**. Require owner confirmation before enrollment. Do not use `pages.dev`, the project parent hostname, wildcard origins, branch-pattern matching, hash-deployment hosts, Production or request-supplied Host/Origin to choose the RP configuration. A changed RP ID requires fresh enrollment; plan that before real credentials exist. Keep branch-alias redirects out of ceremony processing.

For the production implementation, follow the standard's registration and assertion validation algorithms: check ceremony type, expected challenge and exact origin; enforce RP ID hash, user presence and required UV; validate the credential/public-key algorithm and ownership; verify the assertion signature over authenticator data plus the client-data hash. ES256 WebAuthn signatures need the appropriate DER-to-Web-Crypto representation conversion. Check backup flags and counter policy. [WebAuthn relying-party operations and signature formats](https://www.w3.org/TR/webauthn-3/#sctn-rp-operations).

Application policy: deny cross-origin ceremonies and frames, reject unexpected top-origin/extension behavior, and do not enable related-origin or AppID alternatives. Handle an omitted `crossOrigin` according to the standard rather than requiring a property that older clients may omit. Existing CSP/frame restrictions remain. WebAuthn is scoped to an origin/RP, not `/qy`: an XSS in the customer UI on the same origin also threatens administrator actions. A separate administrator origin would be a separate owner-approved deployment/binding design, not an assumed protection.

## Ceremony and challenge design proposal

The following is an architectural proposal, not implemented SQL or a complete security protocol. Use a reviewed WebAuthn verifier with a pinned reproducible dependency, bounded parsing and workerd compatibility tests. SimpleWebAuthn documents expected-origin/RP verification and stored credential data, but it has not been installed, audited, bundled or CPU-qualified here. Do not promote the benchmark's deliberately incomplete parser into application code. [SimpleWebAuthn server documentation](https://simplewebauthn.dev/docs/packages/server).

### Routine authentication

1. Begin only on exact-origin JSON POST, with bounded body/rate checks. Issue a random 32-byte challenge and create or reuse a separate short-lived random HttpOnly, Secure, host-only pre-authentication cookie. This cookie grants no QY rights. Allow a short overlapping login attempt window for normal tabs without invalidating another in-flight attempt.
2. Return an authenticated challenge ticket containing challenge nonce, purpose `QY_LOGIN`, account binding, cookie digest, exact RP/origin, issued/expiry time, credential-policy version and account security epoch. Proposed lifetime: 120 seconds; no extension on failed attempts. Use a **new, dedicated HMAC-SHA256 challenge-ticket key**, with key IDs and rotation; never reuse contact/lookup/OTP/encryption keys. Authenticate a fixed, bounded serialization. A signed ticket is public challenge context, not an authentication credential.
3. Stateless begin tickets avoid allocating a D1 challenge row for every anonymous visitor. D1 still holds live account state, bounded abuse counters and successful ticket consumption. Ticket HMAC, shape, size, purpose, browser binding and expiry must pass before expensive assertion processing. Check database time and live epochs again inside the final transaction. A valid assertion is still mandatory.
4. Use `navigator.credentials.get()` with required UV, ES256 credentials and the exact RP. Select only active, account-bound credentials. Discoverable credentials can avoid publishing an administrator credential-ID list, but require a validated returned user handle. Provision a random stable user handle per QY account, independent of email/name; credential IDs and user handles are not authorization claims.
5. Finish validates client/authenticator data and signature using a credential loaded from dedicated D1. Enforce byte limits before decoding; reject unsupported algorithms, malformed DER/COSE, trailing/unexpected data and oversized inputs. Counters are not a sole replay control: zero/non-monotonic counters require a reviewed policy, particularly for synced credentials. Device-bound positive-counter rollback triggers an auditable security denial/review, not permanent account lockout.
6. In **one D1 batch transaction**, insert a unique used-ticket nonce, recheck unexpired purpose/browser/account/credential/policy bindings, compare-and-swap credential revision/counter, create the ordinary session, insert immutable authentication provenance and append audit evidence. A zero guarded update, duplicate nonce, stale epoch, revoked key or failed audit must abort the whole batch. A read before crypto is insufficient for revocation-race safety. Return the cookie only after commit. Concurrent submissions of one assertion can create at most one session.

Keep consumed nonces until ticket expiry plus an agreed clock margin; deletion after that is safe only if expired tickets can never be accepted. Index expiry and nonce uniqueness; cleanup is bounded, local to allowed invocations, with a storage alarm/runbook. Old ticket keys remain accepted only for the short validity window, or rotation invalidates in-flight ceremonies. No cross-request authorization decision cache is introduced.

### Registration and adding an authenticator

No public self-enrollment or password-only enrollment. First enrollment requires an owner-authorized out-of-band bootstrap grant bound to the dedicated account, exact RP/origin, purpose, expiry, policy and browser flow. Store only its high-entropy capability digest. Provisioning/transferring such a grant to a real Preview environment needs separate authorization; this investigation creates none.

Registration options use a random stable user handle, `userVerification: 'required'`, ES256 only, explicit resident-key policy and `attestation: 'none'`. The browser creates the credential. The reviewed verifier checks the expected ceremony, origin/challenge/RP and authenticator data, validates bounded attestation/COSE public-key input, and enforces UV and backup policy. Store a new key as pending. Require a fresh successful assertion with that new key before activation. Registration parsing and optional attestation costs have **not** been benchmarked here.

Bootstrap continuation capabilities must be separate from `consultation_auth_sessions`: an ordinary session inserted early would satisfy legacy SQL guards and accidentally grant QY authority. First enrollment remains in an enrollment-only state until two independent authenticators have been registered and tested, the owner has verified custody, and an atomic activation transition succeeds. No QY business endpoint accepts the enrollment capability.

For subsequent additions, require an existing passkey-authenticated session, CSRF, a fresh UV assertion within a proposed five-minute window, and a single-use registration grant bound to that session and operation. A stolen ordinary cookie alone must not add a key. Reject duplicate credential IDs and cross-account bindings. Bound active credentials to four initially, with explicit replacement workflow. Re-verify both options and completion authorization; do not trust earlier authorization across requests.

## Sessions, revocation, audit and abuse

Retain the dedicated cookie format, server-hashed bearer tokens, CSRF tokens and eight-hour hard maximum. Proposed additional idle limit: 30 minutes, with a bounded D1 update if approved; this is a policy choice requiring budget tests, not an existing feature. Require fresh UV for key management/recovery and other owner-designated high-impact operations.

Add immutable per-session provenance: method `WebAuthn`, credential ID, UV evidence, authenticated time and security epoch. Keep the existing `password_version` check as a legacy global revocation guard; a new separate `auth_epoch` covers passkey policy/enrollment changes. Do not remove account enablement or version checks. Update **all** fresh read guards and embedded mutation SQL to require active passkey state, active credential, matching epoch and session provenance after cutover. No client role/header/principal becomes trusted authorization.

Revoking a lost key must atomically disable that credential, advance the security epoch/global version, revoke affected or all QY sessions, and append evidence. Proposed simple policy revokes all QY sessions on any credential/policy/recovery change. Existing password rotation/revoke-all must continue invalidating passkey sessions too. Logout remains server-side revocation. Database backup restore must invalidate sessions, outstanding grants and old challenge tickets to avoid resurrecting revoked credentials; restore is not a transparent rollback.

Retain the existing session audit for compatible events, and add a dedicated immutable event table for enrollment, credential confirmation/removal, recovery, counter anomalies and policy changes. Never overload unrelated legacy event names to evade its CHECK. Log internal credential references and minimal decision codes; never private keys, raw assertions, tickets, bootstrap secrets, session tokens or biometric data. Failure floods update bounded summaries rather than unlimited audit rows. Retention and export custody require owner decisions.

Do not copy the password login's account-wide five-failure lock onto public passkey finish calls: an attacker could lock the sole administrator out without possessing a key. Use bounded source/pre-auth-browser throttles plus a global resource budget, validated input sizes and cheap reject paths. Do not let unauthenticated failures disable credentials or bump account epochs. Successful signatures and recovery controls remain mandatory. IP signals must come from the trusted deployment boundary, not arbitrary headers.

No Free design can promise availability under unrestricted request floods. Global throttles can still deny legitimate login; bot-created browser tokens evade per-browser limits; source identifiers can be shared. Prove bounded D1 growth and operator recovery under load. Optional Access can reduce exposure, but is not assumed. No provider-dependent anti-bot service is added by this proposal.

## Enrollment, reserve and recovery operations

| Situation | Proposed control | Availability/security tradeoff |
|---|---|---|
| Initial enrollment | Owner verifies dedicated project/RP/account and authorizes short-lived enrollment-only grant; register and test routine plus reserve UV keys before business-session activation. | No first-user-wins or online-PBKDF2 dependency. Owner access and safe capability transfer must be designed. |
| Routine key lost | Authenticate with independently held reserve; fresh UV; revoke lost key, invalidate all QY sessions, record incident, enroll/test replacement. | Separate reserve custody is essential; a second copy in the same sync account is not independent recovery. |
| Reserve key lost | Use routine key with fresh UV and owner-reviewed replacement; preserve at least two tested keys. | No silent removal of the last tested recovery option. |
| All authenticators lost | No SMS/email/password-only bypass. Suspend account/session access; independently authenticate owner through the approved operational custody/control-plane process; issue a one-use enrollment-only reset grant; enroll two keys and record the reset before activation. | Deliberate downtime. Exact owner identity verification, approvers, secure transfer and recovery timeline remain blockers. A controller able to change Worker code/D1 is already in the system's root trust boundary. |
| Suspected endpoint/key compromise | Revoke sessions/credentials through surviving trusted operator path, advance epochs, investigate code/origin, then re-enroll on a trusted device. | Passkeys cannot repair compromised same-origin JavaScript or a compromised deployment owner. |
| Hostname/RP change or restore | Plan a controlled re-enrollment with independent owner approval; reject old tickets and revoke old sessions. | Do not broaden RP/origin checks for convenience. |

A reserve key's local PIN is not a server password. Do not centralize the PIN with the key, or treat UV as proof of a particular human identity. If the owner cannot maintain an independent reserve and a credible all-devices-lost process, deployment remains blocked. Printed high-entropy recovery material, if later approved, can authorize only a heavily controlled enrollment-only flow; it is not a reusable QY bearer login.

## Alternatives, including Access

| Design | Free-only feasibility and tradeoff | Position |
|---|---|---|
| Dedicated QY passkeys → C1 sessions | Public-key verification is promising locally; preserves application-owned accounts, sessions and revocation. Registration/recovery/parser/route qualification remain work. | Recommended local implementation candidate; **UNKNOWN**. |
| Access in front of existing password login | Restricts exposure, but each admitted routine login still does PBKDF2. Does not solve Step 2B. | Optional perimeter only, not a CPU solution. |
| Access plus QY passkeys | Adds a second policy boundary, operator dependency and possibly another JWT verification on covered requests. | Optional defense only after owner approval and verified Free entitlement/coverage. |
| Access identity → C1 session, replacing routine password login | Potentially inexpensive signed-JWT verification, but delegates administrator authentication/recovery to Access and its identity system. Needs issuer/audience/signature/time checks, stable subject-to-QY mapping, session/revocation coupling and MFA policy review. | Separate architecture/owner decision; not assumed available or equivalent. |
| Owner-operated signed-request tool | ES256/Ed25519 proof could avoid KDF and external providers, but requires bespoke origin/intent/replay/key-custody UX. Lacks WebAuthn's browser-mediated binding and standard recovery experience. | No advantage demonstrated; do not implement a custom login protocol here. |
| Password plus TOTP / email OTP / magic links | Password still incurs KDF; passwordless OTP/email shifts trust, is phishable and may require external delivery. | Does not meet the proposed assurance/constraints. |
| Client-side derived password, cached login decisions, weaker hash or split KDF | Replay/credential-equivalence, revocation, protocol and budget problems; no demonstrated secure Free design. | Rejected as a shortcut. |

Cloudflare documents Free Zero Trust offerings for small teams, but this does not establish the owner's actual entitlement, seat allocation, identity configuration or application coverage. No account was inspected. Pages Preview URLs are public by default; its Preview Access toggle has coverage exclusions and does not by itself attest protection of every project/custom/alias URL. All alternate routes to admin APIs, static QY UI, bootstrap and maintenance must be verified separately. Do not inadvertently gate customer/OTP traffic with an administrator-only policy. [Cloudflare plans](https://www.cloudflare.com/plans/), [Pages Preview Access](https://developers.cloudflare.com/pages/configuration/preview-deployments/#customize-preview-deployments-access).

Access headers alone are not identity proof: Cloudflare instructs Workers to validate the Access JWT. If considered, pin the expected issuer, audience and algorithm, check times and map an approved stable subject to account 1; an email string or arbitrary `Cf-Access-*` header is insufficient. Validate every applicable request and keep local authorization/revocation. Key-material caching with expiry/rotation is distinct from caching authorization decisions; key fetches would require separately approved provider/network integration. An identity-provider outage or cached Access session can create a revocation gap unless explicitly handled. [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

## Schema and migration impact — design only

**Do not edit or rehash any of the 15 pinned migrations.** Adding real passkey support cannot be achieved solely by changing frontend login UI or putting a public key into the existing password hash columns.

Proposed additive schema, names subject to implementation review:

| New object | Required contents/invariants |
|---|---|
| `consultation_webauthn_account_state` | Dedicated account FK, random unique user handle, fixed RP, enrollment/active/suspended state, security epoch and policy version. |
| `consultation_webauthn_credentials` | Unique bounded credential ID, account FK, validated COSE key/normalized ES256 public key, algorithm, sign counter/revision, backup flags, pending/active/revoked state, lifecycle times, optional bounded transport/display metadata. No private keys. |
| `consultation_webauthn_used_tickets` | Unique nonce digest, purpose/account/browser binding, expiry and consumed time, indexed cleanup; successful use inserted atomically with its action. |
| `consultation_webauthn_enrollment_grants` | Hashed one-use grant, purpose/account/RP/owner authorization, expiry/revocation, capability restrictions and browser/session binding. |
| `consultation_webauthn_session_evidence` | Immutable FK to existing ordinary session, credential and epoch, UV/method/authentication time; no enrollment capability here. |
| `consultation_webauthn_events` and bounded abuse controls | Immutable dedicated event vocabulary; no secret payloads, indexed retention; finite throttling rows/counters. |

The old account/session tables can retain their PBKDF2 fields and global version semantics. New tables/triggers can add proof provenance without editing old SQL files. Extending the old audit CHECK or session column constraints would require an additive rebuild migration instead; that is unnecessary for the proposed evidence-table approach. All new FK, immutability, fail-closed change-count assertions and transaction rollback behavior need testing.

A separately approved migration 16 (or new versioned extension manifest) is required. Merely adding a SQL file is insufficient: `preview-composition.js` hardcodes 15 and expects exact ledger/object counts; the migration verifier inventories all C1 SQL; builder/package inventory, schema contract, migration planner, rollback tools, policy/keyring allowlists and tests must support the explicit new manifest version. Preserve the original fifteen canonical hashes and order; append reviewed extension metadata and expected hash rather than silently changing old pins. The dedicated seventh HMAC purpose also requires explicit keyring/config validation changes; do not relax six-purpose checks globally.

Guard changes are required in `auth.js`, `workflow-guards.js`, `customer-contact.js` and any transitive inline QY SQL found by a complete implementation audit. Customer/OTP schema and encryption keys remain independent. Old code expecting 15 migrations must fail closed against the new schema unless a reviewed compatibility strategy exists. Post-migration rollback cannot simply redeploy the old Worker; retain a schema-aware disabled build, and use owner-reviewed recovery instead of destructive rollback.

## Proposed CPU and D1 budget

Cloudflare documents 10 ms Free Worker CPU per HTTP invocation and 50 Free D1 queries per invocation. Waiting for database/network results is distinct from CPU; Web Crypto verification itself remains Worker work. No local success proves those deployed accounting limits. [Workers CPU limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

Planning counts below retain the baseline's three live API contract SELECTs (`C=3`) and include the Preview database wrapper's two additional guard/cleanup statements for **each** mutation batch. All counts are estimates, not measured routes. Each SQL statement in a D1 batch counts individually. Proposed indexed small tables/credential caps do not bound arbitrary future data or daily quotas automatically.

| Proposed request | Planning statement count | CPU assessment |
|---|---:|---|
| Login options/ticket | C + 1 live state read + 3 guarded abuse reservation = **7** | Randomness, bounded ticket HMAC/serialization, existing contract work. Complete CPU unknown. |
| Login finish | C + 1 joined credential/state/replay read + 3 abuse reservation + 9 final guarded statements = **16** | Synthetic verify pipeline around 0.49 ms mean Node process CPU; complete CPU unknown. |
| Register options | **8–10** | Fresh session/UV/grant checks, bounded existing credential list and challenge-ticket crypto. Complete CPU unknown. |
| Register finish / candidate confirmation | **14–20** | CBOR/COSE and registration verification not measured; fresh proof/activation/transaction work. Complete CPU unknown. |
| Credential revocation / recovery activation | **12–20** | Live UV/owner grant and epoch/session updates plus audit. Complete CPU unknown. |
| Existing private reads | Existing route counts + **0–1**, if proof checks join current query | Signature not repeated on each business request; live session/credential authorization is repeated. Complete CPU unknown. |
| Existing private mutations | Existing counts + **0–2** after guard integration | Preserve in-transaction checks. Prior worst exercised route 21; planning envelope 23, not a certified bound. |

The proposed nine-statement finish batch consists of seven inner statements (unique consumed nonce, guarded credential update, change-count assertion, session insertion, session evidence, compatible login audit, dedicated passkey event) plus the two existing Preview wrapper guards. Epoch/expiry/credential checks must be in guarded mutation SQL; implementations may need more statements. Recount after concrete SQL exists and test <=50 without relying on the test meter to turn an over-budget success into a denial. Audit/cleanup/idle refresh can increase these estimates.

CPU engineering target for a later complete-route local investigation: bounded parsing, no certificate-chain work on routine login, and substantial margin below 10 ms rather than a 9.9 ms target. A provisional p95 goal of <=7 ms is a **design target**, not a result. The existing three live contract checks/key imports can dominate remaining CPU. Do not add marginal microbenchmark percentiles to claim an end-to-end percentile, or weaken fresh guards to meet a number. Daily requests, D1 reads/writes, retention, startup, cold traffic and abuse exhaustion also require budgeting.

## Threat model

Trust roots: owner-controlled deployment/configuration and dedicated D1; reviewed browser application code; browser/authenticator boundary; approved operator custody/recovery. A database-read attacker must not acquire a reusable server-stored login secret from public-key records. A code/D1-write/controller compromise can replace authorization and is outside what passkeys alone can prevent.

| Threat | Required control | Residual risk / verification gap |
|---|---|---|
| Remote phishing or wrong Preview host | Exact RP/origin, signed assertion, no related-origin/AppID bypass | Same-origin compromise and deceptive recovery remain possible; browser/device tests missing. |
| Assertion replay or simultaneous finish | Short purpose/browser-bound ticket; unique nonce insertion and session issuance in one transaction | Must test true concurrent workerd/D1 finish, retries and transaction failure. |
| Enroll attacker key with stolen password/cookie | Owner-controlled initial grant; fresh UV for additions; enrollment-only capability separate from QY session | Recovery/owner compromise still defeats enrollment trust. |
| Session theft/XSS/CSRF | HttpOnly dedicated cookie, CSP, exact origin, CSRF, fresh UV for credential management, live revocation | XSS can perform same-origin actions; passkeys do not protect every post-login request. |
| Lost authenticator | Independent reserve; immediate all-session/credential invalidation and audited replacement | Lost device plus known PIN can be used until revocation; operator response time matters. |
| Sync-provider/account takeover | Prefer device-bound independently held keys; explicit policy for synced keys | `none` attestation cannot prove device independence/hardware provenance. |
| Credential/counter/epoch revocation race | Fresh joins and guarded CAS inside every sensitive mutation | Missing inline SQL guard is a bypass; requires comprehensive audit/race tests. |
| Crafted CBOR/DER/JSON or algorithm confusion | Pinned reviewed verifier, ES256 allowlist, byte/depth limits, strict key/signature parsing | Benchmark is deliberately incomplete; parser fuzz/conformance work outstanding. |
| Request flood / administrator lockout | Stateless tickets, successful-use-only replay rows, bounded rate summaries, no public-failure account lock | Free quotas/global throttle still permit denial of service; Access optional and unverified. |
| Recovery takeover / malicious maintainer | Independently verified owner process, limited grant, suspension/revocation, immutable evidence | Sole controller/root credentials remain decisive; no email/password-only bypass. |
| Stale Access JWT / forged headers | Conditional signed JWT verification and local subject/credential/session policy | Coverage, issuer trust, key rotation and revocation latency unknown. |
| Backup rollback or RP drift | Invalidate sessions/tickets/grants; versioned manifest/policy and controlled re-enrollment | Must rehearse restoration and disabled rollback; not demonstrated. |

## Local evidence and practical limits

See [Step 2C measurements](U3-B2B-STEP2C-MEASUREMENTS.json). Synthetic, ephemeral P-256 test keys were generated only in memory and never registered with a browser, account, device or service. No private keys are written to evidence. The fixture checks an **extension-free assertion subset**, imports a fresh public key, converts DER to fixed-width signature form, performs two SHA-256 hashes and ES256 verification. A second case adds random token generation and two session-token hashes. It does not implement registration/CBOR, stored replay prevention, counters, user handles, complete extension handling, D1 transactions or actual session authorization.

For each runtime/operation: 200 single-operation samples and 30 batches of 100 serial operations. Node CPU is process user+system delta, coarse on Windows; 0 does not prove sub-10-ms CPU. workerd CPU is unavailable and explicitly null. workerd wall time is host monotonic elapsed local dispatch **through response-body consumption**; batch division gives a mean per operation with amortized dispatch, not a per-request percentile or deployed CPU. All deployed measurements remain unavailable. No concurrent benchmark workload ran.

Tooling: Node v24.20.0, win32 x64; existing Miniflare 5.20261006.1-alpha/workerd 1.20261006.1; compatibility date 2026-10-07. No install/update. Miniflare uses `cf:false`, disabled telemetry and explicit outbound-fetch rejection. No external identity/provider call was made. The benchmark's local dispatches are not Cloudflare operations.

Times in ms, **p50 / p95 / maximum**. Batch rows are total times for 100 operations, not single-invocation percentiles. Each case executes zero D1 statements.

| Runtime / operation / batch | Samples | Process CPU | Host wall |
|---|---:|---|---|
| Node public-key-import batch=1 | 200 | 0.000 / 0.000 / 32.000 | 0.099 / 0.256 / 1.282 |
| Node public-key-import batch=100 | 30 | 15.000 / 16.000 / 16.000 | 11.528 / 19.701 / 21.960 |
| Node assertion-subset batch=1 | 200 | 0.000 / 0.000 / 16.000 | 0.398 / 0.992 / 7.774 |
| Node assertion-subset batch=100 | 30 | 47.000 / 78.000 / 78.000 | 41.441 / 55.015 / 169.389 |
| Node assertion-and-session-crypto batch=1 | 200 | 0.000 / 0.000 / 16.000 | 0.400 / 0.768 / 2.162 |
| Node assertion-and-session-crypto batch=100 | 30 | 47.000 / 63.000 / 78.000 | 46.087 / 56.268 / 57.666 |
| workerd public-key-import batch=1 | 200 | unavailable | 2.564 / 4.429 / 5.770 |
| workerd public-key-import batch=100 | 30 | unavailable | 4.364 / 6.617 / 7.043 |
| workerd assertion-subset batch=1 | 200 | unavailable | 2.586 / 4.540 / 9.383 |
| workerd assertion-subset batch=100 | 30 | unavailable | 30.224 / 39.667 / 39.811 |
| workerd assertion-and-session-crypto batch=1 | 200 | unavailable | 2.268 / 3.605 / 9.542 |
| workerd assertion-and-session-crypto batch=100 | 30 | unavailable | 29.611 / 37.995 / 41.677 |

Across batches, Node assertion-subset process CPU averaged **0.4897 ms per operation**. workerd assertion-subset host wall time averaged **0.3099 ms per operation**. These amortized means cannot be interpreted as Free-plan billed CPU or p95 request costs.


The 30 synthetic checks (15 Node + 15 workerd) cover valid verification, wrong challenge/origin/parent origin/type, cross-origin flag, missing UV/UP, wrong RP hash, invalid backup flags, changed signature, truncated/trailing DER, oversized input and invalid public key. These are subset checks, not WebAuthn conformance or evidence that recovery/enrollment is secure. Successful workerd verification establishes algorithm availability in the installed local runtime only.

## Required local implementation phases and migration path

1. **Owner design decisions first.** Confirm exact hostname ownership/stability, authenticator/UV/backup policy, recovery trust/custody, bootstrap approval, session policies, dependency review and permission to design migration 16. Keep current system unchanged meanwhile.
2. **Offline schema/protocol prototype.** Add a separately versioned extension manifest and proposed new tables in disposable databases; test duplicate nonce/concurrency/CAS, epoch changes, bounded cleanup, crashes and audit rollback. Preserve all fifteen old pins and strict environment isolation.
3. **Reviewed verifier integration.** Pin a chosen library/version and transitive inventory; bundle offline and verify no implicit fetch/provider dependency. Test browser WebAuthn vectors, DER/COSE/fuzz cases, RP/origin/UV/extension policies, attestation-none registration and real browser virtual authenticators. Never use the benchmark subset as the verifier.
4. **Enrollment and recovery prototype.** Build enrollment-only capabilities, two-device proof/activation, recent UV key management, revoke/lost/all-lost/restore procedures and recovery audit. Demonstrate stolen cookie/password cannot enroll or gain QY business scope. No real enrollment until separately approved.
5. **C1 session/guard integration.** Reuse ordinary cookie/token hashing; add evidence joins and embedded atomic guards everywhere; test revocation/password rotation/recovery racing with reads and all mutations. Retain PBKDF2 intact behind existing local test paths; do not expose competing fallbacks during prototype evaluation.
6. **Complete local acceptance/performance.** Run the full existing 982-check suite plus new WebAuthn/browser/recovery tests. Measure actual packaged ceremonies, common guards, invalid-input paths, cold starts, table growth and all-successful D1 counts. Demonstrate a margin under the planning CPU target using the best available local runtime instrumentation; explicitly retain any CPU-accounting uncertainty.
7. **Owner cutover review.** Only after the above, decide whether routine QY login may switch from PBKDF2 to passkeys and how legacy online routes are made unavailable without weakening the preserved verifier. Any Cloudflare resource/configuration change, migration, deployment, real enrollment or edge CPU verification needs a separate explicit scope. No such action is authorized now. Until true Free-plan accounting is verified, qualification stays UNKNOWN; if safe operation cannot be established under the allowed constraints, activation stays BLOCKED.

## Explicit owner decisions required before implementation

- Approve dedicated QY passkeys as the authentication direction; separately authorize any eventual routine-login routing change. Confirm PBKDF2 is retained unchanged and is not a public recovery bypass.
- Approve the exact stable Preview RP/origin and confirm independent ownership/project/branch/D1 attestation. Decide whether a distinct admin origin merits a separate design.
- Select device-bound versus synced credential policy, at least two independent UV-capable authenticators, resident-key policy, supported browsers/devices and physical reserve custody. Decide whether `none` attestation's lack of hardware provenance is acceptable.
- Name the owner/recovery operator(s), independent identity-verification/approval procedure, secure bootstrap transfer, recovery downtime, replacement rules and restore behavior. If these cannot be satisfied, do not implement an activation path.
- Approve the additive schema/manifest version and dedicated ticket-HMAC purpose, dependency/security review scope, audit retention and key-custody rotation process. No old migration pin may change.
- Decide whether to investigate Access further; approve account/configuration inspection and any identity integration separately. No Access availability, entitlement, MFA strength or coverage is assumed.
- Approve session lifetime/idle/fresh-UV policy and acceptable Free-plan abuse/availability limits. Accept that the proposed CPU/statement figures are estimates until complete-route and edge accounting are available.

## Verification and final scope

| Verification | Result |
|---|---|
| Existing base acceptance | 828 passed, 0 failed |
| Extended packaged Pages | 83 passed, 0 failed; 18 additional distinct checks |
| Migration/ledger checks | 111 passed, 0 failed |
| Deployment/security guards | 19 passed, 0 failed |
| Reproducible package / tamper checks | 6 passed, 0 failed |
| **Existing distinct acceptance** | **982 passed, 0 failed** |
| New synthetic assertion subset | 30 passed, 0 failed |
| New microbenchmark samples | 1,380 successful samples, including 180 batches of 100 |
| Migration file verifier | 15 pinned migrations verified, no remote operations |
| Syntax and whitespace | Both new scripts pass node --check; git diff --check passes |

The standalone `test-consultation-auth.mjs` additionally passed 24 checks before its Windows private synthetic directory setup subprocess failed. It did not complete; the subprocess cause was not resolved in this architectural investigation. This is outside the 982-check runner and is not reported as a passed suite. Its evidence is `.local-c1-package-step2c-regression/auth.log`. Existing packaged Node/workerd login, revocation, origin/CSRF and credential protections passed in the complete acceptance above.

Acceptance evidence is under `.local-c1-package-step2c-acceptance/` and `.local-c1-package-step2c-regression/`; raw benchmark evidence is under `.local-c1-package-step2c-passkey/`. The pinned migration/manifest and application/deployment paths have an empty Git diff. No dependency was installed or changed. Reproducibility checks rebuilt two identical inventories and tested tamper rejection. The unchanged Worker package SHA-256 is `0386ea6418710efe6edc75113a2195508751dcad15bde6c9eed6ff5a15de75a9`.

Reproduce the microbenchmark with an existing reviewed local Miniflare installation and a new output directory; preserve/rename the existing report measurement JSON before an intentional rerun (the runner refuses to overwrite it):

```powershell
$env:QY_MINIFLARE_PATH='C:/Users/WIN10/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/miniflare'
node --require ./scripts/consultation-local-file-stdio.cjs scripts/test-consultation-passkey-feasibility.mjs .local-c1-package-step2c-passkey-new
```



Step 2C files added:

- `consultation-pages/U3-B2B-STEP2C-FEASIBILITY.md`
- `consultation-pages/U3-B2B-STEP2C-MEASUREMENTS.json`
- `scripts/consultation-passkey-bench-fixture.mjs`
- `scripts/test-consultation-passkey-feasibility.mjs`

The five pre-existing Step 2B files remain unchanged by Step 2C. Local ignored evidence is retained under `.local-c1-package-step2c-*`. No staging, commit, push, merge, tag, deployment, Cloudflare resource operation, remote migration, Production access/change, real credential enrollment, external provider interaction or existing-server restart occurred. Only public technical documentation was read online.

Stop for owner review. The candidate is promising at the public-key primitive level, but **UNKNOWN** for complete Free-plan CPU qualification, with implementation/activation **BLOCKED** by the decisions and missing tests above.
