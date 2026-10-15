# U3-B2B Step 2A ? local acceptance report

Date: 2026-10-15. Local implementation and acceptance completed. **Free deployment remains BLOCKED.** No commit or provisioning is authorized by this report.

## Baseline and final Git state

Branch: `c1-bazi-consultation-development`.
HEAD: `01e545ced64b1cee5783ed1142b0740df0feccf2`.
The worktree was clean before changes. Final scope: **9 modified, 12 added files**, all C1-specific. Changes remain uncommitted and unstaged. No pinned SQL, manifest, frozen Academy module or financial source module was modified. Earlier package directories remain untouched.

## Implementation

- Explicit disabled default/Production config without D1; Preview-only dedicated name/binding and invalid UUID placeholder. All activation gates remain false.
- Exact Pages project, branch-alias origin, CF_PAGES branch and private slot boundary; wrong slots/hosts/bindings fail before D1 or ASSETS. The proposed hostname is not approved or externally verified. No immutable marker was initialized outside synthetic in-memory test databases.
- Consolidated live contract into one snapshot SELECT, preserving ledger/object/prerequisite/product/practitioner/account checks. Static assets use one live read/zero writes instead of full API composition. APIs retain three fresh snapshot checks. No mutable security state is cached between requests. Atomic mutation/authentication assertions are unchanged.
- Local-only query/row/CPU/wall instrumentation with a 50-statement cap and resource-failure injection. No test instrumentation enters the public Worker bundle.
- Trigger-aware migration-plan review library, local rollback tests, disabled configuration reviewer, reproducible package tests and synthetic historical-key rotation tests. No remote executor or public provisioning endpoint was added.
- Reconciled U3-B2A's stale final checkpoint statement to the successful required commit. Added the [operational runbook](U3-B2B-STEP2A-RUNBOOK.md).

## Acceptance results

| Existing suite | Passed | Failed |
|---|---:|---:|
| pages | 65 | 0 |
| pages-ui | 11 | 0 |
| meetings | 30 | 0 |
| account-stepup | 248 | 0 |
| availability | 48 | 0 |
| preferences | 13 | 0 |
| workflow-local | 50 | 0 |
| booking-ui | 23 | 0 |
| customer-resume | 18 | 0 |
| report-navigation | 15 | 0 |
| language | 29 | 0 |
| foundation | 142 | 0 |
| workflow-runtime | 23 | 0 |
| integration | 62 | 0 |
| preview-adapter | 51 | 0 |
| **Existing total** | **828** | **0** |

| New checks | Passed | Failed |
|---|---:|---:|
| Free-plan/route/security checks on Node and workerd (83 extended minus 65 existing) | 18 | 0 |
| Migration attestation, SQL lexer, atomic DDL/ledger rollback and integrity | 111 | 0 |
| Deployment configuration/boundary and six-purpose key rotation | 19 | 0 |
| Package reproducibility, prerequisite/pins, inventory and tamper rejection | 6 | 0 |
| **New total** | **154** | **0** |
| **Combined distinct checks** | **982** | **0** |

The extended suite reruns the original 65 packaged checks; those repetitions are not counted twice. Existing acceptance evidence is `.local-c1-package-step2a-verified/summary.json`. Extended workload: `free-corrected.log` and `free-profile.json` in that directory. Earlier failed exploratory runs are retained separately; all final listed runs passed. Synthetic local server tests allocated their own disposable loopback servers; no existing owner server was restarted or controlled.

Environment: Node 24.20.0; existing local esbuild 0.28.2, Miniflare 5.20261006.1-alpha and workerd 1.20261006.1; compatibility date 2026-10-07. One older installed workerd could not support the date, so the existing newer installation was used without downloading anything. Native MinGW OpenSSL replaced MSYS OpenSSL only under the explicit local test preload; certificate/trust/security assertions were retained. The acceptance runner now uses the actual 29-check language suite and recognizes the foundation suite's `RESULT:` output.

## Free-plan findings

| Item | Result |
|---|---|
| 50 D1 statements/request | **PASS for measured synthetic paths**; highest observed 21, cap enforced in Node and workerd |
| Static D1 cost | **PASS** one fresh statement, zero writes; rejected paths/hosts use zero |
| Database <500MB | **PASS for tiny synthetic fixture only**, SQLite allocation and local D1 size metadata checked; deployed growth UNKNOWN |
| Daily row/request budgets | **Requires owner/deployed verification**; 5M reads/100K writes and shared 100K Worker requests/day are not unlimited |
| CPU <=10ms | **BLOCKED**; Node login CPU p50/p95/max **156 / 172 / 172ms**. Actual Cloudflare CPU UNKNOWN |
| Private administrator transfer | **BLOCKED**; local provisioning/rotation pass, private remote channel not demonstrated |
| Remote migration execution | **BLOCKED**; tested review units exist, approved private executor/UUID attestation absent |

