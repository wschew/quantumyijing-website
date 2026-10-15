# Quantum YiJing C1 ? Step 2D-B2A

Local synthetic development only. Stopped for owner review; no production integration or deployment approval is implied.

## Checkpoint and scope

Started on branch c1-bazi-consultation-development at the verified complete HEAD **ce19004fa091c53ae19859610ee8bfe108e50e78**. The initial working tree was clean. The files-only migration verifier passed all 15 pinned migrations, prerequisite and compatibility checks before edits. No migration, migration manifest, active C1 runtime authentication route or frozen Academy Production module was changed. No existing server was restarted. No remote Cloudflare operation, external provider request, real credential or Git staging/commit/push/merge/tag occurred.

Changed files:

- scripts/webauthn-d1-worker.mjs: epoch-only revoke-all, credential revocation, offline reset and cleanup methods, atomic D1 admission and generic public errors without SQL metrics.
- scripts/webauthn-d1-schema.sql: disposable prototype schema only; credential generation, indexed expiry, security events and five fixed rate buckets. Existing disposable B1 databases need recreation; no automatic upgrade or pinned migration is supplied.
- scripts/test-webauthn-d1.mjs: retains the existing 65-check regression suite, adapts offline reset to credential generations, includes events in rollback snapshots, and explicitly bypasses admission in this high-volume regression wrapper. Its measurements do not represent the rate-limited HTTP implementation.
- scripts/test-webauthn-d1-management.mjs: new actual local workerd/D1 tests, test-only barriers, fixed admission-window clock, maintenance wrappers, pristine-dispatch checks and growth measurements with admission enabled.
- docs/quantum-yijing-c1-step2db2a-measurements.json: 120 raw new samples, summaries, versions, populations and database-size metadata.
- This report.

## Revocation and atomicity

B1 already compared session/challenge epoch to account.epoch at use and at the guarded atomic authentication batch, but bulk-marked all historical sessions and challenges during revoke-all/reset. B2A removes those mass updates. Revoke-all authenticates the calling session inside the same D1 batch that increments the account epoch and appends one security event. It uses four batch statements plus the separately committed admission statement. Historical rows are unchanged and immediately unusable after the epoch commit.

Authentication preflight and cryptographic validation can be stale; the final batch rechecks live challenge, epoch, credential generation/revocation, expected signature counter, expiry using database time, and any enrollment-authority session. A false guard raises a constraint error and rolls back the entire batch. D1 batch serialization gives two safe orderings: authentication first may issue a token, which revoke-all subsequently invalidates; revoke first makes the stale authentication batch fail. Revocation cannot retroactively cancel work already committed before it; subsequent session checks observe the changed epoch. No session-validation cache is introduced.

Eight concurrent revoke-all calls from the same epoch produce exactly one winner, one epoch increment and one event. The other calls fail the in-transaction session guard. The event and epoch either both commit or both roll back. Events record database time, resulting epoch and the hashed authorizing session as subject. Logout updates only its session and appends one event; pending enrollment authority then fails. Credential revocation changes one credential, advances the account epoch, and records its credential ID. This deliberately invalidates every session and pending challenge, including those from other credentials. If fewer than two current credentials remain, ordinary login remains disabled and trusted offline reset is needed.

Offline ownerReset advances both the session/challenge epoch and a separate credential key_epoch, rotates the bootstrap hash, reopens enrollment and writes one audit event. No retained credential/session/challenge population is updated. Current-key lookups and the two-key gate use key_epoch. Old IDs/public keys remain retained and cannot be enrolled again through the UNIQUE constraints. Two fresh distinct keys remain necessary. The four-statement reset includes guard/event/guard removal; its size is independent of history. This method requires a trusted direct database capability; it is never reachable through the shipped HTTP dispatcher. Test-only reset/cleanup routes are injected into an in-memory module by the harness and verified absent from pristine source.

## Explicit authentication-security retention assumptions

These are new synthetic policy assumptions for owner review, independent of C1 business-record retention. They are not approved legal, operational or production retention requirements.

| Record | Validity and retention | Cleanup eligibility |
|---|---|---|
| Challenge, used or unused | Existing 60-second validity; retain until 24 hours after natural expiry | expires strictly older than database now minus one day |
| Session, logged out, revoked by epoch, or expired | Existing five-minute validity; retain until seven days after natural expiry | expires strictly older than database now minus seven days |
| Security event | Minimum 90 days from event time | older than 90 days AND hold=0 |
| Held security event | Retain indefinitely pending trusted investigation/release | never selected while held |
| Rate bucket | One mutable row per fixed scope; no request identities or raw IPs stored | inactive more than 1,440 minute windows |
| Credential/account generation | No automatic deletion in this change | retained for key-reuse prevention and owner review |

