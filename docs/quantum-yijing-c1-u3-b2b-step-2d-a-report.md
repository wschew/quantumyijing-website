# Quantum YiJing C1 — U3-B2B Step 2D-A

Date: 2026-10-15 (Asia/Kuala_Lumpur)

**Status: client-data security hardening complete; isolated synthetic prototype ready for owner review. Production integration and Cloudflare CPU qualification remain blocked.** No deployment or integration is authorized by this report.

## Baseline and scope

Verified branch `c1-bazi-consultation-development`, HEAD `836a9cb387a952fcbce3d3d133fa4e544fc76814` before implementation. Initial uncommitted work consisted of `scripts/test-consultation-auth.mjs` and this report. Both were reviewed. The sanitized diagnostic changes were preserved; the earlier Phase 1 blocked report is superseded by this resumed result.

The owner independently verified the complete standalone authentication suite in normal Windows PowerShell: **50 passed, 0 failed, Node exit 0**. This is owner-supplied evidence outside Codex, accepted as the Phase 1 gate. It is not represented as a Codex execution result.

The prototype lives only in `scripts/`, uses a separate, ephemeral `node:sqlite` `:memory:` database, and creates mathematical test authenticators in memory. It imports no C1 runtime modules, uses no real credentials and exposes no HTTP authentication routes. PBKDF2 is unchanged. No production files, the 15 pinned migrations, manifest, frozen modules, runtime configuration or packages were modified. Existing work was not reset or discarded. No staging, commits, pushes, merges, tags, Cloudflare remote operations, deployments, package installs or owner-server control occurred.

## Exact changed-file list

1. `scripts/test-consultation-auth.mjs` — pre-existing sanitized ACL/setup subprocess diagnostics, preserved.
2. `scripts/webauthn-synthetic-validation.mjs` — portable strict WebAuthn validation profile, including typed client data and duplicate-key rejection.
3. `scripts/webauthn-synthetic-store.mjs` — isolated SQLite challenge, credential and session service.
4. `scripts/webauthn-synthetic-fixtures.mjs` — ephemeral test keys and binary registration/assertion fixtures; optional exact client bytes for correctly signed malformed-input tests.
5. `scripts/test-webauthn-synthetic.mjs` — security and race suite plus equivalent registration/authentication client-data regressions; Node and optional local workerd validator modes.
6. `scripts/measure-webauthn-synthetic.mjs` — Node finish-flow CPU/wall and separate local workerd validator wall measurements.
7. `docs/quantum-yijing-c1-step2da-measurements.json` — preserved PRE-HARDENING evidence: 400 raw timing samples, summaries, runtime versions and parity checks; no credential inputs or keys. Not a timing measurement of the hardened parser.
8. `docs/quantum-yijing-c1-u3-b2b-step-2d-a-report.md` — this report.

Ignored `.local-c1-package-step2da-acceptance/` and `.local-c1-package-step2da-acceptance-final/` directories retain earlier local evidence. Fresh hardening evidence is saved separately in `.local-c1-package-step2da-hardening-acceptance/`, including both 247-check security logs, the base runner summary/logs, extended profile, migration and guard logs, migration-pin log, and a fresh six-check `reproducibility.log` with exit status in `supplemental-summary.json`. These are evidence artifacts, not staged source files. All `.local-c1-package*/` directories must remain outside any future commit. Synthetic databases and private authenticator keys are never persisted by the new prototype.

## Client-data hardening after checkpoint review

Root cause: the previous condition rejected only literal Boolean true, accepting malformed crossOrigin strings, numbers, null, arrays and objects. Plain JSON.parse also silently selected the last duplicate key. The checkpoint finding is resolved in the shared client-data path before either registration or authentication validation proceeds.