CPU is process user+system time measured independently from wall time. Windows CPU accounting here is quantized near 15?16ms; zero samples do not establish zero CPU. Node includes crypto pool and SQLite work. No parallel requests were used during this final benchmark. Actual local workerd CPU is UNKNOWN and its wall time is not CPU. Never weaken PBKDF2/encryption/CSRF/authentication to satisfy Free limits. The login implementation remains 600,000 iterations.

All route percentiles and workerd query/row/wall measurements are retained in [machine-readable measurements](U3-B2B-STEP2A-MEASUREMENTS.json). Records aggregate method/path without IDs, cookies, bodies, OTPs or keys. Single-sample routes have no statistical confidence. Negative tests contribute to their path's distribution. Confirmed-only flows cannot be successfully exercised through this package because payment confirmation is intentionally unavailable; their invalid-command/authorization paths were measured.

The local D1 snapshot reads approximately 440?442 billed rows even for assets in this small fixture; API validation repeats it three times. Reducing SQL statements does not remove row-read cost. Measure representative inventory and available account headroom before any useful deployment. A full page's several assets all invoke Functions and consume quota. Node SQLite does not expose billed-row metadata; its zero metadata fields mean unavailable, not zero real scans.

### Per-route Node/SQLite measurements

Each numeric triple is p50 / p95 / maximum. All times are milliseconds. workerd counterparts and D1 row counts are in the JSON.