Required control-event history is retained for the full assumed 90-day period. An offline hold must be applied before expiry when an investigation requires longer retention. Hold authorization/release and external audit export are owner operational responsibilities, not public endpoints. Auth success evidence also resides in short-lived session/challenge history; this does not claim a complete indefinite per-attempt security log. Events are appended by control operations; trusted direct database access can alter records. No tamper-proof external archive is claimed.

cleanup submits exactly four deletes in one D1 batch, with at most 100 selected rows per table and no synchronous drain loop or persistent cursor. Fixed rate scopes limit normal rate-table cardinality to five. Composite expiry/hash indexes avoid scanning an entire equal-expiry group; the event index starts with hold,at. Indexed writes and index storage are part of the trade-off. Using natural expiry plus grace, rather than only epoch or terminal flags, conservatively preserves all currently active sessions/challenges and unexpired replay markers. Database time controls cutoff calculations. Epoch invalidation does not wait for cleanup.

Repeated calls safely make bounded progress and become no-ops when eligible records are exhausted. Concurrent calls serialize their batches. An injected failure in the third delete rolls back earlier challenge/session deletes; reopening the runtime after completed batches resumes remaining work without cursor repair. This is deterministic interrupted-transaction simulation and restart-after-partial-progress evidence, not an OS process-kill or storage-corruption test. No VACUUM, scheduler, production cron or automatic retention runner is added. An operator must invoke small offline batches at a cadence sufficient for arrival rate; database file allocation need not shrink when rows are deleted.

## Admission, abuse and availability

Admission runs before account lookup/cryptographic verification and commits independently of the eventual authentication transaction. A single conditional INSERT ... ON CONFLICT DO UPDATE ... RETURNING statement atomically admits and increments only below the limit, or resets a previous window. Failed credentials, signatures, authority checks and control operations consume allowance. An admitted request that later rolls back does not recover allowance. A database failure fails closed. No in-memory counter, read-then-write race, attacker-chosen bucket key or public recovery endpoint is introduced.

| Fixed account-wide scope | Attempts per database-clock minute |
|---|---:|
| Login challenge creation | 60 |
| Enrollment challenge creation | 20 |
| Ceremony completion | 120 |
| Logout/revoke-all/credential revocation combined | 30 |
| Session validation | 120 |

The scope is derived from the route and ceremony kind, never an account identifier. The single synthetic owner API has no account-search input. Invalid authority, nonexistent credentials, invalid sessions, rate denials and database errors return the same HTTP 400 and result:null. SQL statistics were removed from public responses because statement counts can reveal which security preflight failed. Success and route-not-found responses remain distinguishable as necessary for the API. No constant-time or network timing-indistinguishability claim is made. The 20,000-byte streaming body bound still precedes JSON/admission; malformed JSON has no D1 write. Existing parser and signature checks remain intact.

These deliberately conservative local limits bound admitted database/crypto work and outstanding challenges but permit shared-account denial of service. An attacker can exhaust an owner's allowance, including logout/control allowance. There is no trusted source-IP policy or edge admission layer in this local prototype. Fixed windows allow a burst of up to twice the allowance across an adjacent-window boundary. Rate-denied requests still submit a database statement and can exhaust read/query/Worker resources under sustained flooding. Invalid bodies still cost bounded parsing work. This does not establish Internet-facing abuse resistance or protect upstream bandwidth.

At full sustained admission, get/create scopes permit 115,200 challenges/day before natural-expiry cleanup; cleanup outages accumulate backlog. Finish/session/control caps are also far above a suitable small-owner daily Free write budget if continuously consumed. Rate limiting is not a daily billing cap. Held events and retained credentials can grow indefinitely by policy. No paid-only service or public owner recovery flow was added. Offline reset/cleanup are outside HTTP admission because their caller already possesses the database capability.

## Security and regression evidence

| Suite | Final result |
|---|---:|
| New workerd/D1 management | 14 passed, 0 failed |
| Existing workerd/D1 WebAuthn/state regression | 65 passed, 0 failed |
| Node WebAuthn | 247 passed, 0 failed |
| workerd validation / Node state WebAuthn | 247 passed, 0 failed |
| Base C1 acceptance | 828 passed, 0 failed |
| Extended packaged Pages | 83 passed; 18 distinct additional checks |
| Migration/ledger | 111 passed, 0 failed |
| Security/deployment guards | 19 passed, 0 failed |
| Package reproducibility/tamper | 6 passed, 0 failed |
| Files-only migration pins | 15 verified |
| Standalone C1 auth diagnostic | 24 PASS lines, then existing EPERM; exit 1, not a pass |

