# Quantum YiJing C1 - Step 2D-B1-H Security Hardening

Date: 2026-10-15 (Asia/Kuala_Lumpur)

**Status: local security hardening validated; 65 persistent-D1 checks passed. Stop for owner review. Cloudflare Free qualification and production integration remain blocked.** This supersedes the Step 2D-B1 report; the original report and measurements are preserved in .local-c1-package-step2db1h-regression/pre-hardening-report.md and pre-hardening-measurements.json.

## Baseline and exact scope

Verified branch c1-bazi-consultation-development and exact HEAD c19d321120c0817be94abe5b631933fba9944a3c before changes. The initial status contained exactly the five expected untracked Step 2D-B1 files. All existing tracked files and the Git index were unchanged. No existing C1 runtime routes, PBKDF2, frozen Academy, payment/accounting, affiliate, WhatsApp, subscription modules, migration manifest or any of the 15 pinned migrations were edited.

The overall five-file addition inventory remains:

1. scripts/webauthn-d1-worker.mjs - bounded streaming JSON intake, failure instrumentation and inert test-instrumentation markers.
2. scripts/webauthn-d1-schema.sql - standalone schema, unchanged by this hardening.
3. scripts/test-webauthn-d1.mjs - deterministic barriers, state-change/fault/rollback tests, reader probes and expanded profiler.
4. docs/quantum-yijing-c1-step2db1-measurements.json - updated final raw evidence and summaries.
5. docs/quantum-yijing-c1-u3-b2b-step-2d-b1-report.md - this updated report.

No Git staging, commits, pushes, merges or tags occurred. No installs, Wrangler, remote Cloudflare operations, deployment, real credentials or external providers were used. The existing server on port 8789 was not restarted or controlled. Workerd outbound fetch is rejected; CF discovery and telemetry remain disabled. Test-control service calls resolve to a local harness callback, not an external server.

## Worker, D1 and schema isolation

Node v24.20.0 drives Miniflare 5.20261006.1-alpha and genuine workerd 1.20261006.1, compatibility date 2026-10-07. The only prototype binding is SYNTHETIC_PASSKEY_DB, local ID 22222222-3333-4444-8555-666666666666. Every invocation creates its own disposable on-disk persistence root. The final root is .local-c1-package-step2db1-7GJwPf/; it contains D1 files and results.json. State is explicitly tested across runtime disposal/reopening. No existing C1 database binding or active route is imported.

Schema remains five isolated tables: account (singleton epoch, user handle, bootstrap hash, closure); credential (unique ID/public key, counter, revocation); challenge (hash, kind, expiry, epoch, consumption, enrollment authority); session (hash, expiry, epoch, revocation); atomic_guard (CHECK ok=1). Primary/unique indexes protect identity/key uniqueness and point lookups. The two-active-key check stops after two matches. These are not production migrations.

The shared committed validator is unchanged: mandatory UP/UV, exact synthetic RP ID/origin/challenge/type, ES256/P-256, original signed client bytes, strict JSON/UTF-8/CBOR/DER, unsupported-context rejection, conservative backup/counter policy. Challenge/session/bootstrap capabilities are random and persisted only by SHA-256 hash. Sessions last five minutes; challenges last 60 seconds. None attestation and mathematical keys do not prove device custody or real authenticator interoperability.

## Deterministic write-boundary control

The Worker contains two inert comments, one before query submission and one immediately before atomic batch submission. It contains no barrier implementation, test-control binding lookup, public flag or test-control route. Only the Node harness rewrites those exact markers in its in-memory module source and attaches a local service binding. The harness also attaches the binding to the service object in that generated source. Public JSON, headers and URLs cannot arm or release it; only the private Node closure can. A test verifies public input has no effect and test-control/reset paths return 404.

For each deterministic authentication race, four independent dispatchFetch requests complete the same committed synthetic validator and asynchronous token hashing, then pause immediately before the D1 batch. The harness waits for all four arrivals and confirms no authentication state has changed before releasing them. A 15-second timeout fails with BLOCKED rather than recording a successful race if arrivals cannot be established. No guard or validation is weakened.

Both identical assertion replay and distinct challenges with one credential counter passed **25 rounds of four verified contenders**. Each scenario has 100 saved request samples: 25 successes and 75 failed batches. Every contender submitted seven application SQL plans, so the losers demonstrably reached the write batch rather than failing preflight. Each round checks exactly one new session, the correct final counter, an empty guard table and consistent challenge consumption. Identical requests consume their shared challenge once; the distinct-challenge case consumes only the winner's challenge and rolls back the losers' consumption.

