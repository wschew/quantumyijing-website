# Quantum YiJing C1 - Step 2D-B2B Final Checkpoint Reconciliation

Date: 2026-10-15 (Asia/Kuala_Lumpur)

**CONDITIONAL PASS. Owner-run Chrome virtual-authenticator browser validation: PASS, 21 checks, zero failures.** Browser startup is no longer a checkpoint blocker. Physical/platform authenticator compatibility, deployed Cloudflare Free CPU/accounting and production readiness remain unqualified. Stop for owner review.

## Checkpoint and exact commit-eligible inventory

Verified branch c1-bazi-consultation-development and full HEAD 418d1f55312f5f08ada588d90feb615883a31c30. The reconciliation began with two modified tracked files and three untracked files. Git index is unchanged. This reconciliation edits the report and measurements JSON and normalizes one CRLF terminator in the otherwise LF management test file. It makes no semantic implementation/browser/management test change and does not alter original owner evidence.

Complete eligible local-commit file list, relative to the workspace:

| File | Current Git category | Purpose |
|---|---|---|
| scripts/webauthn-d1-worker.mjs | Modified tracked | One-line fail-closed backward-window admission fix |
| scripts/test-webauthn-d1-management.mjs | Modified tracked | Backward-window/shared-budget/restart tests and deterministic credential-revocation race |
| scripts/test-webauthn-browser.mjs | New untracked | Isolated localhost Chrome/CDP virtual-authenticator browser harness |
| docs/quantum-yijing-c1-step2db2b-measurements.json | New untracked | Reconciled owner/browser, sandbox and regression evidence |
| docs/quantum-yijing-c1-u3-b2b-step-2d-b2b-report.md | New untracked | This final checkpoint report |

No other tracked files changed. The schema, committed validators, PBKDF2, active C1 authentication routes, frozen Academy modules, payment/accounting, affiliate, WhatsApp, subscription, migration manifest and all 15 pinned migrations remain unchanged. Ignored .local-c1-package-* evidence, Chrome profiles and disposable databases are NOT commit-eligible. No staging, commits, pushes, merges or tags occurred. No remote Cloudflare operations, deployment, real credentials or external providers were used. Port 8789 was not restarted or controlled.

## Owner-run evidence independently inspected

Original source: .local-c1-package-step2db2b-rarnbZ/result.json. Its SHA-256 is cb8786147089770c52eff8f5eedb0dfd53a556c3869d0d9c5a57440c38c351a2. The file contains exactly 21 unique successful check names, an empty failures array and no setupError property. All names and order match the 21 test calls in the inspected current browser harness. This is saved-file evidence, not an inference from the owner's console transcript.

The directory also contains chrome.log, chrome-profile/DevToolsActivePort and persistent D1 files. The browser endpoint in chrome.log matches the port and browser identifier in DevToolsActivePort. The log contains the normal DevTools-listening message. The saved runtime identifies Chrome/CDP and includes returned miniflare.db metadata. There are 54 adapter request samples, 54 matching browser request samples and 19 completed credential-ceremony samples; request paths/statuses match pairwise.

The owner separately reports RESULT 21 passed, 0 failed and C1 BROWSER TEST EXIT: 0 in normal Windows PowerShell. The saved JSON does not contain a process-exit field: exit 0 is explicitly owner-reported, while 21 successful assertions/no setupError/no failures are independently verified from disk. Codex did not rerun Chrome or claim an in-sandbox browser pass.

A disposable copy of the owner database plus its WAL/SHM was inspected; the original database was not opened for writing. PRAGMA integrity_check returned ok. Final persisted state: account epoch 3, key_epoch 1, bootstrap closed; two credentials, one revoked, one active; seven session rows; 22 challenge rows; an empty atomic_guard table. The event table records one logout, one revoke-all and one credential-revoked event. This is consistent with the final revocation/two-key-gate test. It is independent supporting state, not proof of every transient assertion by itself.

The original result, Chrome log/profile and database remain intact. Before reconciliation, copies of the previous report/measurements were saved in .local-c1-package-step2db2b-reconciliation/pre-reconciliation-report.md and pre-reconciliation-measurements.json. The original failure object is retained separately as browserSandboxFailure in the updated measurements; browser now contains the successful owner's result verbatim.