The shared parser now requires a single JSON object with own string type, challenge and origin fields matching server expectations exactly. Missing crossOrigin is accepted because the field is optional and both Level 3 ceremony algorithms condition their cross-origin check on presence and true. Present crossOrigin must be exactly false; true and every other JSON type fail closed. See [W3C WebAuthn Level 3 sections 5.8.1, 7.1 and 7.2](https://www.w3.org/TR/webauthn-3/).

Strict local-profile policy: any tokenBinding or topOrigin member is rejected by presence, including null and malformed values. This prototype supports neither Token Binding nor cross-origin frames. This is an explicit narrower profile, not a claim that all general-purpose WebAuthn implementations must reject every such member. Unknown future nonreserved members remain permitted within bounds.

Fatal UTF-8 decoding is retained; UTF-8 BOM and UTF-16 input are explicitly rejected by the supported serialization profile. JSON grammar is checked by JSON.parse, then a bounded structural scan rejects duplicate decoded keys at every object level, including Unicode-escaped spellings, before field validation. Limits are 16 nesting levels and 256 value nodes in addition to the existing encoded input bound. The signature still covers the ORIGINAL received client bytes; parsed JSON is never reserialized for verification.

Added **174 checks per runtime mode**: 164 negative cases (82 per ceremony) and 10 positive cases (5 per ceremony). Negatives cover missing, empty, wrong and nonstring required fields; all prohibited crossOrigin types; tokenBinding/topOrigin values; matching and conflicting duplicates, escaped key aliases and nested duplicates; nonobject JSON roots; truncated/trailing JSON, trailing commas, comments and control characters; malformed UTF-8 (overlong, surrogate, truncated, continuation and invalid bytes); BOM, UTF-16 and excessive nesting. Positives cover false/absent crossOrigin, whitespace and reordered members, escaped keys/values and benign unknown nested future data. Assertion fixtures are signed over each exact test byte sequence so parser rejection is not confused with a stale-signature failure.

The original 73 tests remain intact, including UV/RP/signature, replay, counter, session, enrollment and recovery protections. The store, runtime routes, migrations, PBKDF2 and preserved standalone-auth diagnostics were not changed during this hardening.

## Validation and security policy

The implementation follows the ceremony checks described in W3C WebAuthn sections 7.1 and 7.2: https://www.w3.org/TR/webauthn-3/. It is a deliberately restricted prototype, not a general-purpose WebAuthn library or browser/device conformance claim.

Supported profile: ES256/P-256, `none` attestation with empty statement, exact synthetic HTTPS origin and RP ID, no extensions, mandatory UP and UV. Backup eligible/synced credentials and non-increasing/zero assertion counters are rejected conservatively. Registration counters may start at zero. Missing `crossOrigin` is permitted by the optional-field verification rules; a present value must be Boolean false. Every `topOrigin` or `tokenBinding` member is rejected under the strict local profile. Unsupported algorithms, attestation formats and extensions fail closed.

Registration validates the credential envelope and canonical base64url ID, bounded client JSON, ceremony type, challenge, exact origin, RP hash, flags, attested credential ID, complete bounded CBOR object and COSE key. The parser rejects duplicates, indefinite encodings, tags/floats, nonminimal integer/length encodings, truncation, trailing bytes and excessive nesting/maps. COSE must contain exactly the EC2/ES256/P-256 coordinates; WebCrypto validates the curve point. `none` attestation provides no authenticator provenance or hardware identity guarantee.

Authentication validates the envelope, client binding, user handle, stored active credential, RP hash, flag policy and strict increasing signature counter. ES256 verification covers authenticator data concatenated with the SHA-256 hash of the original client-data bytes. DER is strictly decoded using the existing synthetic DER helper; signature corruption, truncation and trailing data are rejected.

Server policy is reconstructed from stored challenge kind and server-owned RP/origin/user handle. Caller-supplied policy fields cannot override it. Challenges are random 256-bit values, stored only by SHA-256 digest, expire after 60 seconds, and bind to the current account epoch. Challenge consumption, counter compare-and-swap and session creation occur in one `BEGIN IMMEDIATE` transaction after asynchronous verification. Expiry and epoch are checked again at consumption. SQL failures roll everything back. Concurrent replay produces exactly one successful session; simultaneous assertions at the same counter produce one winner.

Initial enrollment requires a test-only bootstrap capability and two distinct credential IDs and public keys. No session can be issued before two active keys exist. Bootstrap closes after the second key and pending bootstrap challenges cannot enroll a third. Additional enrollment requires a live UV-authenticated session, rechecked at completion including logout/expiry/revocation. This proves distinct mathematical keys, not independently held physical devices.

Sessions use random 256-bit bearer tokens stored only by hash, five-minute expiry and account epoch binding. Logout revokes one session. Credential revocation increments the epoch and revokes all sessions and challenges. Fewer than two active keys blocks login and session authorization. Trusted local owner recovery can revoke state or reset enrollment with a new bootstrap capability; a reset requires two fresh keys. Recovery methods are explicit test-only trusted-object operations without any exposed endpoint. They are not a production recovery authority design.

## Security and regression results inside Codex

| Check | Result |
|---|---|
| New Node validation + Node/SQLite state | **247 passed, 0 failed**, exit 0 |
| New local workerd validation + Node/SQLite state | **247 passed, 0 failed**, exit 0 |
| Existing base acceptance | **828 passed, 0 failed**, exit 0 |
| Extended packaged Pages | **83 passed, 0 failed**, exit 0; 18 distinct additional checks |
| Migration/ledger checks | **111 passed, 0 failed**, exit 0 |
| Deployment/security guards | **19 passed, 0 failed**, exit 0 |
| Package reproducibility/tamper checks | **6 passed, 0 failed**, exit 0 |
| Existing distinct acceptance total | **982 passed, 0 failed** (828 + 18 + 111 + 19 + 6) |
| Migration file verifier | `ok:true`, **15** pinned migrations, zero remote operations |
| Standalone authentication in Codex (prior run, not rerun for this hardening) | **Incomplete: 24 PASS lines, then EPERM**, Node exit 1 |
| Complete standalone authentication outside Codex | **Owner-verified 50/50, exit 0**; not rerun successfully inside Codex |
| Syntax / whitespace / protected-source diff | Passed at final review |

The 247 cases in each prototype mode include the 174 new client-data checks described above plus the original 73 cases covering registration and authentication origin/challenge/type/RP binding, UV/UP, unsupported flags/backup policy, COSE algorithm/curve/point validation, attestation policy, ID and envelope mismatches, user handle, extensions, bounds/encoding/JSON/DER failures, duplicate key enrollment, replay, expiration, simultaneous replay and counter races, hashed session storage, logout, lost-device revocation, trusted recovery, bootstrap closure and pending enrollment race, completion-time session authorization, atomic rollback after session insertion failure, and expiry during asynchronous verification.

The workerd mode runs cryptographic and ceremony validation in actual local workerd; SQLite challenge/session transactions remain in Node. Four direct CBOR-parser tests execute in Node in both modes. This is not a workerd/D1 implementation of the prototype state machine. Existing packaged C1 workerd/D1 regressions remain separate and unchanged.

The current hardening rerun completed all 982 existing distinct checks, including a newly saved six-check reproducibility log; no historical log is needed to support that total. All requested suites completed with zero failures. The eight-file inventory above is unchanged. Only validation, fixtures, tests and this report were edited during hardening; existing ignored evidence was preserved.

For historical context, the initial pre-hardening base acceptance attempt completed 763 checks across 13 suites, then two TLS-dependent suites could not finish with the default MSYS OpenSSL. The complete rerun used the existing documented `QY_TEST_OPENSSL` native executable setting and passed 828/828. The hardening run also uses this existing setting. No TLS or ACL policy was weakened.

## Preserved Windows diagnostic evidence

The standalone authentication test still cannot spawn its credential-bearing setup subprocess with piped transport in Codex. The actual sanitized failure after 24 passing checks is:

```json
{"status":null,"signal":null,"error":{"code":"EPERM","errno":-4048},"stderr":"[empty]"}
```

The preserved ACL subprocess transport uses ignored stdin and an exclusive regular diagnostic file for nonsecret ACL setup only, with hidden window, timeout and cleanup. It redacts synthetic directory, temporary root, user profile and SIDs and bounds output to 6,000 characters. Setup failures print only transport metadata, never credential stdin or raw child output. Earlier diagnostics isolated anonymous-pipe spawn restrictions and inability of this restricted Node session to write within the exact required private ACL. No Windows ACL grants, inheritance, credential protection or account setup logic were changed. The owner's independent successful suite resolves the gate without pretending the sandbox run passed.

## Performance measurements - preserved pre-hardening evidence

Node v24.20.0; existing Miniflare 5.20261006.1-alpha / workerd 1.20261006.1; compatibility date 2026-10-07. Each group has 100 serial samples. Percentiles use nearest rank, with no warmup samples discarded. Synthetic response signing, challenge creation and fixture setup are outside timed finish calls. Raw evidence and the precise method are in `quantum-yijing-c1-step2da-measurements.json`.

| Workload | Node process CPU ms p50 / p95 / max | Host wall ms p50 / p95 / max |
|---|---|---|
| Node registration finish + SQLite | 0 / 0 / 31 | 0.5506 / 1.0560 / 2.9458 |
| Node authentication finish + SQLite + session | 0 / 0 / 31 | 0.8246 / 1.6621 / 2.7480 |
| Local workerd registration validation only | Unavailable | 3.0305 / 5.2475 / 9.3536 |
| Local workerd assertion validation only | Unavailable | 2.9714 / 3.9844 / 6.2611 |

Node CPU is process-wide user+system CPU, quantized on Windows. Zeros do not establish zero CPU or a bound below 10 ms. Node values include challenge hashing, validation, transaction and database work, with session hashing/insertion on assertion completion. Workerd values are host wall time including local dispatch, serialization and response-body consumption; they exclude prototype D1, replay and sessions. They cannot be compared as equivalent whole-route timings. No workerd CPU, deployed Cloudflare CPU, billing compatibility, Free-plan compliance or whole-route workerd performance claim is made.

The preserved measurements PRECEDE this client-data hardening and therefore do not measure the extra typed-field validation or duplicate-key scan. They must not be presented as current hardened-parser performance. No timing rerun was requested for this hardening; the earlier evidence is preserved without overwrite. Current hardened-flow CPU/wall time, prototype D1 billing and deployed Cloudflare CPU qualification remain unmeasured. There are no real device, browser, network or deployed measurements.

## Reproduction

Use the existing reviewed local tools; no install, Wrangler or remote command is required:

```powershell
$env:QY_MINIFLARE_PATH='C:/Users/WIN10/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/miniflare'
$env:QY_ESBUILD_PATH='C:/Users/WIN10/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/esbuild'
$env:QY_TEST_OPENSSL='C:/Program Files/Git/mingw64/bin/openssl.exe'
node scripts/test-webauthn-synthetic.mjs
node --require ./scripts/consultation-local-file-stdio.cjs scripts/test-webauthn-synthetic.mjs --workerd
node scripts/run-consultation-step2a-acceptance.mjs .local-c1-package-step2da-review-new
node --require ./scripts/consultation-local-file-stdio.cjs scripts/test-consultation-preview-migrations.mjs
node scripts/test-consultation-deployment-guards.mjs
node --require ./scripts/consultation-local-file-stdio.cjs scripts/test-consultation-package-reproducibility.mjs
$env:QY_C1_FREE_PROFILE='.local-c1-package-step2da-review-new/extended-profile.json'
node --require ./scripts/consultation-local-file-stdio.cjs scripts/test-consultation-pages.mjs
```

`node --require ./scripts/consultation-local-file-stdio.cjs scripts/measure-webauthn-synthetic.mjs` generates the measurement file with exclusive `wx` creation. Preserve the existing evidence before any intentional rerun; it refuses to overwrite. The existing standalone authentication command is `node scripts/test-consultation-auth.mjs`; expect the documented environment limitation in Codex, not a fabricated pass.

## Remaining blockers and owner review

1. No browser or real authenticator interoperability testing was requested/performed; independently held devices cannot be established by synthetic keys or `none` attestation. RP ID/origin and registration policy are synthetic placeholders.
2. Production enrollment/recovery authority, physical custody, reset controls, audit, rate limiting, challenge/session cleanup and HTTP transport protections (cookies, CSRF and request controls) require a separately reviewed design. The trusted-object API must not be exposed as a route.
3. The conservative rejection of backup eligible keys and zero/non-increasing counters excludes many synced passkeys. Any relaxation needs an explicit policy and new tests. No unsupported format silently falls back.
4. Prototype state is ephemeral local SQLite, not persistent D1. Multi-process/D1 concurrency, query/row billing, full workerd registration/login/session flow and deployed CPU qualification remain unimplemented/unmeasured. Local workerd validation wall time cannot resolve these blockers.
5. Complete standalone authentication remains unavailable inside the restricted Codex Windows context. Owner verification is explicitly recorded separately; ACL weakening is neither required nor authorized.

Stop here for owner review. C1 runtime integration, replacing PBKDF2, remote actions and deployment remain outside this Step 2D-A prototype.