D1's first guard statement raises a CHECK error on stale challenge, epoch, credential counter or authority. Challenge consumption, credential update, session insertion and guard deletion share the same batch transaction. The authentication conditions themselves were not relaxed or replaced. The result supports the local D1 guarantee under these schedules; it does not establish deployed distributed behavior.

## Transaction, expiry and failure tests

The updated suite has **65 named passing checks, zero failures**, retaining the previous 48 and adding 17 named checks (several contain 25 or 100 iterations).

- At the post-verification/pre-write barrier, expire a challenge, revoke the credential or increment the administrator epoch. Each request submits its batch, fails, and leaves every table exactly as it stood after the authorized external mutation. No challenge consumption, counter advance or session creation leaks through.
- Expire an enrollment-authorizing session after registration verification. The completion fails with no partial enrollment state.
- Inject a real D1 session-insert SQL error with a trigger after challenge/counter mutations. Verify unchanged challenge/counter/session counts; remove the trigger and retry the same response successfully. Repeat 100 times for performance evidence, in addition to the original rollback check.
- Inject a real D1 owner-reset failure at session update, after account and credential changes. Compare complete snapshots of all five tables. All 100 failed reset transactions roll back exactly. Remove the trigger; the normal reset/re-enrollment tests and 100 subsequent reset operations succeed.
- Simulate quota-like query and batch failures through the harness, before database submission. Failed requests report incomplete metadata and preserve all tables. Explicit retries of the same assertion succeed once; subsequent replay fails. These simulate transport/quota-style failures, not Cloudflare quota enforcement.
- Produce an actual standalone D1 query error by temporarily renaming the challenge table. Its request reports one submitted statement and metadataComplete=false; the table is restored in finally.
- Preserve tests for bootstrap closure, two distinct keys, unauthorized enrollment, challenge/session expiry, logout, revoke-all, pending authority, recovery reset and old-credential rejection.

Mutations at the barrier test the stale-verification window after cryptographic verification and before commit. They do not pretend to interrupt the cryptographic primitive itself. Fault triggers and table renaming affect only the disposable local database and are removed/restored. The application performs no automatic retry. Explicit retries are distinct measured requests, and the source retains no fallback that bypasses validation.

Owner recovery remains strictly offline in the harness using a direct database handle. No owner reset or recovery function is added to the HTTP dispatcher. The reset transaction advances epoch, rotates bootstrap hash, reopens enrollment and revokes credentials/sessions/challenges. It still requires two fresh replacement credentials. Real owner identity proof, authorization, audit, capability handoff/expiry and physical custody remain a separate unimplemented operational design.

## HTTP intake and abuse review

The explicit request-body maximum is **20,000 UTF-8 bytes**, not JavaScript character count. A declared invalid or excessive Content-Length is rejected and its body cancelled before reading. Without a trustworthy length, the reader consumes chunks only until the next chunk would exceed the bound, cancels, and never appends that over-limit chunk. It buffers at most the permitted aggregate payload before fatal UTF-8 decoding and JSON parsing. A transport-provided individual chunk is already allocated by the runtime; this is not a claim to cap all transport buffers. Content type remains exactly application/json and methods remain POST.

Actual workerd reader probes establish: chunked and falsely small declared bodies stop after the second chunk, cancel and never pull the third chunk; an excessive declared length causes zero pulls; an exact 20,000-byte valid JSON body is accepted; oversized multibyte UTF-8 is rejected by bytes. HTTP tests verify oversized, malformed JSON and invalid UTF-8 inputs invoke zero D1 statements, while an exact-limit valid JSON request reaches ordinary session validation.

No public-facing rate limiter is shipped by this prototype. Before any exposure, require bounded request rates/concurrency and outstanding-challenge capacity, short timeouts, admission checks before challenge writes, per-source and per-account controls that resist lockout abuse, and generic errors/audit. In-memory per-isolate counters cannot supply a distributed guarantee. Unauthenticated login challenge creation can otherwise grow storage. This review does not claim abuse protection is implemented merely because the payload is bounded.

Retention/cleanup remains deliberately offline and unimplemented. Specify a retention window and bounded maintenance batches, index expiry columns after measuring write costs, and prune expired sessions/challenges in small resumable batches. Never delete a live challenge to permit replay, reset counters during cleanup or weaken epoch checks. Measure both normal and abusive arrival rates, including cleanup writes within Free budgets.

The growth profile confirms that current revoke-all bulk updates scale with all retained session/challenge rows. Its measured writes rise from the retained-history workload to a maximum of 1,845 per invocation. A reviewed follow-up can evaluate epoch-only invalidation (already checked by every use) plus bounded asynchronous/offline cleanup, instead of bulk-marking all historical rows. That optimization is not silently introduced here. Owner reset likewise scales with retained credentials/sessions/challenges. These are integration blockers, even though the local correctness tests pass.

