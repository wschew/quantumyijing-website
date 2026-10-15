# U3-B2B Step 2B — local CPU feasibility investigation

Date: 2026-10-15. **Free-plan qualification: BLOCKED.** Production remains frozen. Stop after local verification for owner review. This report authorizes no remote operation.

## Baseline

- Required and observed branch: `c1-bazi-consultation-development`.
- Required and observed HEAD: `3655583f3dfb806dc46cfda8ed575a100da7b8fd`.
- Initial `git status --short`: empty; working tree clean, before evidence or code changes.
- Previous acceptance: 982 passed, 0 failed. The existing runner covers 828 distinct checks; the extended Pages checks add 18, migration checks 111, deployment guards 19 and reproducibility checks 6, totaling 982.
- No AGENTS.md was found in the workspace file inventory. No frozen Academy source, migrations, manifest, runtime application code, package dependencies or deployment configuration was changed.

## Measurement method and limits

The new local-only runner executes 20 serial fresh-fixture packaged Worker workflows. Each run exercises both the actual bundled Worker in Node/SQLite and actual local workerd/D1, including administrator login, canonical account OTP, independent report-contact proof, booking submission, offer acceptance, static assets and fail-closed cases. Successful requests and denials/errors have separate groups. Raw request samples are retained in the ignored `.local-c1-package-step2b-cpu/routes-*.json` files; reviewable evidence contains aggregate route results and raw isolated phase samples in [the measurements](U3-B2B-STEP2B-MEASUREMENTS.json).

Node CPU is the process-wide `process.cpuUsage()` user+system delta, including crypto pool work, SQLite, allocation, GC and test instrumentation. It is not isolate CPU or Cloudflare billed CPU. Windows counters are quantized around 15–16 ms; a zero individual sample establishes no upper bound below 10 ms. Short primitives also have batches of 100 operations; batch percentiles describe total batch times, not individual-request percentiles. The 2,343-byte AES fixture uses actual C1 intake encryption/decryption; HMAC uses the actual C1 contact-fingerprint function and independent lookup key. PBKDF2 uses the actual C1 passwordHash plus equalHash verification at exactly 600,000 iterations, with a fresh synthetic credential generated outside the timed section.

Wall time uses the host's monotonic high-resolution clock to response headers, excluding subsequent body consumption. workerd wall time includes local dispatch/emulator/IPC/D1 waits and is not CPU. Local workerd request CPU is unavailable from this harness: it is deliberately null, never inferred by subtracting estimated I/O or substituting the Node parent process CPU. Isolated environment/schema/crypto phase CPU and wall measurements are Node-only; workerd phase-only measurements are unavailable. Deployed CPU and wall times are unavailable because deployment, remote invocation and account access are prohibited. No Free-plan CPU enforcement was demonstrated locally.

Percentiles use nearest rank. Primitive samples include first calls; route samples include each fresh workload's first calls and later repeated requests. There is no separate cold-isolate qualification or production-sized data/load test. Measurements are observations on one Windows host with normal background activity, not guaranteed CPU ceilings or edge latency predictions.

Tooling: Node v24.20.0, win32 x64; existing Miniflare 5.20261006.1-alpha, workerd 1.20261006.1, esbuild 0.28.2; compatibility date 2026-10-07. No installation or update. Local Miniflare uses `cf:false`, telemetry disabled, ephemeral D1 and outbound fetch disabled. Existing local servers were not restarted or controlled.

## CPU attribution tables

All times are milliseconds, shown as **p50 / p95 / maximum**. CPU values of 0 reflect counter resolution. These are inclusive phases, not additive components of a single request.

