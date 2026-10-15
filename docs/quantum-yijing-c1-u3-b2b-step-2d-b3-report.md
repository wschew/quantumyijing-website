# Quantum YiJing C1 - Step 2D-B3

Cloudflare Free feasibility and integration readiness assessment

Date: 2026-10-15 (Asia/Kuala_Lumpur)

**Recommendation 3: Deployment feasibility validation required before integration.** The prototype is a useful, locally validated candidate, not a demonstrated Cloudflare Free administrator authentication solution. Additional isolated local hardening and owner policy decisions are prerequisites to that validation. Neither active C1 integration nor deployment is authorized by this report.

## Verified checkpoint, scope and evidence

Branch: `c1-bazi-consultation-development`. Complete HEAD: `a06fca856215c6c6427846896f44d2e9a0573493`. Initial `git status --porcelain` was empty. The files-only verifier returned `ok:true`, 15 migrations, zero remote operations, checking canonical hashes, order, inventory, prerequisites and compatibility sources. No applicable AGENTS.md was found in the workspace inventory.

This task adds only this assessment document. No source, database, configuration, previous evidence or pinned migration changes; no tests that create runtime databases or browser instances were run. Existing saved evidence was inspected and selected totals were recomputed. No staging, commits, pushes, merges, tags, provisioning, deployment, account access, real credentials, provider integration or control of port 8789 occurred. Public Cloudflare documentation was read for current plan facts; this is distinct from an operational Cloudflare account/API action.

Exact evidence references used below:

| ID | Evidence and what it supports |
|---|---|
| E1 | `docs/quantum-yijing-c1-step2db2b-measurements.json`: reconciled browser result, request/ceremony summaries, management raw samples, D1 summaries and acceptance accounting |
| E2 | `.local-c1-package-step2db2b-rarnbZ/result.json`: 21 browser checks, no setupError, no failures, 54 paired request samples, 19 ceremonies; independently matched to E1 and verified SHA-256 `cb8786147089770c52eff8f5eedb0dfd53a556c3869d0d9c5a57440c38c351a2` |
| E3 | `.local-c1-package-step2db2b-regression/management-final-v3.json` and `.log`: 17 checks, 131 samples, admission/restart/revocation/cleanup tests; JSON matched to E1 |
| E4 | `.local-c1-package-step2db2b-regression/d1.json` and `.log`: 65 persistent-D1 checks; post-verification replay/counter barriers, expiry, revocation, epoch and rollback tests |
| E5 | `.local-c1-package-step2db2b-regression/node.log` and `workerd.log`: 247 checks each, with distinct runtime execution modes |
| E6 | `.local-c1-package-step2db2b-acceptance/summary.json`, `.local-c1-package-step2db2b-regression/repro.log`, `.local-c1-package-step2db2b-reconciliation/{extended,migrations,guards}.log`: saved 982 distinct C1 checks, including 6 reproducibility checks; E1 records the reconciliation |
| E7 | `scripts/webauthn-d1-worker.mjs`, `webauthn-d1-schema.sql`, `webauthn-synthetic-validation.mjs`: current implementation, schema, strict profile and transaction conditions |
| E8 | `scripts/test-webauthn-d1-management.mjs`, `test-webauthn-d1.mjs`, `test-webauthn-browser.mjs`: test instrumentation, admission bypass/frozen-window distinctions and browser configuration |
| E9 | `functions/lib/consultation/auth.js`, `auth-crypto.js`, `auth-foundation.md`: current C1 password/session/CSRF and offline authority boundary |
| E10 | `functions/lib/consultation/workflow-guards.js`, `customer-contact.js`, `workflow-handler.js`, `preview-composition.js`, `preview-adapter.js`; `consultation-pages/worker.js`: embedded business authorization, routing and deployment/schema contracts |
| E11 | `database/migrate-c1-consultation-auth.sql`, `database/c1-migration-manifest.json`: constrained account/session/audit schema and immutable pinned baseline |
| E12 | `consultation-pages/U3-B2B-STEP2C-FEASIBILITY.md`, `U3-B2B-STEP2B-RESULTS.md`: earlier proposed boundary and password cost investigation; proposals there are not assumed implemented |

