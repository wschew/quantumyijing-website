# Quantum YiJing C1 — Step 2D-B4B-1

Protected security control lanes — isolated local prototype

Date: 2026-10-15 (Asia/Kuala_Lumpur)

**CONDITIONAL PASS.** Local security-control isolation, synthetic workerd/D1 tests and the owner-run updated browser suite pass. The earlier Codex Chrome startup failure remains an environment limitation. This is not production integration, physical-authenticator qualification or deployed Cloudflare Free CPU evidence. Stop for owner review.

## 1. Baseline and exact inventory

Verified before changes: branch `c1-bazi-consultation-development`, full HEAD `e18480ecbe544936ec586c8a9f4f1e24c8000b24`, clean working tree, all 15 migration pins. Primary reference: `docs/quantum-yijing-c1-u3-b2b-step-2d-b4a-design.md`. No AGENTS.md was found.

Exactly nine files are eligible for owner review and a future local commit:

| File | Change |
|---|---|
| `scripts/webauthn-d1-worker.mjs` | Separate anonymous admission; bound sessions; fresh-proof controls; atomic suspension/revocation |
| `scripts/webauthn-d1-schema.sql` | Add prototype security state, trusted custody mapping and session binding |
| `scripts/webauthn-d1-policy.mjs` | New cookie/CSRF gate and action-ticket MAC helpers |
| `scripts/webauthn-d1-test-client.mjs` | New Node-only synthetic transport and offline enrollment instrumentation |
| `scripts/test-webauthn-protected-controls.mjs` | New abuse, race, rollback, restart and resource suite |
| `scripts/test-webauthn-d1.mjs` | Adapt existing persistent tests to bound transport/offline fixtures |
| `scripts/test-webauthn-d1-management.mjs` | Adapt management tests, anonymous scopes and independent actor revocation |
| `scripts/test-webauthn-browser.mjs` | Adapt browser harness to cookie/CSRF transport and fresh control assertions |
| `docs/quantum-yijing-c1-u3-b2b-step-2d-b4b1-report.md` | This report |

Ignored disposable evidence and databases are not commit candidates. Existing C1 runtime routes, business SQL, PBKDF2 authentication, frozen Academy modules, pinned migrations, manifest, configuration and prior reports are unchanged. No staging, commits, pushes, merges, tags, remote Cloudflare operations, provisioning, deployment, real credentials or provider calls occurred. The existing server on port 8789 was not restarted.

## 2. Architecture and B4A reconciliation

The baseline used shared account fixed-window scopes, including control/session scopes, and bearer-authorized management. The prototype now retains only anonymous `get` (60/minute) and `finish` (120/minute) admission. Ordinary session authorization and authenticated controls do not debit these buckets. Backward windows fail closed; forward rollover restores anonymous admission. Neither condition deducts protected control capacity.

Public control requests require exact configured URL origin and Origin, same-origin Fetch Metadata when present, a session cookie, MAC-bound gate cookie and CSRF header. Gate claims bind session hash, CSRF hash, authenticating credential, origin and lifetime. A MAC is admission evidence only: live database session, epoch, credential, custody and account state remain authoritative. Invalid/missing bindings are rejected before D1. Cookies are Secure, HttpOnly, SameSite=Strict, host-prefixed and path `/`. Session lifetime is five minutes. Logout clears both cookies, including on denial.

Authenticated `/control-options` performs bounded reads and returns a stateless, MAC-protected 60-second ticket. It writes no challenge or nonce row. The ticket binds action, target, session, CSRF, actor credential, account/key epochs, origin, challenge, issue time and expiry. `/suspend`, `/revoke-all` and `/revoke-credential` require a fresh WebAuthn assertion using the unchanged strict validator: user verification, exact RP ID/origin, challenge, ES256 signature and counter checks. No bearer-only management alternative remains.