## Runtime and virtual-authenticator scope

| Component | Verified source / value |
|---|---|
| Browser origin | http://localhost:59529 |
| Node | v24.20.0 |
| Running browser | Chrome/155.0.8059.40 |
| CDP protocol | 1.3 |
| V8 / JavaScript | 15.5.35.20 |
| Miniflare | 5.20261006.1-alpha |
| workerd | 1.20261006.1 |
| Returned database service | miniflare.db |
| Browser secure context | Passed actual isSecureContext assertion |
| Authenticator options | CTAP2, ctap2_1, USB, UV supported/verified, automatic presence, resident-key capability |
| Ceremony options | userVerification required, none attestation, ES256, residentKey discouraged; stored ID allow-list for assertions |

Virtual-authenticator configuration is verified against the current harness source, not a saved raw CDP command transcript; the owner result has no historical source hashes. Two distinct virtual authenticators enroll two credentials; the second is removed after enrollment. This verifies separate virtual credentials, not two independently held physical devices.

The ephemeral adapter listens on 127.0.0.1, enforces the expected localhost Host, and exposes only begin/finish/session/logout/revoke-all/revoke-credential paths. It forwards bounded JSON to genuine local workerd with a separate fresh persistent D1 binding. Runtime source changes only synthetic RP/origin literals to localhost/the selected origin and adds response metrics. Parser, cryptography, counter/UV checks, admission and atomic verification SQL remain in use. Maintenance/recovery endpoints are absent from the browser adapter and pristine Worker. No active C1 router is imported.

Chrome runs with a fresh disposable headless profile and no insecure-origin or no-sandbox bypass. Background networking is disabled and non-loopback requests are proxied to an unused loopback endpoint. The localhost secure-context assertion executed successfully; no real provider or credential was needed.

## Browser checks: all 21 passed

1. localhost is a browser secure context.
2. browser ES256 none registration persists credential ID and EC public key.
3. browser registration challenge replay rejected.
4. second distinct virtual authenticator enrollment.
5. browser signature verifies and creates usable session.
6. authentication and session survive Worker restart.
7. browser assertion replay rejected.
8. browser challenge mismatch rejected.
9. expired browser challenge rejected.
10. browser-derived invalid origin rejected.
11. browser-derived invalid RP hash rejected.
12. browser-derived missing UP rejected.
13. virtual authenticator signed missing UV rejected.
14. browser signature tampering rejected.
15. virtual authenticator counter rollback rejected.
16. logout rejects old session.
17. revoke-all restart rejects old sessions and pending browser challenges.
18. shared-account get allowance exhaustion across callers.
19. rate window rollover admits and resets count.
20. backward rate window fails closed without changing bucket.
21. credential revocation rejects sessions pending assertions and two-key gate.

The invalid-origin/RP/UP/signature cases mutate browser-derived serialization and may also invalidate the signature. They are adversarial server-rejection checks, not genuine alternate-origin browser ceremonies or isolated proof of each rejection cause. The missing-UV case uses the CDP signed-response override; the counter case removes/re-adds the virtual credential with a rolled-back signCount. Registration-specific negative flags/origin/RP and browser rejection of invalid RP options remain missing browser coverage. Synthetic Node/workerd negatives are separate evidence.

## Earlier Codex environment limitation preserved

The earlier final Codex attempt is .local-c1-package-step2db2b-5MJn66/result.json and chrome.log, after three failed startup attempts. It recorded BLOCKED: Chrome DevTools port unavailable, empty checks/samples and CreateFile / Mojo / crash-server Access is denied (0x5). No browser ceremony ran in that attempt. It remains an environment-specific failure, not a failed WebAuthn ceremony and not a passing run. No sandbox, ACL, TLS or authenticator security control was relaxed to reconcile the owner's later success.

The earlier management-final-v2.log timeout is also retained separately: the profiling runtime had disabled instrumentation, so the new credential race never reached its barrier. The final management-final-v3.json/.log restores an instrumented runtime before the race and passes all 17 checks. Original 14-check and earlier 17-check attempts are historical attempts, not additional passing test cases.

## Backward-window, restart and revocation verification