| Node-only isolated phase | Samples | Process CPU ms | Wall ms |
|---|---:|---|---|
| PBKDF2-SHA256 verification 600000 (batch=1) | 30 | 141.000 / 172.000 / 172.000 | 142.148 / 163.246 / 166.512 |
| environment configuration validation (batch=1) | 30 | 0.000 / 0.000 / 0.000 | 0.003 / 0.048 / 0.165 |
| environment configuration validation batch (batch=100) | 30 | 0.000 / 0.000 / 0.000 | 0.187 / 0.627 / 0.932 |
| live environment/schema contract including key import (batch=1) | 30 | 0.000 / 31.000 / 31.000 | 2.073 / 4.119 / 4.294 |
| six-purpose key validation/import (batch=1) | 30 | 0.000 / 0.000 / 0.000 | 0.244 / 0.382 / 0.658 |
| AES-256-GCM intake encryption (batch=1) | 100 | 0.000 / 0.000 / 16.000 | 0.075 / 0.174 / 0.460 |
| AES-256-GCM intake decryption (batch=1) | 100 | 0.000 / 0.000 / 16.000 | 0.069 / 0.152 / 1.270 |
| HMAC-SHA256 contact fingerprint (batch=1) | 100 | 0.000 / 0.000 / 0.000 | 0.042 / 0.071 / 1.361 |
| AES-256-GCM intake encryption batch (batch=100) | 30 | 0.000 / 31.000 / 31.000 | 6.617 / 9.938 / 15.007 |
| AES-256-GCM intake decryption batch (batch=100) | 30 | 0.000 / 31.000 / 31.000 | 5.494 / 8.843 / 9.804 |
| HMAC-SHA256 contact fingerprint batch (batch=100) | 30 | 0.000 / 32.000 / 32.000 | 3.613 / 5.109 / 5.388 |

Batches are 100 operations each; do not compare their total times with a per-invocation 10 ms budget. The phase fixture asserts one executed D1 statement for each complete live contract validation. Environment configuration alone uses zero statements. Other isolated crypto/key phases use zero statements.

### Node/SQLite: successful packaged requests

| Route | Samples | Node process CPU ms | Host wall ms | Maximum D1 statements |
|---|---:|---|---|---:|
| GET /customer | 420 | 0.000 / 16.000 / 32.000 | 3.427 / 4.875 / 7.488 | 1 |
| GET /qy | 440 | 0.000 / 16.000 / 32.000 | 3.361 / 4.630 / 6.030 | 1 |
| POST /api/consultation/qy/login | 260 | 156.000 / 172.000 / 234.000 | 153.509 / 178.680 / 237.042 | 12 |
| POST /api/consultation/account/challenge | 20 | 16.000 / 31.000 / 32.000 | 11.556 / 15.592 / 17.158 | 14 |
| POST /api/consultation/account/confirm | 20 | 15.000 / 31.000 / 31.000 | 11.947 / 17.308 / 17.413 | 17 |
| POST /api/consultation/contact/challenge | 20 | 15.000 / 16.000 / 31.000 | 10.330 / 13.353 / 14.083 | 17 |
| POST /api/consultation/contact/confirm | 20 | 0.000 / 31.000 / 32.000 | 8.872 / 11.874 / 12.647 | 14 |
| POST /api/consultation/bookings | 20 | 16.000 / 16.000 / 16.000 | 12.250 / 15.124 / 19.060 | 21 |
| POST /api/consultation/offer/accept | 20 | 15.000 / 31.000 / 31.000 | 9.251 / 16.831 / 31.118 | 16 |
| GET /workflow-ui.js | 400 | 0.000 / 16.000 / 47.000 | 2.401 / 3.783 / 5.602 | 1 |
| GET /workflow.css | 400 | 0.000 / 16.000 / 47.000 | 3.228 / 4.721 / 7.893 | 1 |
| GET /academy-logo.png | 400 | 0.000 / 16.000 / 62.000 | 4.683 / 6.046 / 12.248 | 1 |

### workerd/D1: successful packaged requests