The final D1 batch rechecks time, session/CSRF/actor, epochs, credential counter and active account/custody predicates. Guard failure aborts the batch. Actor counter update, security state/target change, epoch advancement and audit insertion commit together. Epoch advancement consumes all earlier control tickets and invalidates all active sessions and pending login challenges logically; physical row deletion is unnecessary for immediate denial. Audit insertion failure rolls back the whole operation. Failed transactions do not consume proofs; a retry can succeed after the fault is removed. Committed proofs cannot be replayed.

Suspension sets `SUSPENDED`; defensive revocation is permitted only against a different trusted custody group. Losing the two-key gate puts the account into `QUARANTINED`. These states cannot regain authority through login. The trusted offline owner-reset function advances account/key epochs; it is not an HTTP endpoint. Two new approved current-generation custody groups are required before login can resume.

Additive prototype tables are `security_state` (singleton ACTIVE/SUSPENDED/QUARANTINED), `credential_custody` (credential-to-approved-group mapping), and `session_binding` (session hash, CSRF hash and authenticating credential). Session-binding deletion cascades with session cleanup. No pinned migration changed.

B4A permits a bound session without fresh proof for logout, and one fresh actor proof for protective suspension/revoke-all/defensive revocation. This implementation follows those scopes. Two independent approvals required for credential addition/replacement, policy changes and restoration are **not implemented**. Public enrollment is disabled rather than replaced by weaker single-proof enrollment. Harness-only source instrumentation invokes trusted offline fixture enrollment and custody approval; no public input enables those hooks or the race barrier. Final tests also exercise a runtime without fixture routes or barrier RPC.

This is a control-lane slice, not the complete B4A contract. Legacy synthetic JSON/body bearer transport remains alongside mandatory cookie/gate/CSRF binding for harness compatibility. It is not a completed C1 session/provenance/schema bridge. Repeated logout is safely denied with cookie clearing and no duplicate event, but returns 400 rather than the proposed idempotent 200 response.

## 3. Evidence and tests

Final evidence references (workspace-relative):

| Evidence | Result |
|---|---|
| `.local-c1-package-step2db4b1-regression/controls.json`, `controls.log` | **35 passed**, zero failures; 561 samples, 40 operation groups |
| `.local-c1-package-step2db4b1-controls-r6YICs/results.json` | Same final protected-suite result and disposable database directory |
| `.local-c1-package-step2db4b1-regression/d1.json`, `d1.log` | **65 persistent-D1 checks passed** |
| `.local-c1-package-step2db4b1-regression/management.json`, `management.log` | **17 management checks passed** |
| `.local-c1-package-step2db4b1-regression/node.log` | **247 Node WebAuthn checks passed** |
| `.local-c1-package-step2db4b1-regression/workerd.log` | **247 workerd validator checks passed** |
| `.local-c1-package-step2db4b1-acceptance/summary.json` | **828 base C1 checks**, all 15 suite exits zero |
| `.local-c1-package-step2db4b1-regression/extended.log`, `migrations.log`, `guards.log`, `repro.log` | 18 additional distinct checks +111 migration +19 guard +6 reproducibility checks |
| `.local-c1-package-step2db4b1-regression/pins.log` | **15 migration pins**, files-only verification; database ledger not inspected |
| `.local-c1-package-step2db4b1-browser-4lSe3g/result.json`, `chrome.log` | **Browser PASS: 21 checks**, zero failures, no setupError; owner run outside Codex |
| `.local-c1-package-step2db4b1-browser-DktVL3/result.json`, `chrome.log` | Earlier Codex environment BLOCKED, zero checks executed; retained separately |

Distinct C1 total is **982 = 828 +18 +111 +19 +6**. Extended suite reports 83, of which 65 overlap the base suite. The six reproducibility checks are included in 982. Browser, management, D1 and validator modes are separate evidence sets with semantic overlap; they are not a combined count of unique security cases. Superseded development logs are not additional passing cases. The owner's historical standalone authentication 50/50 and B2B browser 21/21 remain historical evidence, not new passes for this checkpoint.