The exact Worker diff changes the admission UPSERT predicate from accepting any unequal minute to accepting a strictly greater minute, or the same minute only below the limit. A lower database minute returns no row, throws admission failure and leaves window/hits unchanged. Once a bucket is in a future window, availability stays closed until time catches up; forward jumps start a fresh bucket. The fix adds no statement or service and does not protect against a trusted writer changing the database.

Management-final-v3 has 17 named passes, verified against its saved log and embedded raw result. It covers all five scopes at both zero and exhausted hit counts, asserting lower windows reject/preserve full bucket state; same-window limits; rollover; fixed shared-account budget/cardinality; restart and revocation; cleanup/audit/reset faults; and absence of public maintenance/recovery/metrics routes. A fresh in-memory execution of the current standalone SQL schema additionally verified backward/same/forward admission invariants for all five scopes during this reconciliation.

Restart tests dispose/recreate workerd against the same isolated D1 persistence root. They reject old sessions and unused signed challenges after revoke-all, preserve challenge used=0 while epoch invalidates it, and permit fresh login. The owner browser run separately passes both authentication/session persistence and revoke-all/restart rejection using actual navigator credential APIs.

The credential-revocation race holds a cryptographically verified authentication immediately before its write batch, lets the real authenticated /revoke-credential dispatcher commit independently, then releases authentication. The saved racing authentication returns 400 after eight submission attempts, metadataComplete=false: it reaches the failed atomic batch. Old sessions, the pending assertion and new login with fewer than two keys also reject. The test deliberately reopens the instrumented runtime after profiling; public HTTP input cannot arm its private test barrier.

Authentication-first then revoke-all is tested through the real dispatcher. The complementary revoke-first management schedule uses an independent trusted D1 transaction for the revoke mutation while verification is held; it is not mislabeled as a real HTTP revoke-all race. Eight concurrent real revoke-all requests produce one authorized winner and one event. These are deterministic local schedules, not deployed-region, physical-device or crash-recovery guarantees.

## Counts reconciled without duplication

| Suite / verification | Result | Evidence |
|---|---|---|
| Owner browser | 21 passed, 0 failures | .local-c1-package-step2db2b-rarnbZ/result.json |
| Authentication management | 17 passed, 0 failed | .local-c1-package-step2db2b-regression/management-final-v3.json and .log |
| Persistent D1 security | 65 passed, 0 failed | .local-c1-package-step2db2b-regression/d1.json and .log |
| Node WebAuthn | 247 passed, 0 failed | .local-c1-package-step2db2b-regression/node.log |
| workerd validator / Node-state WebAuthn | 247 passed, 0 failed | .local-c1-package-step2db2b-regression/workerd.log |
| Base C1 acceptance | 828 passed across 15 suites, all exits 0 | .local-c1-package-step2db2b-acceptance/summary.json and per-suite logs |
| Supplemental extended Pages | 83 executed, 18 distinct additional | .local-c1-package-step2db2b-reconciliation/extended.log |
| Migration/ledger tests | 111 passed, 0 failed | .local-c1-package-step2db2b-reconciliation/migrations.log |
| Security/deployment guards | 19 passed, 0 failed | .local-c1-package-step2db2b-reconciliation/guards.log |
| Reproducibility/tamper | 6 passed, 0 failed | .local-c1-package-step2db2b-regression/repro.log |
| Distinct C1 acceptance | 982 = 828 + 18 + 111 + 19 + 6 | Saved base/repro plus fresh supplemental passes |
| Pinned migrations | 15 files verified | Files-only verifier rerun; zero remote operations |

The 248 account-stepup checks are already included in 828. Do not add all 83 extended checks or add the six reproducibility checks a second time. All 18 additional extended pass names were compared against the base Pages log and are retained in the measurement JSON. The 15 pins count files, not extra acceptance test cases. Browser, management, D1 and both validator modes overlap semantically and are reported separately; no aggregate unique-security-test total is claimed.

The owner's historical 50/50 standalone-authentication result remains separate owner evidence from earlier checkpoints. No new standalone-authentication pass inside Codex is claimed. The earlier sandbox EPERM limitation is not erased by a successful Chrome run.

## Browser measurements and limits

All recorded browser-run samples are included, without warmup exclusion. Tables use nearest-rank **p50 / p95 / maximum**. Each route/status group has a small unequal sample count; these are security-run observations, not a controlled load benchmark. Successful /finish groups mix registration and authentication because raw route samples do not record ceremony kind. There is no separately reconstructed whole two-request ceremony duration.