E2 is an owner execution in normal PowerShell, not an in-Codex browser run. Its saved JSON proves successful assertions, not a process exit field; exit 0 is separately owner-reported. E1 preserves the earlier Chrome sandbox failure under `browserSandboxFailure`. Nothing here erases it or converts a setup failure into a ceremony pass.

Saved suite results remain separate: browser 21, management 17, persistent D1 65, Node validator 247, workerd-validator/Node-state 247. Their semantic coverage overlaps; there is no combined unique-security-test total. C1 acceptance is 828 base + 18 distinct extended + 111 ledger + 19 guards + 6 reproducibility = 982. Do not add all 83 extended executions or count the 6 twice. The 15 migration pins count files, not additional acceptance cases. Historical owner-verified standalone authentication 50/50 remains external evidence; no new successful Codex standalone-authentication run is claimed.

## Decision vocabulary and requirement matrix

PASS means the stated, bounded requirement has verified supporting evidence. It never upgrades local evidence to deployed/physical evidence. CONDITIONAL means the design is plausible but needs implementation, an owner decision or further tests. BLOCKED means the required property cannot currently be demonstrated; no conclusion is drawn that it is impossible.

| Requirement | Classification | Evidence / remaining gate |
|---|---|---|
| Correct checkpoint, clean entry, pinned migrations | PASS | Exact HEAD above; verifier rerun |
| Local ES256, exact RP/origin/client binding, UP/UV and restricted parsing | PASS | E2, E4, E5, E7; supported synthetic profile only |
| Local challenge single use, counter CAS, atomic session creation | PASS | E4: 25 four-contender rounds per replay/counter scenario, one winner per round |
| Local verification-to-write expiry/revocation/epoch protection and SQL rollback | PASS | E3/E4; failed authentication state does not partially commit |
| Local revoke-all restart and credential-revocation race behavior | PASS | E2/E3; real credential-revoke dispatcher beats held verified authentication |
| Current isolated paths have modest application query counts | PASS | E1/E3: 5 begin, 8 finish attempts with admission, below documented 50-query limit; not an integrated-route certification |
| Registration deployed Free CPU | BLOCKED | No workerd per-request CPU or deployed CPU sample |
| Authentication deployed Free CPU | BLOCKED | Node CPU, browser/host wall and D1 duration cannot establish it |
| Integrated C1 CPU, queries, reads and writes | BLOCKED | No passkey/C1 session bridge exists or has been profiled |
| Free daily request/write/read and storage sustainability | CONDITIONAL | Local counters useful; no approved traffic model, remaining account allowance or deployed billing evidence |
| Bounded cleanup and constant-size epoch revocation mechanism | PASS | E3/E7: local row bounds and growth tests, fixed-plan revocation |
| Operational cleanup cadence and long-term retention | CONDITIONAL | No scheduler/runbook capacity proof; audit holds and old key generations accumulate |
| Admission caps, shared-account scope and backward-window rejection | PASS | E2/E3/E7; all five scopes, future-window preservation |
| Availability under attack and safe emergency revocation | BLOCKED | Shared buckets permit lockout and consume Free resources even when rejecting |
| Chrome virtual-authenticator interoperability | PASS | E2, Chrome 155.0.8059.40 / CDP 1.3; localhost only |
| Two independently controlled physical authenticators | BLOCKED | Two mathematical/virtual keys do not establish independent devices, custody or hardware provenance |
| Physical/platform/multiple-browser and final HTTPS RP compatibility | BLOCKED | No physical/platform, Firefox/WebKit or chosen production-style RP evidence |
| Absence of public bootstrap/recovery endpoints | PASS | E7/E8 dispatcher inspection and pristine-route tests |
| Secure real initial bootstrap and handoff | CONDITIONAL | Offline authority, expiring grants, exact-RP enrollment UI and custody process not implemented |
| Fresh UV for key enrollment/revocation | CONDITIONAL | Current prototype accepts a live bearer session; no operation-bound fresh-UV grant |
| Proof of possession of each newly registered key before activation | CONDITIONAL | Current registration/none profile and distinct-key checks alone do not implement an activation assertion workflow |
| Secure public cookie/CSRF/pre-auth-browser-bound transport | CONDITIONAL | C1 has cookie/CSRF controls; prototype body-token flow does not implement the bridge |
| Enablement, session provenance and all business SQL guards aligned | BLOCKED | Prototype and C1 authorization schemas/generations differ; changing login alone is insufficient |
| Recovery, backup restore and emergency custody rehearsal | CONDITIONAL | Local reset mechanism tested; operational authority, restore rollback defense and drills absent |
| Immutable, retained, attributable administrator audit | CONDITIONAL | Local event transaction safety tested; C1 audit immutability/retention and attribution differ |
| Production readiness | BLOCKED | Resource, operational, transport and integration gates above remain open |