| Method/path | n | D1 statements | CPU ms | Wall ms |
|---|---:|---|---|---|
| `GET /` | 1 | 1 / 1 / 1 | 0 / 0 / 0 | 7.04 / 7.04 / 7.04 |
| `GET /customer` | 23 | 1 / 1 / 1 | 0 / 15 / 16 | 3.103 / 4.203 / 5.207 |
| `GET /customer.html` | 2 | 0 / 1 / 1 | 0 / 0 / 0 | 0.226 / 4.48 / 4.48 |
| `GET /qy` | 29 | 1 / 1 / 1 | 0 / 16 / 32 | 2.992 / 5.56 / 8.917 |
| `GET /qy.html` | 3 | 1 / 1 / 1 | 0 / 15 / 15 | 1.104 / 3.361 / 3.361 |
| `GET /admin.html` | 1 | 0 / 0 / 0 | 0 / 0 / 0 | 0.327 / 0.327 / 0.327 |
| `GET /.env` | 1 | 0 / 0 / 0 | 0 / 0 / 0 | 0.18 / 0.18 / 0.18 |
| `GET /offline/migration-manifest.json` | 1 | 0 / 0 / 0 | 0 / 0 / 0 | 0.143 / 0.143 / 0.143 |
| `GET /scripts/provision-consultation-preview-offline.mjs` | 1 | 0 / 0 / 0 | 0 / 0 / 0 | 0.138 / 0.138 / 0.138 |
| `GET /_worker.js` | 1 | 0 / 0 / 0 | 0 / 0 / 0 | 0.166 / 0.166 / 0.166 |
| `GET /functions/api/admin` | 1 | 0 / 0 / 0 | 0 / 0 / 0 | 0.135 / 0.135 / 0.135 |
| `POST /api/consultation/qy/login` | 14 | 12 / 12 / 12 | 156 / 172 / 172 | 152.297 / 170.966 / 170.966 |
| `HEAD /customer.html` | 1 | 1 / 1 / 1 | 16 / 16 / 16 | 4.818 / 4.818 / 4.818 |
| `POST /customer.html` | 1 | 0 / 0 / 0 | 0 / 0 / 0 | 0.211 / 0.211 / 0.211 |
| `POST /api/consultation/setup` | 1 | 3 / 3 / 3 | 0 / 0 / 0 | 8.446 / 8.446 / 8.446 |
| `POST /api/consultation/qy/setup` | 1 | 3 / 3 / 3 | 16 / 16 / 16 | 6.688 / 6.688 / 6.688 |
| `POST /api/consultation/local/customer-login` | 1 | 3 / 3 / 3 | 0 / 0 / 0 | 8.832 / 8.832 / 8.832 |
| `POST /api/consultation/qy/local/outbox` | 1 | 3 / 3 / 3 | 47 / 47 / 47 | 14.301 / 14.301 / 14.301 |
| `POST /api/consultation/qy/local/capture` | 2 | 3 / 3 / 3 | 16 / 16 / 16 | 5.463 / 8.063 / 8.063 |
| `POST /api/consultation/qy/payment/reconcile` | 2 | 3 / 3 / 3 | 0 / 0 / 0 | 4.745 / 5.686 / 5.686 |
| `POST /api/consultation/qy/payment/finance-review` | 1 | 3 / 3 / 3 | 0 / 0 / 0 | 5.496 / 5.496 / 5.496 |
| `POST /api/consultation/preview/bootstrap` | 5 | 4 / 8 / 8 | 15 / 16 / 16 | 10.891 / 11.7 / 11.7 |
| `POST /api/consultation/context` | 1 | 10 / 10 / 10 | 15 / 15 / 15 | 11.299 / 11.299 / 11.299 |
| `GET /api/consultation/account/options` | 1 | 6 / 6 / 6 | 32 / 32 / 32 | 8.865 / 8.865 / 8.865 |
| `POST /api/consultation/qy/account/review` | 1 | 10 / 10 / 10 | 0 / 0 / 0 | 8.662 / 8.662 / 8.662 |
| `POST /api/consultation/account/challenge` | 1 | 14 / 14 / 14 | 16 / 16 / 16 | 10.904 / 10.904 / 10.904 |
| `POST /api/consultation/qy/preview/outbox` | 3 | 8 / 8 / 8 | 0 / 15 / 15 | 6.486 / 9.772 / 9.772 |
| `POST /api/consultation/account/confirm` | 1 | 17 / 17 / 17 | 16 / 16 / 16 | 11.914 / 11.914 / 11.914 |
| `POST /api/consultation/contact/challenge` | 1 | 17 / 17 / 17 | 16 / 16 / 16 | 11.342 / 11.342 / 11.342 |
| `GET /api/consultation/qy/contact/instructions` | 1 | 8 / 8 / 8 | 16 / 16 / 16 | 11.84 / 11.84 / 11.84 |
| `POST /api/consultation/qy/contact/delivered` | 1 | 9 / 9 / 9 | 0 / 0 / 0 | 10.934 / 10.934 / 10.934 |
| `POST /api/consultation/contact/confirm` | 1 | 14 / 14 / 14 | 15 / 15 / 15 | 11.336 / 11.336 / 11.336 |
| `POST /api/consultation/bookings` | 1 | 21 / 21 / 21 | 16 / 16 / 16 | 13.414 / 13.414 / 13.414 |
| `POST /api/consultation/qy/status` | 2 | 6 / 11 / 11 | 15 / 15 / 15 | 9.117 / 10.399 / 10.399 |
| `POST /api/consultation/qy/availability` | 1 | 9 / 9 / 9 | 0 / 0 / 0 | 8.063 / 8.063 / 8.063 |
| `POST /api/consultation/qy/offer` | 1 | 15 / 15 / 15 | 16 / 16 / 16 | 11.685 / 11.685 / 11.685 |
| `GET /api/consultation/offer` | 1 | 7 / 7 / 7 | 16 / 16 / 16 | 9.787 / 9.787 / 9.787 |
| `POST /api/consultation/offer/accept` | 1 | 16 / 16 / 16 | 0 / 0 / 0 | 11.321 / 11.321 / 11.321 |
| `GET /api/consultation/qy/bookings` | 27 | 5 / 5 / 5 | 0 / 16 / 16 | 6.244 / 10.476 / 10.883 |
| `GET /workflow-ui.js` | 20 | 1 / 1 / 1 | 0 / 16 / 16 | 2.314 / 3.685 / 3.948 |
| `GET /workflow.css` | 20 | 1 / 1 / 1 | 0 / 15 / 16 | 3.553 / 5.158 / 5.243 |
| `GET /academy-logo.png` | 20 | 1 / 1 / 1 | 0 / 16 / 16 | 4.707 / 5.542 / 5.744 |
| `GET /api/consultation/bookings` | 20 | 7 / 7 / 7 | 15 / 16 / 16 | 7.461 / 10.566 / 10.661 |
| `GET /api/consultation/account/state` | 20 | 7 / 7 / 7 | 0 / 16 / 16 | 6.516 / 8.744 / 9.741 |
| `GET /api/consultation/meeting` | 1 | 3 / 3 / 3 | 0 / 0 / 0 | 6.107 / 6.107 / 6.107 |
| `GET /api/consultation/qy/meeting` | 1 | 4 / 4 / 4 | 0 / 0 / 0 | 8.761 / 8.761 / 8.761 |
| `GET /api/consultation/qy/availability` | 1 | 6 / 6 / 6 | 0 / 0 / 0 | 7.753 / 7.753 / 7.753 |
| `GET /api/consultation/preferences` | 1 | 3 / 3 / 3 | 15 / 15 / 15 | 10.112 / 10.112 / 10.112 |
| `GET /api/consultation/qy/preferences` | 1 | 3 / 3 / 3 | 0 / 0 / 0 | 5.701 / 5.701 / 5.701 |
| `GET /api/consultation/qy/private` | 1 | 4 / 4 / 4 | 16 / 16 / 16 | 6.509 / 6.509 / 6.509 |
| `GET /api/consultation/reschedule/list` | 1 | 3 / 3 / 3 | 0 / 0 / 0 | 6.721 / 6.721 / 6.721 |
| `GET /api/consultation/qy/reschedule/list` | 1 | 3 / 3 / 3 | 16 / 16 / 16 | 8.142 / 8.142 / 8.142 |
| `POST /api/consultation/qy/meeting` | 1 | 3 / 3 / 3 | 0 / 0 / 0 | 9.749 / 9.749 / 9.749 |
| `POST /api/consultation/preferences` | 1 | 3 / 3 / 3 | 31 / 31 / 31 | 7.307 / 7.307 / 7.307 |
| `POST /api/consultation/reschedule/request` | 1 | 3 / 3 / 3 | 0 / 0 / 0 | 7.838 / 7.838 / 7.838 |
| `POST /api/consultation/qy/reschedule/decide` | 1 | 3 / 3 / 3 | 0 / 0 / 0 | 5.399 / 5.399 / 5.399 |
| `POST /api/consultation/qy/offer/expire` | 1 | 3 / 3 / 3 | 0 / 0 / 0 | 8.568 / 8.568 / 8.568 |
| `POST /api/consultation/qy/forfeit` | 1 | 3 / 3 / 3 | 0 / 0 / 0 | 5.31 / 5.31 / 5.31 |
| `POST /api/consultation/qy/report/status` | 1 | 3 / 3 / 3 | 16 / 16 / 16 | 6.258 / 6.258 / 6.258 |
| `POST /api/consultation/qy/report` | 1 | 4 / 4 / 4 | 0 / 0 / 0 | 5.051 / 5.051 / 5.051 |
| `POST /api/consultation/qy/customers/search` | 1 | 3 / 3 / 3 | 16 / 16 / 16 | 7.25 / 7.25 / 7.25 |
| `POST /api/consultation/context/resume` | 1 | 6 / 6 / 6 | 0 / 0 / 0 | 5.627 / 5.627 / 5.627 |
| `POST /api/consultation/qy/logout` | 1 | 8 / 8 / 8 | 16 / 16 / 16 | 12.005 / 12.005 / 12.005 |