| Browser-run operation/status | N | Browser request ms | Adapter/workerd host wall ms | Submission attempts | Returned D1 reads | Returned D1 writes |
|---|---:|---|---|---|---|---|
| /begin 200 | 22 | 16.2 / 61 / 118.9 | 13.5989 / 56.0646 / 116.5292 | 5 / 5 / 5 | 7 / 7 / 7 | 6 / 7 / 7 |
| /finish 200 | 9 | 23.7 / 103.5 / 103.5 | 18.7871 / 99.3574 / 99.3574 | 8 / 8 / 8 | 16 / 16 / 16 | 8 / 9 / 9 |
| /finish 400 | 12 | 15.1 / 45.1 / 45.1 | 12.358 / 42.4381 / 42.4381 | 3 / 3 / 3 | 6 / 6 / 6 | 1 / 1 / 1 |
| /session 200 | 2 | 34.9 / 82.1 / 82.1 | 32.1562 / 79.1834 / 79.1834 | 2 / 2 / 2 | 6 / 7 / 7 | 1 / 2 / 2 |
| /logout 200 | 1 | 12.9 / 12.9 / 12.9 | 10.4581 / 10.4581 / 10.4581 | 5 / 5 / 5 | 8 / 8 / 8 | 7 / 7 / 7 |
| /session 400 | 3 | 11.4 / 58.2 / 58.2 | 8.9225 / 54.7407 / 54.7407 | 2 / 2 / 2 | 4 / 4 / 4 | 1 / 1 / 1 |
| /revoke-all 200 | 1 | 12 / 12 / 12 | 9.6484 / 9.6484 / 9.6484 | 5 / 5 / 5 | 9 / 9 / 9 | 6 / 6 / 6 |
| /begin 400 | 3 | 16.3 / 111.6 / 111.6 | 13.4509 / 109.0411 / 109.0411 | 1 / 5 / 5 | 2 / 3 / 3 | 0 / 1 / 1 |
| /revoke-credential 200 | 1 | 11.4 / 11.4 / 11.4 | 9.1193 / 9.1193 / 9.1193 | 6 / 6 / 6 | 13 / 13 / 13 | 8 / 8 / 8 |

| Browser-run operation/status | Node driver CPU ms | Local D1 duration ms | Incomplete metadata samples |
|---|---|---|---:|
| /begin 200 | 0 / 16 / 16 | 0 / 1 / 2 | 0 |
| /finish 200 | 0 / 16 / 16 | 1 / 19 / 19 | 0 |
| /finish 400 | 0 / 47 / 47 | 0 / 2 / 2 | 0 |
| /session 200 | 0 / 15 / 15 | 1 / 1 / 1 | 0 |
| /logout 200 | 16 / 16 / 16 | 1 / 1 / 1 | 0 |
| /session 400 | 0 / 16 / 16 | 1 / 2 / 2 | 0 |
| /revoke-all 200 | 0 / 0 / 0 | 0 / 0 / 0 | 0 |
| /begin 400 | 0 / 0 / 0 | 0 / 0 / 0 | 1 |
| /revoke-credential 200 | 0 / 0 / 0 | 0 / 0 / 0 | 0 |

| Navigator credential operation | N | Host ceremony wall ms p50 / p95 / maximum |
|---|---:|---|
| create | 2 | 6.9965 / 13.5277 / 13.5277 |
| get | 17 | 5.6731 / 62.7254 / 62.7254 |

Browser request timers include fetch, localhost transport and response JSON parsing. Adapter host wall starts after request-body buffering and includes Miniflare/workerd dispatch and body consumption; it excludes browser HTTP transport and navigator ceremony. Ceremony host timing includes the credential API operation and CDP evaluate round-trip, but excludes begin/finish HTTP. There is no browser-CPU measurement.

Node process.cpuUsage covers the host driver only, excludes Chrome/workerd, and is Windows-quantized. Zero readings do not establish zero runtime CPU or a sub-limit Worker bound. D1 duration is local returned database elapsed time, not CPU. D1 rows/duration are actual returned local metadata, not a deployed billing measurement. The statements counter measures application submission attempts; it does not observe exact execution counts, internal transactions, retries or rollback work. Standalone preparation/binding failures can count an attempt before a backend receives it.