Distinct C1 acceptance remains 982 = 828 + 18 + 111 + 19 + 6; do not add overlapping extended tests again. The standalone diagnostic reports status:null, signal:null, error.code:EPERM, errno:-4048 and empty stderr at its synthetic setup subprocess. No permissions, TLS or sandbox settings were weakened. Earlier independent owner-shell evidence remains historical and is not substituted for this run.

New tests force both authentication/revocation orderings at the final batch boundary, synchronize eight competing revocations, suspend verified authentication while cleanup executes, and contend 24 challenge requests for exactly five remaining slots. All five admission scopes are tested at exhaustion and rollover, including failed-attempt accounting. Tests cover credential revocation, expiry/logout/pending authority, offline reset/re-enrollment, audit failure rollback, admission SQL failure, cleanup rollback/holds/grace/idempotency/concurrency/reopen, and large equal-expiry retained populations. Snapshots verify revoke-all never changes retained session revoked flags or challenge used flags. Existing tests retain 25-round replay/counter barriers, stale credential/expiry/epoch rechecks, SQL session-insert rollback and injected query/atomic failures.

This demonstrates serialization through the local D1 binding, not multiple independently deployed Workers, regional consistency, platform quotas, ambiguous committed responses, hidden retries or real infrastructure failures. Explicit retries remain separate requests; the application does not automatically retry. A lost response after authentication may leave a committed session that cannot be recovered by replaying the consumed assertion.

## Measurements and database growth

Final management evidence: C:/Users/WIN10/Desktop/qy-c1-bazi-consultation-development/.local-c1-package-step2db2a-BViYJC / results.json, identical to the checked-in-target JSON in docs. Node v24.20.0; Miniflare 5.20261006.1-alpha; workerd 1.20261006.1. There are 120 raw samples. Nearest-rank percentiles retain warmup. Single-sample rows are observations, not latency distributions.

| Operation | N | Wall ms p50 / p95 | Max submitted SQL | Max returned reads | Max returned writes | Max D1 elapsed ms | Max host driver CPU ms |
|---|---:|---|---:|---:|---:|---:|---:|
| limited login begin | 10 | 8.138 / 18.272 | 5 | 7 | 7 | 2 | 16 |
| limited login finish | 10 | 10.168 / 13.210 | 8 | 16 | 9 | 1 | 31 |
| limited session read | 10 | 5.678 / 7.444 | 2 | 7 | 2 | 1 | 16 |
| limited logout | 10 | 5.512 / 7.520 | 5 | 9 | 7 | 1 | 0 |
| growth revoke 100 | 1 | 5.659 / 5.659 | 5 | 8 | 7 | 0 | 0 |
| growth cleanup 100 | 10 | 4.532 / 5.300 | 4 | 806 | 200 | 1 | 16 |
| growth revoke 1000 | 1 | 6.238 / 6.238 | 5 | 8 | 7 | 0 | 0 |
| growth cleanup 1000 | 10 | 5.103 / 6.902 | 4 | 806 | 200 | 1 | 31 |
| growth revoke 10000 | 1 | 5.856 / 5.856 | 5 | 8 | 7 | 0 | 0 |
| growth cleanup 10000 | 10 | 4.598 / 5.879 | 4 | 806 | 200 | 1 | 0 |
| offline reset growth | 1 | 3.988 / 3.988 | 4 | 2 | 5 | 0 | 0 |

Setup, synthetic signing, inspection queries and fault installation are excluded from request timings. Driver wall includes local dispatch and response-body consumption. The management harness restores metrics and injects offline maintenance routes. Its admission minute is frozen solely in the in-memory module so deterministic contention cannot cross a real minute boundary; expiry/cleanup still use real database time. Rollover is forced by moving the stored bucket to the previous window. Final pristine-dispatch tests load the entirely unchanged Worker source, including its real database clock. Security barrier samples include test-control/wait overhead. Serial limited/growth samples reopen without that binding. The legacy 65-check suite disables admission in its wrapper; its separate 1,931-sample baseline must not be presented as the real limited HTTP path.

Submitted statements count application plans/attempts, not backend instruction execution or implicit BEGIN/COMMIT/ROLLBACK, trigger work, transport retries or hidden platform queries. Returned rows_read, rows_written and duration are actual local D1 metadata aggregates. Failed queries/batches mark metadataComplete=false; prior successful admission/preflight metadata remains, while failed-batch work is unavailable. Do not interpret zero returned rolled-back writes as zero attempted work. Snapshot queries independently verify rollback. Growth probes additionally preserve returned size_after and other metadata outside timed operations.