| Route | Samples | workerd CPU ms | Host wall ms | Maximum D1 statements |
|---|---:|---|---|---:|
| GET /customer | 420 | unavailable | 8.208 / 20.036 / 389.373 | 1 |
| GET /qy | 440 | unavailable | 8.086 / 12.004 / 316.303 | 1 |
| POST /api/consultation/qy/login | 260 | unavailable | 494.596 / 581.484 / 1669.309 | 12 |
| POST /api/consultation/account/challenge | 20 | unavailable | 25.861 / 28.906 / 48.022 | 14 |
| POST /api/consultation/account/confirm | 20 | unavailable | 33.063 / 39.930 / 83.345 | 17 |
| POST /api/consultation/contact/challenge | 20 | unavailable | 24.323 / 30.095 / 52.769 | 17 |
| POST /api/consultation/contact/confirm | 20 | unavailable | 22.132 / 31.739 / 46.345 | 14 |
| POST /api/consultation/bookings | 20 | unavailable | 33.854 / 50.919 / 73.830 | 21 |
| POST /api/consultation/offer/accept | 20 | unavailable | 28.011 / 35.958 / 69.616 | 16 |
| GET /workflow-ui.js | 400 | unavailable | 7.255 / 13.146 / 212.640 | 1 |
| GET /workflow.css | 400 | unavailable | 10.358 / 14.102 / 165.805 | 1 |
| GET /academy-logo.png | 400 | unavailable | 9.505 / 12.928 / 103.501 | 1 |

### D1 qualification

Across **10,360 measured invocations**, the maximum executed statement count was **21/50**. Each statement in a batch is counted individually; statements in the trigger body/subqueries are part of the submitted statement rather than separate D1 API calls. Every successful measured route stayed below the cap in both runtimes. The evidence also contains denial/error routes separately. The harness enforces a synthetic 50-statement cap; injected lower quotas and runtime failures intentionally produce denials, not successful throughput evidence. This is exercised-route qualification, not a proof for arbitrary datasets, unexercised successful commands or deployed D1 billing. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

Static requests use one live statement and zero writes; login uses 12, booking submission 21 and acceptance 16. Neither low statement counts nor short wall times establish CPU compliance. Full route/status results are in the measurement JSON.

## Runtime attribution and feasibility

`functions/lib/consultation/auth.js` login reserves the database guessing bucket before calling `passwordHash`, including valid-length wrong usernames. `auth-crypto.js` imports a PBKDF2 key and derives 256 bits using PBKDF2-HMAC-SHA256 at 600,000 iterations inside that invocation. It then compares the verifier and, on success, hashes session/CSRF tokens and atomically inserts a credential-version-bound session/audit record. Offline provisioning hashes are outside the deployed request path, but offline provisioning does not eliminate online password verification.

Cloudflare documents a **10 ms CPU limit** for Free HTTP requests, excludes time waiting on database/network requests, and describes termination when a Worker consistently exceeds its allowance. Transient rollover tolerance is not a design budget. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time).

Cloudflare's workerd crypto source explicitly describes Web Crypto as doing computation synchronously before returning promises; the PBKDF2 implementation calls native derivation while holding the runtime context. Therefore using `await`, Web Crypto or a native implementation does not move the password computation outside the Worker CPU budget. This is source-based attribution, not a measurement of a particular deployed build. Runtime source/API limits can change, and a local successful 600,000-iteration invocation does not prove deployed version support. [workerd crypto implementation](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/crypto/crypto.c++), [PBKDF2 implementation](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/crypto/pbkdf2.c++).

AES-GCM encryption/decryption, HMAC signing/verification, SHA-256 token/policy/manifest hashes, key imports, JSON parsing, schema-result inspection and per-request authorization are also Worker-side work. D1 execution/wait is separate; serial Node SQLite execution is included in the Node CPU figures. The existing static-asset path still executes a live contract SELECT plus policy hashes/key imports inside the Worker before calling ASSETS. Static content is therefore not a zero-CPU bypass in this application. API composition retains its existing fresh validation checks.