One browser sample, the final /begin rejection after credential revocation, has metadataComplete=false because its guard batch fails. Its retained read/write figures cover only earlier successful operations; missing failed-batch metadata is unavailable, not zero actual work. Admission intentionally commits separately, so failed authentication can write a rate bucket without partially creating a credential/session.

## Retained synthetic performance evidence

Management retains 131 raw samples; the larger D1 raw set is retained at .local-c1-package-step2db2b-regression/d1.json. Its 65-check wrapper bypasses admission, while management and owner-browser paths retain admission. Do not compare them as identical request paths. Setup/signing/inspection/bulk inserts are excluded. Management barrier samples include intentional wait/test-control overhead. Original regression batch timing may overlap other suites; the successful owner browser timings are a separate execution.

| Synthetic local operation | N | Wall ms p50 / p95 / maximum | Submission attempts | Returned reads | Returned writes |
|---|---:|---|---|---|---|
| limited login begin | 10 | 8.3098 / 12.3993 / 12.3993 | 5 / 5 / 5 | 7 / 7 / 7 | 6 / 7 / 7 |
| limited login finish | 10 | 10.4947 / 13.7612 / 13.7612 | 8 / 8 / 8 | 16 / 16 / 16 | 8 / 9 / 9 |
| growth revoke 10000 | 1 | 6.2036 / 6.2036 / 6.2036 | 5 / 5 / 5 | 8 / 8 / 8 | 7 / 7 / 7 |
| growth cleanup 10000 | 10 | 6.1203 / 13.6747 / 13.6747 | 4 / 4 / 4 | 806 / 806 / 806 | 200 / 200 / 200 |
| credential revoke racing auth | 1 | 69.8997 / 69.8997 / 69.8997 | 8 / 8 / 8 | 6 / 6 / 6 | 1 / 1 / 1 |

At +100/+1,000/+10,000 synthetic rows per table, allocation metadata was 81,920 / 253,952 / 1,806,336 bytes. Ten bounded cleanup calls leave sessions/challenges at 22/36, 23/37 and 9,024/9,038. The large backlog is expected from fixed 100-candidate/table cleanup bounds, not silently treated as fully purged. Grace periods/holds remain. Revoke-all is now epoch-based rather than a historical-row bulk update. Cleanup cadence, retained credential generations, shared daily volume and storage growth still require owner decisions; no scheduler or VACUUM is added here.

## Qualification, remaining risks and owner review

No paid dependency was introduced, but **Cloudflare Free compliance remains unproven**. Browser request timing, driver CPU, local workerd wall time and returned D1 duration cannot establish deployed Worker CPU. Current deployed CPU, quota/error behavior, row accounting and shared-account budgets are unmeasured. No remote validation or deployment is authorized by this report.

The successful browser run establishes this headless Chrome virtual-authenticator/local workerd/D1 path under its tested profile. It does not establish physical security-key, platform-authenticator, biometric, synced-passkey, Firefox/WebKit or production compatibility. ES256-only, no-extension, positive-counter and backup-flag rejection policies remain restrictive. Public cookie/CSRF/session transport, shared-account lockout/admission policy, independent recovery authorization/custody, retention/cleanup capacity and further genuine RP/origin/registration negative coverage remain open. Owner recovery remains offline; pristine routing exposes no reset/cleanup/recovery endpoint.

Final reconciliation checks include JavaScript syntax for the changed Worker, management harness, browser harness and existing D1 harness; current standalone SQL schema/invariants; snapshot integrity; Git whitespace plus explicit trailing-whitespace checks for all five eligible files; unchanged protected tracked inventory; empty index; and all 15 migration pins. One Git whitespace diagnostic identified the lone CRLF management-script terminator; it was normalized to LF without changing test logic. Original owner/browser evidence files were not edited. This task neither restarts port 8789 nor stages/commits anything.

**Final verdict: CONDITIONAL PASS for this local checkpoint; browser evidence PASS.** The former browser-startup blocker is resolved by verified owner-run artifacts. Remaining conditions concern broader coverage and qualification, not a hidden browser test failure. Stop for owner review.