## Measurement integrity and attribution

Final evidence contains **1931 raw samples across 29 groups**. Percentiles use nearest rank, without discarding warmup. All table cells below are **p50 / p95 / maximum**. Submitted counts refer to application SQL plans, not actual executed SQL instructions.

- statements increments immediately before standalone D1 submission or batch submission, after any test boundary. Each batch member is counted. For standalone queries the counter advances before prepare/bind/all; a preparation or binding error can therefore count as a logical submission attempt without reaching the backend. This is not an observed backend execution count. For failures injected before submission, it is zero for the first query failure and two successful preflight statements for the injected atomic failure. Failed real batches count all submitted plans even if execution aborted early.
- No exact execution count, implicit BEGIN/COMMIT/ROLLBACK, internal D1 queries, hidden transport retries or internal storage operations is observable. These are excluded rather than guessed. Setup, inspection, test mutations and fault-trigger installation/removal are outside request timing and counts. Trigger instructions are not separately counted application statements.
- rowsRead, rowsWritten and d1DurationMs are sums of actual returned local D1 metadata. Both standalone query and batch errors set metadataComplete=false. Missing failed-operation metadata remains unavailable; zero retained failed-batch writes is not proof that no rolled-back work occurred. Earlier successful preflight metadata remains included. There are 375 incomplete samples. Metadata-complete rejection by the validator does not imply authentication succeeded.
- All serial profiling loops run after reopening the same database with pristine Worker source and no test binding. Barrier, boundary, injected-fault and original instrumented security-flow groups include local test-control/wait overhead; their wall times are not natural production latency. The legacy registration finish group contains one instrumented bootstrap sample plus 100 pristine samples; login finish contains one instrumented security sample plus 200 pristine samples. Combined begin+finish groups each contain exactly 100 pristine pairs.
- Combined registration/login wall times sum the two HTTP dispatch/body-consumption durations; synthetic signing/key generation and user interaction are excluded. JSON groups time full finish requests, not isolated parser CPU. Registration measures authorized additional enrollment, not 100 complete initial two-key bootstraps. Local history grows throughout the run.
- Offline reset uses the direct local D1 driver handle, four plans per transaction, not an HTTP recovery route. Its capability hashing/plan preparation and snapshot assertions are outside timing. Its timing is not directly equivalent to HTTP request timing. At successful-reset profiling, retained history comprised 105 credentials, 767 sessions and 1082 challenges. Repeated resets update this same history, not 100 independently recovered live accounts. Reset profiling uses fixed dummy synthetic capabilities; the recovery correctness test uses a fresh random replacement capability. These dummy profiling values are not a credential handoff design.
- hostDriverCpuMs is Node process user+system CPU, quantized on Windows; it excludes the workerd subprocess. Concurrent samples overlap and must not be summed. Workerd per-request and deployed Cloudflare CPU are unavailable. D1 duration is local database elapsed time, not CPU. Neither a zero driver CPU sample nor wall time below/above 10 ms establishes Free CPU compliance.