Protected tests cover exhausted anonymous admission followed by logout, suspension and credential revocation; zero-write ordinary authorization; missing binding, wrong CSRF/origin and tampered gate; invalid signature/UV/RP/origin/challenge/signer; expired, wrong-action and wrong-session tickets; replay; expiry between cryptographic verification and SQL; session/CSRF revocation during verification; custody separation; database query errors; audit-trigger rollback for logout/suspend/revoke and successful retry; fixed-window rollover/backward time; restart persistence; and 100 anonymous invalid control requests with zero SQL and no row growth. Existing D1/management suites retain challenge, counter, credential race, transaction and cleanup coverage.

Deterministic concurrency holds verified requests immediately before the atomic batch, through private harness instrumentation only:

- Suspension-first: suspension 200, pending authentication 400.
- Authentication-first: authentication 200, suspension 200; the newly issued session is unusable afterward.
- Four independently dispatched verified suspensions: exactly one 200, three denials, one epoch increment and one audit event.

Restart tests deny the old session, old control ticket and pending signed login. The two commit-order tests use separate signing credentials so a same-key counter race does not mask epoch behavior. A same-key concurrent login can advance the counter and deny a control assertion; the safe response is a new fresh proof, not weakening CAS. Suspension is not guaranteed to win every schedule.

## 4. Local resource measurements

Actual local Miniflare `5.20261006.1-alpha`, workerd `1.20261006.1`, compatibility date `2026-10-07`, Node `v24.20.0`; isolated disposable D1-compatible storage. Final protected profiling ran alone after regressions. Percentiles use nearest rank. Values below are **p50 / p95 / maximum**. Singleton values are not distribution evidence.

| Operation | n | Host request wall ms | Application SQL submission attempts | Returned rows read | Returned rows written |
|---|---:|---|---|---|---|
| Ordinary session | 100 | 5.6923 / 7.7015 / 9.5185 | 2 / 2 / 2 | 14 / 14 / 14 | 0 / 0 / 0 |
| Logout | 100 | 7.4277 / 10.7387 / 16.7145 | 6 / 6 / 6 | 30 / 30 / 30 | 5 / 5 / 5 |
| Suspension options | 100 | 7.4802 / 10.6104 / 15.1620 | 3 / 3 / 3 | 15 / 15 / 15 | 0 / 0 / 0 |
| Suspension commit | 100 | 9.3044 / 11.9753 / 15.7978 | 9 / 9 / 9 | 34 / 34 / 34 | 7 / 7 / 7 |
| Revocation under exhaustion | 1 | 12.5385 | 10 | 41 | 9 |
| Invalid proof signature | 1 | 9.0432 | 3 | 15 | 0 |
| Anonymous invalid control | 100 | 2.0804 / 2.7357 / 2.9285 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |

Suspension options and commit are separate requests; signing, fixture reset/enrollment and proof preparation are excluded. The 100 suspension cases reset a trusted disposable fixture, rather than representing 100 live administrators. Exhausted logout measured 17.518 ms; exhausted suspension 14.0093 ms. Four concurrent suspension wall measurements were 42.6140 /42.6633 /42.6633 ms and include contention/test scheduling; their failed batches have incomplete metadata. Security barrier waits, including expiry waits, are deliberate and must not be interpreted as normal service latency.

Returned D1 duration ms p50/p95/max: session 0/1/2; logout 1/2/3; options 0/1/2; suspension 1/2/3. Node-driver CPU ms respectively: 0/16/16, 0/15/16, 0/16/16, 0/15/31. This quantized CPU measurement covers the Node caller, **excludes workerd CPU**, and is not Cloudflare billing evidence. Host wall time covers dispatch and response consumption; it is not CPU.