## Migration and recovery results

All fifteen canonical pins, source prerequisite pins and compatibility-source pins verify unchanged. Both fresh builds reproduce the exact prerequisite projection and all fifteen migrations. The trigger-aware lexer preserves quoted semicolons, comments and CASE/END blocks.

SQLite and actual local workerd/D1 passed failure injection before and after each of fifteen ledger INSERTs, plus failed prerequisite batches: **62 rollback scenarios**. Every failed unit left application schema and ledger unchanged; every complete unit subsequently committed. D1's automatically created `_cf_METADATA` table is explicitly excluded from application-schema rollback comparison, not modified. All fifteen entries/object inventories, foreign keys, quick_check, immutable-ledger enforcement, and absence of financial/administrator/marker seeds passed.

No down migration or remote executor exists. Future execution requires an empty dedicated database, externally attested UUID and approved hostname, trigger-preserving atomic units, full definition/column comparison and disabled marker. Ledger/marker rewrites, automatic adoption and destructive reset are prohibited. See the runbook for failed migration, database-identity mismatch, Preview alias rollback, shutdown, backup/key custody and separately authorized resource cleanup procedures.

## Administrator, keys and security isolation

- Synthetic offline initialization/expected-version rotation, audit history and session revocation passed in the existing package suite. Real operator ACL success and private transfer/redaction to D1 remain unverified and BLOCKED. No real administrator was created. No plaintext password export or public provisioning route was introduced.
- Six independent purposes remain required. Local rotation retains old versions, decrypts historical intake and rejects missing historical keys and duplicate material. Encrypted backup/custody/restore procedures are documented; actual operator backup/key recovery is not verified.
- Academy and bare project Production host rejection, exact Preview branch/slot targeting, unknown/provider/shared bindings and oversized secret bindings were tested. A self-declared marker cannot attest physical D1 UUID; external attestation remains required.
- QY/customer authentication, ownership, OTP limits/replay, CSRF, secure HttpOnly/SameSite cookies, origin checks, encrypted outbox, private assets and stripped ASSETS credentials retain passing acceptance.
- Accepted bookings remain PaymentPending; capture/finance/provider routes cannot confirm payment, and orders/payments remain empty.
- Read-quota/runtime failures deny protected APIs/assets. Write exhaustion aborts mutations without partial portal sessions; read-only assets can still serve when only writes are exhausted. Marker changes, missing schema guards and non-synthetic inventory are observed on the next request. No cross-request authorization cache was introduced. Actual abrupt CPU termination and deployed edge failure behavior still require remote acceptance.