No secure design meeting the Free CPU target was demonstrated locally. The password KDF is dominant and cannot be removed by optimizing small validation loops. **BLOCKED** is the feature qualification decision; actual deployed CPU values remain **UNKNOWN**. Neither successful workerd responses nor Node benchmarks establish Free-plan compatibility.

## Alternatives and security implications

| Alternative | Security/runtime assessment | Decision |
|---|---|---|
| Keep current dedicated QY authentication on Workers Paid | Preserves password verifier, identity, OTP, per-request checks and revocation; larger documented CPU allowance addresses the suspected budget mismatch. Paid qualification still needs separately authorized isolated Preview measurements. | Recommended owner decision; no plan change or deployment performed. |
| Pure JS/Wasm/Node-compatible implementation of the same PBKDF2 | Same work factor still consumes Worker computation; no demonstrated local route to 10 ms. Different API does not make CPU free. | No substitution. |
| Cache verifier/login/authorization results | A password-equivalent cache or cached authorization risks revocation/credential drift and bypasses fresh checks. Does not qualify initial login. | Rejected; no cross-request cache. |
| Browser-side PBKDF2 and submit derived value | A derived value accepted directly becomes a replayable password equivalent; retaining server PBKDF2 retains cost. A secure PAKE would be a separate protocol design, not a transparent optimization. | Rejected as a drop-in change. |
| Dedicated QY WebAuthn/passkey authentication | Potentially inexpensive public-key verification without an external identity provider, but enrollment, account binding, recovery, challenge replay, RP/origin checks and session revocation need an approved design and security review. Keeping password fallback leaves this CPU blocker. | Future owner-approved redesign only; not implemented or qualified. |
| Split KDF across invocations or move it to another service/Worker/DO | Requires a reviewed protocol for intermediate state, expiry, replay, guessing limits and atomic credential drift. Adds bindings/resources and may only relocate CPU; no safe Free-compatible proof exists here. External services/providers require owner approval. | Not implemented; not an approved workaround. |
| Reduce iterations/password strength or use a cheaper hash | Violates the required security baseline. | Prohibited and unchanged. |

Rate limiting reduces repeated abuse but cannot make one legitimate PBKDF2 login fit a CPU ceiling. No external authentication provider, customer-facing protocol, password requirement, encryption/HMAC separation, OTP limit, CSRF/origin rule, session revocation or per-request authorization was changed.

## Safe optimization scope

No runtime optimization was implemented. The existing baseline already consolidates live schema checks and gives assets a single fresh read. There is no demonstrated safe optimization here that resolves the password KDF budget. Changes are limited to local attribution tooling, optional raw timing evidence in the existing test harness, and this report. The new phase module is dynamically imported only when an explicit test environment variable is set; it is outside the Worker dependency graph and public output.

## Reproduction

Use the existing installed tooling, not npx or a remote CLI:

```powershell
$env:QY_MINIFLARE_PATH='C:/Users/WIN10/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/miniflare'
$env:QY_ESBUILD_PATH='C:/Users/WIN10/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/esbuild'
$env:QY_TEST_OPENSSL='C:/Program Files/Git/mingw64/bin/openssl.exe'
node --require ./scripts/consultation-local-file-stdio.cjs scripts/run-consultation-cpu-investigation.mjs .local-c1-package-step2b-cpu-new
```

The runner requires a new evidence directory and refuses to overwrite the report's measurement JSON. Preserve/rename prior measurement artifacts explicitly before an intentional rerun. Test logs contain synthetic cases only. A first acceptance attempt without explicit tooling paths failed to load required tools; the next attempt resolved those but two local TLS suites needed the already-documented native OpenSSL override. These exploratory logs are retained separately; they are not counted as successful acceptance.