| Operation | N | Host wall ms | Submitted plans | Returned reads | Returned writes | Local D1 duration ms | Node driver CPU ms |
|---|---:|---|---|---|---|---|---|
| registration finish | 101 | 10.0408 / 13.6662 / 34.6186 | 7 / 7 / 7 | 12 / 12 / 12 | 7 / 7 / 7 | 0 / 2 / 3 | 0 / 16 / 47 |
| login finish | 201 | 9.3315 / 12.1553 / 32.3931 | 7 / 7 / 7 | 11 / 11 / 11 | 6 / 6 / 6 | 1 / 2 / 3 | 0 / 16 / 31 |
| concurrent replay | 12 | 164.7105 / 178.1057 / 178.1057 | 7 / 7 / 7 | 3 / 11 / 11 | 0 / 6 / 6 | 0 / 1 / 1 | 47 / 47 / 47 |
| concurrent counter | 8 | 75.4229 / 89.2152 / 89.2152 | 7 / 7 / 7 | 3 / 11 / 11 | 0 / 6 / 6 | 0 / 1 / 1 | 47 / 47 / 47 |
| barrier replay | 100 | 78.0812 / 98.8876 / 115.6996 | 7 / 7 / 7 | 3 / 11 / 11 | 0 / 6 / 6 | 0 / 1 / 3 | 31 / 94 / 141 |
| barrier counter | 100 | 75.2174 / 90.3443 / 100.2057 | 7 / 7 / 7 | 3 / 11 / 11 | 0 / 6 / 6 | 0 / 1 / 2 | 31 / 79 / 124 |
| boundary expiry | 1 | 83.8878 / 83.8878 / 83.8878 | 7 / 7 / 7 | 3 / 3 / 3 | 0 / 0 / 0 | 1 / 1 / 1 | 0 / 0 / 0 |
| boundary credential revocation | 1 | 85.9122 / 85.9122 / 85.9122 | 7 / 7 / 7 | 3 / 3 / 3 | 0 / 0 / 0 | 0 / 0 / 0 | 63 / 63 / 63 |
| boundary epoch | 1 | 75.1633 / 75.1633 / 75.1633 | 7 / 7 / 7 | 3 / 3 / 3 | 0 / 0 / 0 | 0 / 0 / 0 | 46 / 46 / 46 |
| injected query failure | 1 | 4.56 / 4.56 / 4.56 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| explicit retry after query failure | 1 | 22.9185 / 22.9185 / 22.9185 | 7 / 7 / 7 | 11 / 11 / 11 | 6 / 6 / 6 | 0 / 0 / 0 | 0 / 0 / 0 |
| injected atomic failure | 1 | 19.2348 / 19.2348 / 19.2348 | 2 / 2 / 2 | 3 / 3 / 3 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| explicit retry after atomic failure | 1 | 30.4937 / 30.4937 / 30.4937 | 7 / 7 / 7 | 11 / 11 / 11 | 6 / 6 / 6 | 0 / 0 / 0 | 0 / 0 / 0 |
| real query error | 1 | 7.4746 / 7.4746 / 7.4746 | 1 / 1 / 1 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| boundary enrollment session expiry | 1 | 135.3585 / 135.3585 / 135.3585 | 7 / 7 / 7 | 2 / 2 / 2 | 0 / 0 / 0 | 0 / 0 / 0 | 32 / 32 / 32 |
| registration begin | 100 | 7.455 / 9.8305 / 22.5728 | 4 / 4 / 4 | 6 / 6 / 6 | 4 / 4 / 4 | 0 / 1 / 2 | 0 / 16 / 31 |
| registration begin + finish | 100 | 17.5896 / 21.8671 / 57.1914 | 11 / 11 / 11 | 18 / 18 / 18 | 11 / 11 / 11 | 1 / 2 / 4 | 0 / 16 / 47 |
| login begin | 100 | 5.6215 / 8.645 / 15.1117 | 4 / 4 / 4 | 4 / 4 / 4 | 4 / 4 / 4 | 0 / 1 / 1 | 0 / 16 / 16 |
| login begin + finish | 100 | 13.3904 / 19.0808 / 26.7775 | 11 / 11 / 11 | 15 / 15 / 15 | 10 / 10 / 10 | 1 / 2 / 3 | 0 / 16 / 31 |
| JSON valid | 100 | 7.424 / 10.3066 / 12.62 | 7 / 7 / 7 | 11 / 11 / 11 | 6 / 6 / 6 | 0 / 1 / 3 | 0 / 16 / 47 |
| JSON duplicate | 100 | 5.3173 / 7.3293 / 11.9283 | 2 / 2 / 2 | 3 / 3 / 3 | 0 / 0 / 0 | 0 / 1 / 1 | 0 / 16 / 47 |
| JSON bounded nested | 100 | 7.9399 / 10.2345 / 12.7085 | 7 / 7 / 7 | 11 / 11 / 11 | 6 / 6 / 6 | 0 / 2 / 3 | 0 / 16 / 31 |
| invalid signature | 100 | 5.6786 / 8.2285 / 17.4667 | 2 / 2 / 2 | 3 / 3 / 3 | 0 / 0 / 0 | 0 / 1 / 1 | 0 / 16 / 32 |
| session insert rollback | 100 | 10.7471 / 14.4461 / 29.1599 | 7 / 7 / 7 | 3 / 3 / 3 | 0 / 0 / 0 | 0 / 1 / 2 | 0 / 15 / 31 |
| retry after session rollback | 100 | 8.1151 / 12.1478 / 18.1562 | 7 / 7 / 7 | 11 / 11 / 11 | 6 / 6 / 6 | 1 / 2 / 3 | 0 / 16 / 16 |
| logout | 100 | 3.8091 / 5.016 / 15.2778 | 3 / 3 / 3 | 5 / 5 / 5 | 3 / 3 / 3 | 0 / 1 / 1 | 0 / 16 / 32 |
| revoke-all | 100 | 4.2399 / 5.4635 / 7.3875 | 5 / 5 / 5 | 1697 / 1832 / 1847 | 1695 / 1830 / 1845 | 0 / 1 / 2 | 0 / 16 / 16 |
| offline reset rollback | 100 | 7.6244 / 10.1914 / 13.6403 | 4 / 4 / 4 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 16 / 32 |
| offline reset success | 100 | 3.867 / 5.6987 / 9.3217 | 4 / 4 / 4 | 1955 / 1955 / 1955 | 1955 / 1955 / 1955 | 1 / 1 / 1 | 0 / 0 / 16 |