The three stages add 100/1,000/10,000 old rows per table, after the previous stage's ten bounded cleanups. Before the measured login, retained populations are 119/131, 1,020/1,032 and 10,021/10,033 sessions/challenges. Local size_after is 81,920, 253,952 and 1,806,336 bytes. These are synthetic rows and allocated local database size, not real credential payload sizing or deployed billing. Each revoke leaves the historical rows unchanged, with constant 5 submissions, 8 returned reads and 7 writes. Ten cleanups at the largest stage deliberately leave 9,022 sessions and 9,034 challenges: bounded work does not imply draining the backlog in one invocation. Populated session/challenge cleanup batches have 806 returned reads and 200 writes across the two tables at both larger sizes. With eligible event rows, a batch may also delete up to 100 events; the event-retention tests exercise that separately. The benchmark does not extrapolate measured latency beyond these populations.

A complete ordinary login now submits 13 plans (5 begin + 8 finish), compared with the prior un-limited 11. Typically its returned writes total 14, with up to 16 when both rate rows are first created in these samples. Index maintenance, admission, audit/control work and cleanup all count toward cost; session validation itself now writes its bucket. Provisioning, malicious failures, reset, shared usage and maintenance must be included in any workload budget. More indexes improve bounded reads but increase write/storage costs. Revoke-all fixes the earlier retained-row write amplification without making all auth workloads inexpensive.

hostDriverCpuMs is Node process user+system CPU, quantized on Windows; it excludes the workerd subprocess. Concurrent samples overlap and cannot be summed. D1 duration is elapsed database time, not Worker CPU. Available evidence is host driver CPU, request wall and local D1 metadata only. Workerd per-request CPU and deployed Cloudflare CPU remain unavailable. No comparison of local wall time or zero host CPU to a deployed CPU limit certifies Free compatibility.

## Cloudflare Free status and remaining review

**Free-compatible primitives; deployed Free performance/affordability unqualified.** This uses only the existing Worker/D1 prototype and no paid service. Per-operation application submissions remain small, and revocation is independent of history. Current remote limits/pricing were not re-fetched because this task forbids external calls. Prior checkpoint references are Workers limits, D1 limits and D1 pricing on developers.cloudflare.com; no claim that they were revalidated here. Real deployed CPU, quota outcomes, shared daily workload and deployed D1 billing remain unmeasured. No deployment is authorized or required by this result.

Before browser WebAuthn testing/integration, owner review must select/approve the synthetic HTTPS/RP/origin setup and browser/device matrix, cookie/session transport and CSRF design, rate/lockout policy and trusted-source admission if exposed, retention/hold/cleanup cadence and capacity budget, and the offline owner's authorization/custody/capability-handoff procedure. Browser behaviors including zero counters/synced passkeys need a deliberate policy: the existing strict positive-counter prototype is preserved. Real owner recovery, browser compatibility, independent-runtime behavior and ambiguous-commit handling are not solved by these local tests. Any deployed Free qualification needs separately authorized synthetic-only scope.

## Reproduction and final evidence

Use the already installed local tools; do not install or invoke Wrangler:

    $env:QY_MINIFLARE_PATH='C:/Users/WIN10/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/miniflare'
    $env:QY_ESBUILD_PATH='C:/Users/WIN10/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/esbuild'
    $env:QY_TEST_OPENSSL='C:/Program Files/Git/mingw64/bin/openssl.exe'
    node --require ./scripts/consultation-local-file-stdio.cjs scripts/test-webauthn-d1-management.mjs NEW-IGNORED-OUTPUT.json

The output uses exclusive creation and must be a new filename; each run creates a fresh disposable persistence root. Base acceptance is .local-c1-package-step2db2a-acceptance/summary.json. Supplemental logs/status are under .local-c1-package-step2db2a-regression/. management-final-v4.log and management-final-status-v4.json identify the final management run; d1-v2.log and d1-baseline.json identify the passing existing D1 regression run. The original supplemental summary preserves unsuccessful earlier management attempts instead of rewriting their status; the final management status is separately explicit. Earlier harness fixture/wrapper/reset-adaptation errors and their corrections remain in earlier logs and are excluded from final measurement summaries. The final run had no concurrent regression/profiling workload. Temporary databases, generated packages and ignored local logs must remain out of a future commit.

Stop for owner review. No further integration or Git mutation is performed.

Final review: HEAD and branch remain unchanged. All 15 migration pins reverify; JavaScript syntax and whitespace checks pass. The final worktree contains exactly the six intended changed/new files above, all unstaged. Frozen runtime/Academy sources and pinned migrations have no diff.