`statements` in raw JSON means instrumented application SQL submission attempts, including attempted prepare/bind/batch statements. It is **not actual execution count**, and does not enumerate internal BEGIN/COMMIT/ROLLBACK, D1 implementation work or automatic retries. Reads/writes/duration are actual returned local D1 metadata, not estimates derived from SQL. Failed queries/batches set `metadataComplete:false`; retained values cover preceding successful queries only. A zero returned count on a failure does not prove zero failed work. Trigger-induced rollback, query-failure and retry samples remain in the JSON; failed and successful paths are not silently pooled as complete metadata. These errors model reproducible local failure, not an actual deployed quota experiment.

Growth probes added 100, 1,000 and 10,000 expired sessions. Before/after bounded cleanup session counts were 101/1, 1001/901 and 10901/10801. Each two-table cleanup batch removed at most 100 expired sessions and 100 expired challenges, returning 800 reads/200 writes. Session bindings cascade; the live session remains valid with 2 submissions/14 reads/0 writes at all three sizes. This probes the cleanup subset; the management suite covers the existing full cleanup operation. Repeated maintenance remains necessary: cleanup is deliberately bounded, not instantaneous deletion of the backlog. These are row observations, not byte-size or deployed billing guarantees.

## 5. Owner browser PASS and retained environment limitation

The earlier Codex result in `.local-c1-package-step2db4b1-browser-DktVL3` has zero checks, zero samples, an empty versions object, no test failures and `setupError: Error: BLOCKED: Chrome DevTools port unavailable`. Chrome log reports `CreateFile: Access is denied. (0x5)`, fatal Mojo platform channel failure and crash-server launch failure. That attempt is an environment failure, not a failed browser assertion. No security flag was weakened to bypass the environment.

The owner subsequently executed the updated harness successfully in normal Windows PowerShell. Saved `.local-c1-package-step2db4b1-browser-4lSe3g/result.json` was inspected directly: **21 checks, zero failures, setupError absent**, Chrome `155.0.8059.40`, CDP `1.3`, Node `v24.20.0`, Miniflare `5.20261006.1-alpha`, workerd `1.20261006.1`, and 51 request measurement samples. Result SHA-256: `87d603b213e7bcdef3305426d8aa15de6706300b7cde79e619fcbf78652299ec`. The owner reports exit code 0; the saved JSON independently confirms successful checks.

The harness uses CDP CTAP2/CTAP2.1 USB virtual authenticators with resident-key capability, user verification enabled/verified and automatic presence simulation. The second credential uses a distinct virtual authenticator. This verifies synthetic browser interoperability, not independent physical custody. Checks include restart survival, assertion replay and expiry, invalid origin/RP/UP/UV/signature/counter, logout, revoke-all restart, exhausted/rollover/backward admission and credential revocation. No new browser checks were added or executed during closure.

Request samples retain application SQL attempts and returned local D1 metadata; browser/ceremony samples retain local timing. They do not supply workerd CPU or deployed billing evidence. The saved result explicitly leaves physical security keys, platform authenticators, Firefox, WebKit and deployed Worker CPU/Free qualification unvalidated.

Command used for owner reproduction (retained for reference; no rerun required for closure):

```powershell
cd "C:\Users\WIN10\Desktop\qy-c1-bazi-consultation-development"
$env:QY_MINIFLARE_PATH='C:/Users/WIN10/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/miniflare'
$env:QY_CHROME_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'
node --require ./scripts/consultation-local-file-stdio.cjs scripts/test-webauthn-browser.mjs
$code=$LASTEXITCODE
Write-Host "C1 B4B-1 BROWSER TEST EXIT: $code"
```

The successful result.json and accompanying browser evidence are retained in the owner evidence directory above. This uses a fresh synthetic browser profile and disposable database and does not restart port 8789.

## 6. Decision, remaining risks and next steps