Single-sample groups report identical p50/p95/max by definition; they provide deterministic failure evidence, not a statistical latency distribution. Barrier groups combine successes/rejections. Every failed batch's returned row figures must be interpreted with metadataComplete=false. Real quota limits, overloaded deployed D1, ambiguous commit/lost-response behavior and internal retry counts remain unmeasured. After a possibly committed request loses its response, replay must fail closed; no token-recovery/idempotency protocol is claimed here.

## Cloudflare Free assessment

**Cloudflare Free remains mandatory and is not certified by this pass.** No paid-only service was added. The previously verified documentation references remain [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/). The ordinary begin/finish paths submit 4/7 plans per invocation; this supports the application-query budget comparison, not internal-operation accounting.

Local metadata is not deployed billing evidence. The revoke-all and reset growth measurements show why low SQL plan counts alone do not establish affordability: five submitted revoke-all plans can update thousands of rows. The prior 10-writes-per-complete-login planning arithmetic excludes cleanup, revocation, enrollment, abuse and shared account usage. Genuine deployed Worker CPU, resource-limit outcomes and D1 accounting remain necessary before a Free compatibility claim. This task authorizes no deployment, paid upgrade or remote validation.

## Regression and evidence

| Check | Result |
|---|---|
| Updated persistent workerd/D1 suite | 65 passed, 0 failed |
| Existing Node WebAuthn | 247 passed, 0 failed |
| Existing workerd-validation (Node/SQLite state) | 247 passed, 0 failed |
| Base C1 acceptance | 828 passed, 0 failed |
| Extended packaged Pages | 83 passed, 0 failed; 18 distinct additional checks |
| Migration/ledger | 111 passed, 0 failed |
| Security/deployment guards | 19 passed, 0 failed |
| Reproducible package/tamper checks | 6 passed, 0 failed |
| Distinct C1 acceptance | 982 = 828 + 18 + 111 + 19 + 6 |
| Migration pin verification | 15 verified, zero remote operations |
| Syntax, whitespace, tracked-source diff | Passed at final review |
| Standalone authentication inside Codex | 24 PASS lines then known EPERM, exit 1; not a pass |
| Owner's independent normal-PowerShell authentication | Previously verified 50/50; preserved as separate owner evidence |

The standalone diagnostic remains status:null, signal:null, error.code:EPERM, errno:-4048 and empty stderr. No ACL, TLS, authentication or sandbox control was weakened. This blocker is not merged into passing test totals.

Final logs, supplemental suite exit codes, preserved baseline evidence and hardening measurements are in .local-c1-package-step2db1h-regression/. Base acceptance is .local-c1-package-step2db1h-acceptance/. The final per-run persistence root above contains identical results.json evidence. A first successful hardening run and an earlier corrected startup failure are preserved separately; only the final measurements populate the report table. No regression suites ran concurrently with the final profiling run.

## Reproduction and remaining owner decisions

Reuse the installed local QY_MINIFLARE_PATH, QY_ESBUILD_PATH and QY_TEST_OPENSSL settings documented in the preserved report. Run the updated test with the existing regular-file stdio adapter and a NEW output filename in an ignored evidence directory:

    node --require ./scripts/consultation-local-file-stdio.cjs scripts/test-webauthn-d1.mjs .local-c1-package-step2db1h-regression/recheck.json

It creates a fresh persistence directory and refuses to overwrite an existing measurement filename. The unchanged acceptance runner and supplemental suites use the same commands as Step 2D-B1, with fresh evidence directories. Do not add ignored evidence or synthetic databases to a future commit.

Before Step 2D-B2 integration, owner review must resolve public HTTP/session transport and CSRF policy, rate limiting and challenge capacity, bounded retention, scalable revoke-all/reset behavior, offline owner authorization/audit and actual browser/device compatibility. Add independent-runtime and ambiguous-commit fault scenarios before claiming broader concurrency guarantees. Any deployed Free qualification requires a separately authorized synthetic-only validation scope. No further action is taken here.

Stop for owner review. No production integration, remote operation or Git mutation is authorized by this local pass.