## Cloudflare Free resource assessment

### Published constraints versus measurements

Checked public documentation on 2026-10-15. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) specify Free 10 ms CPU per HTTP invocation, 100,000 requests/day per account, 128 MB isolate memory and 50 subrequests per invocation. Database/network waiting is distinct from Worker CPU. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) specify Free 50 queries per invocation, 10 databases, 500 MB per database and 5 GB account storage. D1 processes a database's queries serially; local concurrent dispatch does not prove global throughput. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) includes 5 million rows read/day and 100,000 written/day; index maintenance can affect billed writes. These are plan constraints, not observed remaining allowances in the owner's account.

[D1 batch documentation](https://developers.cloudflare.com/d1/worker-api/d1-database/) supports the transaction/rollback model. It does not supply exact internal execution/retry accounting for these local samples. Do not treat one batch call as one submitted SQL statement.

### CPU evidence

Registration processes bounded client JSON, CBOR/COSE/none attestation, RP hashing and P-256 key import/point validation. Authentication adds stored-key import, strict DER conversion and ES256 verification over authenticator data plus the original client-data hash. Both paths also hash capabilities, serialize JSON, handle D1 results and create random state. None attestation avoids a certificate-chain workload; it does not prove device provenance. The path avoids routine PBKDF2, but no arithmetic from these operations establishes a CPU ceiling.

E3 admission-enabled begin wall p50/p95/max is 8.3098/12.3993/12.3993 ms; finish is 10.4947/13.7612/13.7612 ms, ten samples each. Matched two-request pairs, recomputed from E3 raw arrays, sum to 18.9118/26.1605/26.1605 ms, excluding fixture signing and user interaction. These are local host wall durations, not CPU. Small sample p95 may equal maximum.

E2's two initial registration pairs show adapter begin/finish wall times 56.0646/99.3574 ms and 20.8911/72.9935 ms. Browser fetch timing additionally includes loopback transport; navigator timing includes CDP round trips. These two cold virtual-key enrollments are not a representative registration benchmark. The first five E2 request samples, excluding the replay at index 2, identify these pairs against the test source.

Node driver CPU is Windows-quantized and excludes workerd/Chrome. Local D1 duration is database elapsed time. Browser timing is not browser CPU. There is no available per-request workerd or deployed Cloudflare CPU distribution, cold or warm. No subtraction of guessed I/O, substitution of driver CPU or summation of unrelated phase percentiles can fill this gap. Hence both registration and authentication Free CPU requirements are BLOCKED for qualification, not measured failures.

E12 reported isolated PBKDF2 Node CPU 141/172/172 ms at 600,000 iterations, and packaged password login 156/172/234 ms. Those numbers are not deployed CPU either; they explain why retaining routine online PBKDF2 in parallel would preserve an unresolved cost path. Never reduce its work factor. A future passkey-only cutover requires explicit authorization and no public password/shared-token fallback; none occurs now.

### D1 operation budget

The following is returned LOCAL metadata or explicitly labeled source analysis. Counts are application submission attempts, not exact backend execution, implicit transaction statements, trigger instructions or internal retries. Failure metadata covers only operations that returned results. Admission commits independently; a rejected ceremony may legitimately write a rate bucket without partially creating authentication state.

| Operation / evidence | Local observations | Interpretation |
|---|---|---|
| Admission-enabled login begin, E3 N=10 | 5 attempts; 7 reads; 6/7/7 writes p50/p95/max | Includes account lookup, challenge transaction and admission |
| Admission-enabled login finish, E3 N=10 | 8 attempts; 16 reads; 8/9/9 writes | Includes UV/signature verification, CAS, session creation and admission |
| Matched complete login pairs, derived from E3 | 13 attempts; 23 reads; 14/16/16 writes | Two invocations, not a per-invocation query count; not a new measurement run |
| Initial browser registration, E2 two pairs | Each 5+8 attempts; reads 16 then 20; writes 16 then 15 | Bootstrap state and rate-window effects; only two observations |
| Session validation, E3 N=10 | 2 attempts; 7 reads; 1/2/2 writes | Current prototype rate-limits this nominal read, causing writes |
| Logout, E3 N=10 | 5 attempts; 9 reads; 6/7/7 writes | Session mutation plus event and admission |
| Revoke-all, E3 at 10,023 seeded session rows | 5 attempts; 8 reads; 7 writes | One growth-stage sample; epoch update, not historical-row sweep |
| Credential revocation, E2 N=1 | 6 attempts; 13 reads; 8 writes | Control admission, credential/epoch update and event |
| Cleanup, E3 large stage N=10 | 4 attempts; 806 reads; 200 writes per call | Workload had expired sessions/challenges; not the maximum for all eligible audit rows/indexes |
| Offline reset growth, E3 N=1 | 4 attempts; 2 reads; 5 writes | Test-only offline method and audit; no public reset route |
| Exhausted admission bucket, E3 five scopes | 1 attempt, 2 reads, 0 writes each observed | Still consumes an invocation/database lookup; not free to reject |

The 65-check wrapper's registration/login measurements bypass admission. Its older 11-attempt, 10-write pair must not replace E3's current admission-enabled costs. The browser's successful /finish summary mixes two registrations and seven assertions; it cannot be advertised as nine authentication-only samples.

Integration adds C1 contract/schema validation, cookie/CSRF/provenance and business authorization/audit work. Existing routes have their own statement budgets. The isolated 5/8 figures do not prove a complete packaged request stays within 50 queries or the CPU budget. Measure each proposed whole route, including repeated service construction, before making that claim.

### Estimates, exhaustion and storage

**Planning estimates only, assuming local writes mapped to deployed accounting and no other traffic:** 100 complete logins/day at the observed 14-16 writes consume roughly 1,400-1,600 writes before validation, logout, enrollment, cleanup or business work. The same model reaches the entire 100,000-write daily allowance at roughly 6,250-7,143 logins/day. This is not supported capacity, a traffic forecast or a reservation of account allowance. Tighter session lifetime also increases login frequency.

At 6-7 local writes per admitted anonymous /begin, approximately 14,286-16,667 requests could consume that allowance. The existing 60-per-minute get cap can admit that volume in roughly four to five hours of sustained abuse, before the account's Worker request cap. Bucket rejections still spend queries and requests. Repeated session checks at 1-2 local writes each can also dominate a small administrator's login cost. Upstream admission design and a conservative shared-account budget are therefore required, not optional optimizations after deployment. Do not assume any paid edge protection, Access feature or distributed rate-limiter entitlement is available on Free without checking the chosen mechanism separately.

Prototype scopes are fixed: get 60/minute, create 20, finish 120, control 30, session 120. Fixed cardinality avoids attacker-created bucket keys. An attacker can still exhaust a shared bucket using invalid input: control covers logout and credential/revoke-all operations, and session covers valid-session checks too. This can delay legitimate security response. A future policy must separate authenticated emergency controls from anonymous pressure without a public bypass or unlock endpoint. Source/IP controls must use trusted server metadata, bounded state and a tested Free-compatible enforcement design. Per-isolate counters alone cannot establish fleet-wide limits.

The backward-window fix rejects lower minutes and preserves the stored count; it does not provide a monotonic trusted clock. Availability waits until time catches up. Fixed-window boundaries permit two allowances in a short interval straddling a minute; consider combined burst and longer-window budgets. Forward clock jumps reopen rate windows, accelerate expiry/cleanup and can reduce availability. A later backward correction can extend apparent remaining expiry when no monotonic history is recorded; exact rollback tolerance is not demonstrated by rate-bucket tests. Clock anomalies and storage restores need a fail-closed runbook, not an unauthenticated reset.

E3 +100/+1,000/+10,000-row stages reported allocation 81,920/253,952/1,806,336 bytes. Ten cleanup calls left sessions/challenges 22/36, 23/37 and 9,024/9,038. Seeded expired rows are not representative newly generated live credentials/audits, so extrapolating a bytes-per-login or time-to-500-MB value would be unsupported. Deleted rows need not shrink allocated database pages.

Cleanup uses four bounded statements: at most 100 candidates each for expired challenge, session and unheld security_event, and a bounded old-rate-bucket deletion (normally only five scopes exist). Grace is one day after challenge expiry, seven days after session expiry and 90 days for unheld audit events. Holds, retained credential generations, index work and live-row arrival can defeat steady-state cleanup capacity. A fully saturated eligible workload can cost more than the observed 200 returned writes. Define custody/retention rules, monitor backlog/oldest eligible row, reserve read/write headroom and prove bounded progress; no scheduler exists today.

Failure modes include CPU/memory limits, quota exhaustion, queue overload and lost responses after commit. Local guard failures and injected SQL errors are tested; real account quotas, distributed queues and ambiguous commits are not. Fail closed with generic errors; never retry session issuance blindly after an unknown commit or relax UV/counter/CSRF/expiry guards. Limit bodies (current 20,000 bytes), parser work, outstanding challenges, credential cardinality, response sizes, processing deadlines and concurrent requests. Current payload bounds do not establish slow-stream timeouts or full isolate memory behavior under load.

## Proposed future authentication integration boundary

This is a design contract only. Do not copy the test dispatcher or generic prototype tables into C1, and do not mount its body-token API on active routes.

| Boundary | Proposed contract | Current conflict / required validation |
|---|---|---|
| Administrator identity | Server-owned QY account ID 1, enabled state and consultation-only scope; no client role, CRM identity, coach/affiliate credential or ADMIN_TOKEN authority | Prototype singleton has no C1 enabled flag or scope; never equate its user handle with customer identity |
| RP/origin | Owner-approved stable HTTPS hostname; exact configured RP ID/origin, no wildcards/parent pages.dev/Host-derived configuration | Localhost and synthetic.invalid evidence does not verify the final RP, redirects, DNS or TLS control |
| Login start | Bounded same-origin POST JSON; short-lived random host-only pre-auth cookie; challenge bound to its hash, account, purpose, RP/origin, policy and epoch | Prototype challenge is not browser-cookie bound; older E12 stateless-ticket idea is a proposal, not implemented behavior |
| Login finish | Strict verifier, UP/UV and account/key checks; batch guard, consume challenge, CAS counter, issue session/provenance/audit atomically; cookie only after commit | Preserve local guarded-batch semantics; add browser binding and provenance in same transaction |
| Two authenticators | Two independently controlled UV-capable devices; owner confirms physical custody and fresh proof-of-possession assertion from each before activation | Two distinct virtual/public keys cannot prove this. None attestation offers no hardware provenance |
| Session transport | Preserve __Host-QY_CONSULTATION: Secure, HttpOnly, SameSite=Strict, Path=/, no Domain; separate random CSRF secret; no bearer token in JSON/storage | C1 expects 64-hex token/hash format; prototype returns 43-character base64url bearer strings and stores no CSRF or session ID provenance |
| Session policy | Proposed initial absolute limit five minutes, within C1's eight-hour hard maximum; require fresh UV for sensitive operations; no rolling extension unless separately reviewed/budgeted | This is an owner decision, not an existing C1 policy. Short sessions increase traffic. Do not silently stretch prototype lifetime to eight hours |
| Every protected operation | Fresh server-side guard checks enabled account, legacy password_version, auth/key epochs, method=WebAuthn, credential active/current, expiry, session identity and scope | All embedded mutation SQL must make these checks within the business transaction, not only after a JavaScript precheck |
| Key management | Live passkey session + CSRF + fresh UV, operation-bound single-use grant; reauthorize completion; assert possession of a new key before activation; small approved active-key cap | Existing prototype permits enrollment with a live bearer session alone. Cookie theft/XSS must not silently establish a permanent credential |
| Revocation | Guard actor at commit; revoke credential and advance security epoch with audit; invalidate all applicable sessions/in-flight challenges; prove both orderings | Do not revive sessions by merely updating an application cache or remove the two-key gate to repair loss |
| Recovery/emergency | Offline independently authorized maintenance only; exact account/version CAS, rotate generation/grants, revoke old authority, audited enrollment-only repair | No public bootstrap/recovery/unlock/password fallback endpoint; losing one of two keys can currently close the login gate and require offline repair |
| Audit | Transactional immutable event and immutable session provenance: method, credential reference, UV/authentication time, epochs, event/policy version | Public-key/user-handle/biometric/private-key/token/CSRF material must not leak into audit; shared account/device attribution is not human nonrepudiation |
| Customer boundary | Customer portal/context cookies, canonical ownership, OTP step-up and customer consent/business rules remain separate | Admin passkeys do not replace customer OTP or grant portal identity; frozen Academy auth is not a source of admin rights |

### Database and authorization conflicts requiring an explicit migration design

E9 currently creates dedicated C1 sessions with account enablement, password_version, eight-hour maximum and CSRF checks. E10 workflow-guards and customer-contact independently embed joins to consultation_auth_sessions/account in their business SQL. The workflow handler has a password-only qy/login path. Updating createConsultationAuth.login or requirePrivateAccess alone would leave generation/revocation gaps and could preserve an online password bypass/cost path.

Prefer, after separate approval, namespaced passkey state/challenge/credential/provenance tables within the same dedicated C1 database as protected business mutations. Reuse the C1 cookie/CSRF format rather than sharing the test cookie-free API. Retain password_version as a legacy revocation generation while adding an explicit passkey auth_epoch/key_epoch and authentication method/provenance; do not change password hashing. Disabled accounts stay disabled. Legacy password-created sessions must not become WebAuthn sessions through an unverified label or copied principal. A cutover needs explicit policy/version invalidation and tests for mixed old/new sessions.

A separate authentication D1 binding is useful for isolated feasibility testing, but does not let the existing single-binding business SQL atomically join fresh revocation state. No cross-binding transaction is supplied by the current batch design. Do not solve this with cached principal assertions. If a separate deployed auth database remains mandatory, stop and design/test a different consistency contract before integration; this report does not approve one.

Authorization reads and transaction guards must use a demonstrated primary-consistent freshness contract. Do not introduce a read replica or cross-request authorization cache that can accept revoked sessions while business reads expose data. Any D1 session/read-replication configuration needs explicit revocation and read-after-write tests; local persistence/restart evidence does not certify that deployment setting.

E11's account requires PBKDF2 fields and exact iterations. Session token/CSRF constraints, immutable identity/expiry/revocation triggers and audit foreign keys/vocabulary differ from the prototype. C1 audit rows cannot be updated/deleted; its fixed event enum has no passkey enrollment/recovery vocabulary. The prototype cleanup deletes eligible security_event/session rows and cannot be transplanted over immutable audit or session references. Use an approved append-only event/provenance design with explicit retention/export rules; do not remove immutable audit triggers to make cleanup work.

Preview composition demands exactly 15 pinned migration ledger entries, their hashes/object inventory and expected account/config contracts. The Pages entry and Preview adapter also reject unknown bindings/settings. Therefore adding a binding/table/ledger entry without changing the reviewed contract can fail closed. Any future additive migration/manifest version must be separately specified and validated with upgrades, rollback and disabled-state tests. Never edit the 15 historical migrations or bypass live schema checks. This task introduces no migration or runtime contract change.

The existing C1 CSP/frame denial is useful, but WebAuthn is scoped to RP/origin, not /qy. Customer/admin pages on one origin share XSS exposure. A separate admin origin would require separate RP enrollment, cookie/CSRF and deployment-contract decisions; it is not an assumed protection or provisioned hostname. Request Origin/Sec-Fetch-Site and session-bound CSRF are needed in addition to verifying the signed clientData origin. Preserve no-store, no CORS and generic sanitized error behavior.

## Security and operational readiness conditions

1. **Initial owner authority.** No first-visitor setup or publicly redeemable bootstrap authority. An offline owner command should authorize an expiring, account/RP/purpose-bound two-key enrollment process, with no business-session authority until both keys are asserted and custody approved. The trusted enrollment UI must operate at the chosen RP origin; localhost credentials cannot simply be transplanted to that RP. A secure maintenance-only UI/offline verification and installation channel is still a design gate, not a public /bootstrap endpoint. Current bootstrap_hash has no independent expiry field; 60-second challenges do not expire the underlying grant. Real grant expiry, rotation, one-time use and protected handoff need implementation/review.
2. **Key custody and takeover.** Prefer an everyday device and an independently held reserve, with separate storage and protected UV/PIN knowledge. Two credentials on one device do not satisfy independence. Backups of public credential rows do not restore a lost hardware private key. Device-bound versus synced-key recovery trust, backup flags, counter-zero/rollback handling and supported browser/device models need owner approval. Never quietly relax the current conservative policy to make a device pass.
3. **Loss and emergency access.** A single-key revocation can invalidate all sessions and leave fewer than two active keys; remaining ordinary session authority is then unusable. Test a repair/reset runbook without an online password or shared ADMIN_TOKEN bypass. Require independently established operator authority and a scoped enrollment-only process, not restored business access with one key. Revoke lost/stolen keys, rotate security generations and require possession proofs before reopening. Owner maintenance must remain possible during online rate/quota failure without creating an unauthenticated HTTP escape hatch.
4. **Backup restore.** Store encrypted, access-controlled backups and event exports separately from authenticators/grants; use no real backup or credential in this phase. D1 documents a seven-day Free Time Travel window in [its limits](https://developers.cloudflare.com/d1/platform/limits/), but availability is not an authorization/restore safety design. Restoring old database state can restore revoked credentials, counters, sessions, grants and rate buckets; epochs restored in the same database are not independently monotonic. Keep access disabled during restore, reconcile revocations against trusted external custody/audit records, rotate generations/expired grants and verify both keys before reopening. Rehearse this offline. Never restore a business database just to recover a password/key.
5. **Audit and retention.** Specify owner-visible events for login, denied/replay/counter review, key enrollment/revocation, grant issuance/closure, reset, clock anomaly, cleanup and restore. Bound denied-attempt evidence rather than append attacker-controlled rows for every probe. Exclude secrets and unnecessary personal data. Define immutable-event retention, holds, encrypted export verification, access separation and monitored deletion capacity before exposure. No legal-retention compliance claim is made by the prototype's 1/7/90-day defaults.
6. **Coverage and review.** Add real final-RP browser checks, registration negatives, authentic browser rejection of invalid RP options, malformed/slow transport, fresh-UV management, stolen-session scenarios, restore rollback and independent-runtime tests. Origin/RP/UP mutations in E2 can also invalidate the signature; they are server rejection observations, not isolated proof of each cause. The custom validator is a strict synthetic profile requiring independent security/interoperability review before a production decision. No browser test proves hardware attestation, biometric custody or deployed CPU.

## Proposed next-step sequence and gates

1. Owner reviews this assessment and selects RP/origin, two-device/custody policy, session lifetime, key-loss repair, offline bootstrap/restore authority and a traffic/budget envelope. No real enrollment or provider operation follows automatically.
2. In a separately authorized isolated local hardening step, implement/test the approved browser-bound transport, expiring bootstrap grants, fresh-UV/operation grants, new-key activation assertions, bounded abuse/clock handling and recovery/restore rehearsals. Keep active C1 routes and pinned migrations unchanged. These are prerequisites, not proof of Free feasibility.
3. Prepare a concrete, reviewable synthetic-only Free validation proposal: disposable isolated Worker/D1, exact final-shaped verifier/transport, no C1 routes/business records, fixed caps on requests/rows and costs, secrets/log handling and cleanup. Obtain explicit authorization for any remote deployment/provisioning; none is granted or performed here.
4. If separately authorized, measure actual per-invocation Worker CPU p50/p95/max for registration/assertion/management/invalid inputs, cold/warm and concurrency conditions. Observe CPU-limit/error outcomes, returned D1 accounting, request budgets and realistic cleanup/audit growth on Free. A target budget must reserve headroom for the intended C1 wrapper; a standalone sub-10-ms result alone does not qualify an integrated route. Verify account-wide allowances and stop before uncontrolled exhaustion. A paid upgrade is not a resolution under the mandatory plan.
5. Only after successful feasibility evidence and local security/operational gates, propose isolated integration development: explicit schema/manifest evolution, unified fresh SQL authorization contract, cookie/CSRF/provenance bridge, no public password/bootstrap/recovery fallback, and atomic upgrade/cutover tests. Reprofile the whole packaged route, then obtain a separate activation decision. Failed feasibility means optimize/reassess within Free or report BLOCKED; do not lower security controls.

**Final decision:** local cryptographic/transaction evidence supports continued isolated investigation. Required Free CPU, abuse availability and complete integration authorization cannot currently be demonstrated. Recommendation 3 is the controlling next gate; it is not permission to deploy or wire C1. Stop for owner review.