To regenerate only the summary from retained raw evidence, append `--summarize` and use the existing evidence directory. This explicitly replaces the measurement summary, checks all twenty workload logs for `83 passed, 0 failed`, and reruns sample coverage/statement assertions without rerunning workloads. That mode was locally verified after adding tooling metadata.

## Final local acceptance and integrity

Final evidence directory: `.local-c1-package-step2b-final-acceptance/`. Every final suite completed with zero failures.

| Suite | Passed |
|---|---:|
| Pages (base) | 65 |
| Pages UI | 11 |
| Meetings | 30 |
| Account stepup | 248 |
| Availability | 48 |
| Preferences | 13 |
| Workflow local | 50 |
| Booking UI | 23 |
| Customer resume | 18 |
| Report navigation | 15 |
| Language | 29 |
| Foundation | 142 |
| Workflow runtime | 23 |
| Integration | 62 |
| Preview adapter | 51 |
| **Base total** | **828** |
| Extended Pages additions (83 checks, 65 already counted) | 18 |
| Preview migrations | 111 |
| Deployment/security guards | 19 |
| Package reproducibility | 6 |
| **Distinct existing acceptance total** | **982** |
| Additional isolated phase crypto/guard regressions | 8 |

The 20 CPU workloads additionally passed 1,660 repeated checks; these are repetitions of existing acceptance, not 1,660 new distinct security tests. Phase regressions cover refusing a reduced work factor, wrong password rejection, authenticated customer-context mismatch, ciphertext tampering, wrong key purpose, duplicated cross-purpose material, disabled Preview and incorrect manifest hash. Existing acceptance retains customer identity/ownership, independent OTP proofs and lockout/replay limits, origin/CSRF, session revocation/races and fail-closed environment/schema protections.

Migration verification passed all 15 pinned migrations and local atomic rollback/ledger tests in SQLite and workerd/D1. Two freshly built packages produced identical inventories; tamper detection and private/public file boundaries passed. Generated Worker SHA-256 remains identical to the baseline package:

`0386ea6418710efe6edc75113a2195508751dcad15bde6c9eed6ff5a15de75a9`

Manifest fingerprint remains:

`e8231fb3ed2cd732ac26f7b8ce049c2b72ded138858874b062ad8901c5e0ac17`

Node syntax checks passed for all three changed/new JavaScript test files. Measurement JSON parses successfully. `git diff --check` passed. `git diff --exit-code -- database functions consultation-pages/worker.js consultation-pages/wrangler.template.jsonc` was empty: SQL pins and runtime source/config are unchanged. Final HEAD remains `3655583f3dfb806dc46cfda8ed575a100da7b8fd`; staged diff is empty. The working tree now contains exactly the five investigation files listed below, uncommitted and unstaged.

## Changed files

- `scripts/test-consultation-pages.mjs` — optional isolated-phase hook and raw request sample export.
- `scripts/consultation-cpu-phases.mjs` — Node phase timing and eight crypto/guard regressions.
- `scripts/run-consultation-cpu-investigation.mjs` — serial workload runner, percentile aggregation and statement-cap assertions.
- `consultation-pages/U3-B2B-STEP2B-MEASUREMENTS.json` — measured evidence.
- `consultation-pages/U3-B2B-STEP2B-RESULTS.md` — this report.

Ignored local evidence directories are retained; no staging, commit, push, merge or tag was performed. No remote Cloudflare resource operation, deployment, Production access/change, remote migration, real credential, provider call or existing-server restart occurred. Only public technical documentation/source was read online.

## Remaining blockers and next step

Owner review should decide whether to retain current authentication and approve a Paid-plan qualification investigation, or approve a separately scoped dedicated-QY authentication redesign. Free-plan activation stays blocked. Actual Cloudflare CPU accounting, exact deployed runtime support, abrupt CPU-termination effects, cold/load behavior and production-sized database headroom remain unverified. Any remote acceptance requires separate explicit authorization; this local investigation stops for owner review.