| Requirement | Classification | Evidence or remaining condition |
|---|---|---|
| Anonymous bucket exhaustion cannot spend protected control allowance | PASS | Exhaustion/logout/suspend/revoke tests; zero admission writes for controls |
| Fresh verified proof, session binding and atomic suspension | PASS | Negative proofs, SQL rechecks, rollback, replay and deterministic races |
| Immediate logical session/challenge invalidation and restart persistence | PASS | Epoch/state tests and restart denials |
| Offline-only enrollment/recovery | PASS for endpoint isolation | Public paths disabled; trusted synthetic fixture only |
| Two independent authenticators | CONDITIONAL | Trusted custody-group mapping tested; physical custody cannot be proven by virtual keys |
| Complete two-approver lifecycle and offline repair procedure | BLOCKED for integration | Deliberately outside this control-lane slice; routes remain disabled |
| Current changed browser flow | PASS | Owner saved result: 21 checks, zero failures, no setupError |
| Entire B4A DoS policy | CONDITIONAL | Only existing minute anonymous caps retained; short/long/daily/outstanding-challenge design not yet implemented |
| Global availability under abuse | CONDITIONAL | Lane isolation cannot reserve global Worker CPU, D1 quota, connection or network capacity |
| C1 authorization/session integration | BLOCKED | No active routes/business guards changed; UUID/provenance/SQL bridge remains future work |
| Deployed Cloudflare Free CPU/resource compliance | BLOCKED | No deployed CPU, quota, physical storage or remote concurrency evidence |
| Production readiness | BLOCKED | Physical/browser coverage beyond Chrome, lifecycle, operational key custody and deployment validation remain |

A holder of a valid session/gate/CSRF can repeatedly request options and cause bounded reads/crypto; this implementation does not solve authenticated resource exhaustion. The 20,000-byte bounded streaming body reader and bounded headers/tickets/credential IDs limit individual input, not global traffic. No request-body deadline or complete multi-window admission/outstanding-challenge cap is added in this slice. Shared anonymous admission may still deny login; it no longer denies controls by consuming the same logical allowance. Database/global quota failure still fails closed and may make legitimate controls unavailable.

MAC key is a required synthetic binding, randomly generated per run and kept stable across Worker restart; no default production key or real credential exists. Full rotation/custody runbooks, two-approver enrollment/replacement/policy workflows, offline reset CAS ceremony, audit legal retention and complete C1 integration remain unresolved. Physical/synchronized provider independence is not demonstrated.

Next: owner review of this closed local checkpoint; any later phase may implement the remaining isolated lifecycle/admission policies with negative/race tests before considering any active integration. Deployment feasibility needs a separately authorized Cloudflare Free validation phase. Rollback is discard these isolated changes and disposable evidence only; no active runtime or pinned migration rollback is needed. No Git mutation is authorized by this report.

## 7. Final verification

All seven modified/new JavaScript modules pass `node --check`. Both default `git diff --check` and `git -c core.autocrlf=false diff --check` pass; direct scans of all nine files find no trailing spaces/tabs. Git's LF-to-CRLF notices are conversion warnings, not whitespace failures. The full schema is exercised by fresh databases in the passing protected, D1 and management suites. All 40 percentile groups were independently recomputed from 561 raw samples, and the two final protected-result copies are identical. The final read-only migration verifier again passes all 15 pins. Branch and full HEAD remain unchanged, the index is empty, and tracked/untracked changes match the nine-file inventory above.


Closure verification: owner browser evidence reconciled without rerunning or expanding test suites. Existing 35 protected-control, 65 persistent-D1, 17 management, both 247-check validator modes and 982 distinct C1 checks remain supported by saved evidence. Final syntax, whitespace, migration pins, branch/HEAD and the exact nine-file inventory were rechecked. Only this report changed during closure; no feature or runtime code was changed. Overall CONDITIONAL PASS remains scoped to the isolated prototype because the previously listed lifecycle, operational and deployed-resource limitations remain.