## Owner decisions and deployed gates

**Owner decision:** account/project and newly allocated database UUID; actual alias approval; Production branch sentinel and Preview deployment controls; Cloudflare Access coverage; edge abuse limits; policies/country/product/practitioner mappings; key/administrator custody; encrypted backup/retention/recovery; separate remote creation/migration/provisioning/deployment/activation scopes.

**Deployed verification:** actual Cloudflare CPU and quota headroom, metadata allowlist, binding identity, Pages ASSETS routing, TLS/cookie isolation, persistent D1 across redeploys, disable races, explicit outbox cleanup, backup restore and real bilingual desktop/iPhone/Android acceptance.

**Blocked:** Free CPU qualification, private administrator transfer and private remote migration executor. The disabled package/runbook is reviewable; it is not authorization to provision or deploy.

## Exact changed-file scope

Modified (9):

- `consultation-pages/README.md`
- `consultation-pages/U3-B2A-RESULTS.md`
- `consultation-pages/config.template.json`
- `consultation-pages/worker.js`
- `consultation-pages/wrangler.template.jsonc`
- `functions/lib/consultation/preview-adapter.js`
- `functions/lib/consultation/preview-composition.js`
- `scripts/consultation-local-file-stdio.cjs`
- `scripts/test-consultation-pages.mjs`

Added (12):

- `consultation-pages/U3-B2B-STEP2A-RUNBOOK.md`
- `consultation-pages/U3-B2B-STEP2A-RESULTS.md`
- `consultation-pages/U3-B2B-STEP2A-MEASUREMENTS.json`
- `functions/lib/consultation/pages-boundary.js`
- `scripts/consultation-free-profile.mjs`
- `scripts/consultation-pages-free-checks.mjs`
- `scripts/consultation-preview-migration-plan.mjs`
- `scripts/review-consultation-preview.mjs`
- `scripts/run-consultation-step2a-acceptance.mjs`
- `scripts/test-consultation-deployment-guards.mjs`
- `scripts/test-consultation-package-reproducibility.mjs`
- `scripts/test-consultation-preview-migrations.mjs`

## Package and final checks

New review artifact: `.local-c1-package-u3b2b-step2a-review/`.
All 28 inventory-listed paths verify; 29 total files including inventory; exactly seven public files. Two fresh builds produced identical complete inventories. Worker SHA-256:
`0386ea6418710efe6edc75113a2195508751dcad15bde6c9eed6ff5a15de75a9`.
Manifest fingerprint:
`e8231fb3ed2cd732ac26f7b8ce049c2b72ded138858874b062ad8901c5e0ac17`.
The package reviewer explicitly reports `remoteReady:false`.

JavaScript syntax checks, JSON/template parsing, exact changed-file scope, unchanged migration pins, empty staged diff and `git diff --check` pass. This report and timing evidence are outside public output and do not change package reproducibility.

No Cloudflare resource/account operation, Wrangler remote command, deployment, remote migration, real credential/secret creation, Production access, provider contact, commit, push, merge, tag or preliminary-directory deletion occurred. Public documentation was read only. Stop for owner review before committing or provisioning.
