# U3-B2B Step 2A — disabled Cloudflare Free Preview runbook

LOCAL REVIEW ONLY. No command here authorizes remote creation, migration,
credential installation, deployment or activation. Production remains frozen.
The implementation baseline is branch `c1-bazi-consultation-development`, HEAD
`01e545ced64b1cee5783ed1142b0740df0feccf2`. Changes remain unstaged/uncommitted.

## Status and identity decisions

| State | Meaning |
|---|---|
| Locally verified | Synthetic SQLite and actual local workerd/D1 tests; package hashes and source scope |
| Owner decision | Hostname, account, new resource identities, Access, policies, key custody and each remote phase |
| Deployed verification | Actual CPU, metadata, TLS/cookies, Pages assets, D1 persistence, quotas and shutdown behavior |
| BLOCKED | Free 10ms CPU qualification; private administrator transfer; no approved remote migration executor |

Prepared targets:

- Pages: `qy-c1-consultation-preview`.
- D1: `qy-c1-consultation-preview-db`, binding exactly `CONSULTATION_DB`.
- Preview branch: `c1-bazi-consultation-development`.
- Proposed stable origin:
  `https://c1-bazi-consultation-development.qy-c1-consultation-preview.pages.dev`.
- New project's proposed Production branch: `c1-production-disabled`, never the
  Preview branch. This project setting still requires independent confirmation.
- Account ID, project ID, new D1 UUID, actual hostname, permissions and quotas:
  UNKNOWN. Names are proposals; they do not prove physical resource identity.

Do not create the immutable database origin marker until the owner approves the
hostname and an authorized operator verifies the actual Pages alias. The package
does not create that marker. The planner's local attestation booleans are explicit
review prerequisites, not independent proof of Cloudflare identity.

## Preview versus Production

The bare `qy-c1-consultation-preview.pages.dev` host is the new project's
Production URL. It is rejected by the Pages entry even when the Preview slot
variable is supplied. Hash deployment URLs, other branches, custom domains and
Academy hosts are also rejected. The selected stable branch alias is exact.

`wrangler.template.jsonc` explicitly repeats vars and D1 lists for both slots:

- Top-level/default and `env.production`: all gates false, slot `disabled`,
  config `{}`, no D1 bindings.
- `env.preview`: slot `preview`, only the dedicated D1 name and an invalid UUID
  placeholder, all gates false, config `{}`.
- No secret is included. `CONSULTATION_KEYRING` must be a private Preview secret.

Thus the prepared configuration cannot activate the Production slot. Changing
these protections or deploying arbitrary alternate configuration requires another
review. Runtime checks cannot prevent an operator uploading code to the wrong
project; independently verify account/project/slot/branch before any write.

The entry requires `CF_PAGES=1`, exact `CF_PAGES_BRANCH`, slot `preview`, exact
project/config branch and exact origin. Request headers cannot supply environment
bindings. Pages metadata availability/values require deployed verification;
unexpected values deny service. Metadata is never forwarded as service authority.

Cloudflare Preview config is shared across Preview branches, not configured per
branch. Keep other Preview branches disabled by runtime identity and deployment
controls. Do not infer the slot from the project name or current Git branch.
No automatic Git integration, deploy hooks or Production promotion is authorized.
[Pages configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)

Cloudflare Access is an OWNER DECISION. It is not assumed configured. Preview
URLs are public by default; confirm policy coverage for the exact alias and that
authentication redirects work with the application. Edge rate controls should
address shared administrator lockout and account-quota exhaustion. No shared
Academy Access policy or secret may be silently reused.
[Preview access and aliases](https://developers.cloudflare.com/pages/configuration/preview-deployments/)

## Free-plan budget and runtime behavior

| Budget | Required boundary |
|---|---|
| CPU | 10ms per invocation; local CPU is indicative only |
| D1 statements | 50 per invocation, including all statements in batches |
| D1 database | 500MB; monitor actual allocated storage |
| D1 rows | 5 million read/day and 100,000 written/day, account-wide allowance |
| Worker requests | Shared 100,000/day Free allowance, including these Pages Functions |
| Config/keyring | Prepared boundary conservatively limits each serialized binding to 5,000 UTF-8 bytes |

[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
[Worker limits](https://developers.cloudflare.com/workers/platform/limits/),
[Pages Functions quota](https://developers.cloudflare.com/pages/functions/pricing/).

The contract now reads marker, ledger, object inventory, prerequisite columns,
product, practitioner, administrator presence and synthetic inventory in one
fresh SQLite snapshot. It does not cache mutable state. Each API still validates
at adapter creation, composition and dispatch: three snapshot statements. This
retains factory validation and reuse safety. Mutation batches retain their
atomic marker/identity/synthetic-inventory assertions and all authorization CAS.

Static assets do not instantiate API services: one live SELECT, zero writes.
Zero D1 reads would bypass the database disable/schema contract, so that read is
intentional. Invalid static paths are rejected before any D1/ASSETS access.
Cookies/authorization are stripped from requests forwarded to ASSETS. Every
response remains no-store with CSP, frame denial and other security headers.

Local instrumentation lives only in `scripts/`, never in the deployed bundle.
It counts every executed statement, including batch guards, and imposes a
synthetic 50-statement cap. It captures D1 row metadata and separate CPU/wall time.
Quota failures return denial/unavailability; there is no static fallback, auth
bypass, automatic resend or automatic mutation retry. A response may be lost
after a successful commit; inspect idempotency/audit state before any retry.
Cloudflare CPU termination may prevent application error handling; that must
still produce failure, never an authorized success response.

Windows `process.cpuUsage()` has approximately 15–16ms resolution here. Individual
zero measurements do not establish zero CPU. Node process CPU includes the
crypto pool and SQLite; workerd process CPU is UNKNOWN, and its wall time is not
relabeled CPU. Stateful routes with one sample have no statistical confidence.
Local PBKDF2 login greatly exceeds 10ms. Free CPU readiness is BLOCKED, not PASS.
Do not lower the 600,000 iterations or any cryptographic/security requirement.

The fixture's snapshot scans hundreds of schema rows. One SQL statement is not
one billed row. Use the measurement report for the tiny synthetic fixture, then
measure realistic bounded inventory and query plans after separate authorization.
Daily headroom and available account quotas remain UNKNOWN. All static requests
invoke Functions. Keep synthetic inventory small and review traffic/abuse limits.

## Fresh isolated database migration procedure — not executed remotely

Before eventual execution, two-person/independent evidence must establish:

1. Owner authorization specifically names the new account/project/database UUID,
   Preview slot and branch; account identity matches the authorized credential scope.
2. New D1 is physically distinct from Academy/Production. UUID matches both config
   fields and external Cloudflare resource evidence; denylisted known UUIDs reject.
   A self-declared marker alone does not prove binding identity.
3. Database contains no application objects/data. Only documented platform-owned
   objects such as `_cf_METADATA` may exist. Unexpected tables or a ledger STOP.
4. Selected alias is owner-approved and verified before any immutable marker.
5. Original manifest, compatibility sources, prerequisite and all fifteen canonical
   SQL hashes match the reviewed package. Stop on any mismatch; no baseline adoption.

`scripts/consultation-preview-migration-plan.mjs` produces review units only.
It contains no remote client or execution CLI. Its SQL lexer preserves strings,
comments, trigger bodies and nested CASE/END expressions; never split on `;`
naively. Tests apply these units to disposable SQLite and actual local workerd/D1.

First apply `offline/000-isolated-prerequisites.sql` to the NEW database only.
It is the exact verified projection of enquiries/products/orders/order_items/
payments/customers/customer_identifiers/customer_enquiry_links/coaches DDL,
required payment ALTERs, and the pinned Academy portal prerequisite. Academy
portal sessions and these compatibility tables are schema dependencies, not
permission to connect to Academy or import its data. Preserve their synthetic
scope; financial tables start and remain empty.

Then apply these exact package files in order:

1. `001-migrate-c1-integration-control.sql`
2. `002-migrate-c1-consultation-auth.sql`
3. `003-migrate-c1-consultation-customer-identity.sql`
4. `004-migrate-c1-bazi-consultation-foundation.sql`
5. `005-migrate-c1-consultation-customer-intake.sql`
6. `006-migrate-c1-consultation-contact-verification.sql`
7. `007-migrate-c1-consultation-account-stepup.sql`
8. `008-migrate-c1-consultation-workflow.sql`
9. `009-migrate-c1-consultation-workflow-lifecycle.sql`
10. `010-migrate-c1-consultation-capture-review.sql`
11. `011-migrate-c1-consultation-workflow-evidence-guards.sql`
12. `012-migrate-c1-consultation-preferences.sql`
13. `013-migrate-c1-consultation-availability.sql`
14. `014-migrate-c1-consultation-meetings.sql`
15. `015-migrate-c1-preview-adapter.sql`

Canonical checksum: SHA-256 of valid UTF-8, BOM removed, CRLF normalized to LF.
Ledger path is the ORIGINAL `database/migrate-c1-*.sql`, not the numbered package
filename. Use a positive operator-reviewed millisecond timestamp.

For each C1 unit, execute all complete statements plus its parameterized ledger
INSERT in ONE transaction. Migration 1 creates the ledger inside that same unit.
D1 `batch()` supports rollback across its statements; local tests prove DDL,
triggers and ledger rollback before and after the ledger INSERT. Do not send
separate independently committing DDL/ledger calls. Do not assume a Wrangler file
import or ordinary BEGIN/COMMIT API calls provide the same guarantee.
[D1 batch semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/)

Remote execution is BLOCKED until a private, authorized D1 execution mechanism is
reviewed that preserves these units without publishing a maintenance endpoint.
This phase deliberately supplies no remote executor or remotely runnable commands.

After each unit inspect exact contiguous ledger prefix and expected schema objects.
After all units run the following read-only verification against only the attested
database; do not select password hashes, session tokens or plaintext records:

```sql
PRAGMA foreign_key_check;
PRAGMA quick_check;
SELECT ordinal,path,canonical_sha256,applied_at
FROM consultation_migration_ledger ORDER BY ordinal;
SELECT type,name,tbl_name,sql FROM sqlite_schema
WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
ORDER BY type,name;
PRAGMA table_info(payments);
PRAGMA table_info(academy_portal_sessions);
SELECT COUNT(*) AS orders_count FROM orders;
SELECT COUNT(*) AS payments_count FROM payments;
SELECT COUNT(*) AS residual_assertions FROM consultation_preview_assertions;
```

Compare the complete object definitions and prerequisite columns to the reviewed
fresh schema, not merely object names. Runtime object-presence checks are not
an attestation of arbitrary operator SQL. Expected: no FK rows, quick_check `ok`,
fifteen exact ledger rows, exact reviewed definitions, and zero financial/assertion
rows. No administrator or environment marker exists from migrations alone.

Only after approved hostname/UUID verification, prepare a marker with exact
UUID/origin/manifest, `synthetic_only=1, enabled=0`, and invented synthetic product,
Approved practitioner and registered `SYNTHETIC-*` customers. No financial seed.
The current manifest fingerprint is
`e8231fb3ed2cd732ac26f7b8ce049c2b72ded138858874b062ad8901c5e0ac17`.

## Private administrator preparation and transfer — BLOCKED

There is no public setup endpoint and no shared ADMIN_TOKEN. The existing offline
CLI operates on an already prepared private Windows `.sqlite` file. Validate the
file and parent ACLs, exact disabled marker, all fifteen ledger entries and synthetic
inventory. Feed a private bounded stdin object; never a password argument, shell
history entry, clipboard workflow, tracked file, SQL export or transcript.

Initialization must not replace an existing administrator. Password requirements
remain PBKDF2-SHA256/600,000 iterations, random salt, >=20 characters and <=128 UTF-8
bytes. Rotation requires expected-version CAS, increments password_version,
revokes live QY sessions, resets lockout control and appends sanitized audit evidence.
It must preserve intake, keys, migration ledger and all earlier audit history.

For future D1 transfer, review an authenticated private operator channel scoped to
the attested NEW UUID. The password must be hashed locally; transfer only protected
parameterized password-record fields in memory over the approved channel. Password
hashes are themselves sensitive. No plaintext password export, persistent SQL
credential file, public maintenance Worker, browser form or shared Academy token.
Recheck disabled marker/schema/absence or expected credential version atomically
with account/audit/session changes. Reject mismatch or failed CAS without effects.

Local SQLite provisioning/rotation and local D1 authentication pass. A real private
remote channel, credential scope, transport redaction, audit leakage and operator
ACL success have NOT been demonstrated. Therefore remote administrator provisioning
is BLOCKED. No real administrator was created and no real credential was generated.

## Six-purpose secret lifecycle and encrypted recovery

| Purpose | Algorithm | Retain for |
|---|---|---|
| intake | AES-256-GCM | Historical private intake ciphertext |
| contact | AES-256-GCM | Canonical/report-contact ciphertext |
| lookup | HMAC-SHA256 | Historical fingerprints/idempotency evidence |
| challenge | HMAC-SHA256 | Outstanding challenge proofs |
| meeting | AES-256-GCM | Retained historical meeting secrets |
| mockDelivery | AES-256-GCM | Unexpired encrypted synthetic outbox |

Create independent random 32-byte material privately only after authorization.
Every key-version ID is unique across the whole ring; never duplicate material.
Each purpose has `active` and `keys`; max sixteen versions per purpose. Keep the
complete serialized ring within the prepared 5,000-byte binding bound. That means
the runtime's per-purpose maximum cannot necessarily be used for every purpose
simultaneously. Plan old-version archival/retention before reaching either bound.

Install only as the new project's Preview SECRET binding `CONSULTATION_KEYRING`;
never ordinary vars, source, generated public assets, command arguments or logs.
Do not install a Production-slot secret. Validate six-purpose shape privately.
Server config is separate and contains no secret key material.

Rotation sequence: disable first; take encrypted paired database/key backups;
add new unique versions while retaining old versions; privately replace the
Preview secret; verify new encryption and old-ciphertext decryption in a synthetic
canary; verify fail-closed missing-version behavior; then seek activation approval.
The local rotation test proves historical intake decryption with the retained key
and rejects removal. It also checks both versions resolve for all six purposes.
Activating a new key does not re-encrypt old records. Never reuse a retired ID.

Backups: keep encrypted database snapshots and versioned keyring backups under
separate access controls, record UUID/origin/manifest/schema/key versions and restore
point, verify authenticated encryption and a disposable restore, and set owner-
approved retention. The backup encryption key must have independently recoverable
custody and must not exist only inside the encrypted backup. Do not put plaintext
exports in public/Git/temp transcript paths. Remote backup tooling/custody is UNKNOWN.
D1 Time Travel is supplementary (Free retention seven days); it cannot restore
lost encryption keys. A restored database cannot simply receive a new UUID marker.
Any identity-preserving or reviewed identity migration requires separate review.

## Disabled-first rollout, recovery and shutdown

After separate phase authorizations, the proposed sequence is:

1. Attest new account/project/UUID, branch and slot. Confirm actual alias and owner
   approval. Resolve CPU and private provisioning blockers before useful activation.
2. Prepare reviewed config with exact UUIDs, manifest, mappings and policy text hashes;
   keep all gates false and Production/default slots empty/disabled.
3. Apply reviewed migration units through the approved private mechanism; verify
   ledger/schema/integrity. Stop immediately on error or mismatch.
4. Provision invented synthetic inventory, disabled marker, private administrator
   and Preview key secret through separately approved private procedures.
5. Verify inventory and upload ONLY `public/` to the exact project and Preview branch.
   Never use repository root, `offline/`, or a preliminary package as output.
6. Observe disabled behavior before enabling anything. Activation is a separate
   owner decision. Measure actual Cloudflare CPU/query/row budgets and errors,
   metadata, TLS/cookies, ASSETS clean routing and D1 persistence across redeploys.
7. Complete English/Chinese desktop/iPhone/Android acceptance and disable-race,
   cleanup and recovery exercises. Keep payment confirmation unavailable.

Failed migration: keep disabled; preserve evidence and inspect exact ledger prefix.
If a reviewed atomic unit rolled back, verify no residual objects before retrying
that unit. Never replay prerequisite ALTERs or an applied migration automatically.
If atomicity or ledger/schema agreement is uncertain, STOP for investigation.
Use an approved backup/Time Travel restoration or additive corrective migration;
no ledger rewrite, arbitrary DROP, database reset or destructive rollback.

Identity mismatch: deny service. Do not rewrite immutable UUID/origin/manifest,
attach Academy D1, copy Production data or reuse a known shared UUID to make it pass.

Code rollback: disable before any redeployment. Pages Preview hash URLs persist;
the stable alias may need explicit authorized redeployment of the reviewed older
package. Do not assume Production rollback controls move the Preview alias.
An older U3-B2A bundle lacks the new exact-slot guard and is not automatically an
approved rollback target. Old code must accept the retained schema/key versions.
Rollback does not reverse migrations, audit events, credentials or key rotation.

Shutdown: disable database marker and Preview gates first; verify new requests
deny assets/APIs and mutation races abort. Revoke QY/customer sessions using reviewed
operations while retaining audit evidence. Remove only the dedicated Preview secret
and binding after verification, with recovery custody retained. Explicit mock outbox
TTL deletion still needs an approved private maintenance mechanism; expiration
denies reads but does not erase rows. Resource deletion requires separate owner
authorization, final encrypted recovery evidence and exact UUID/project attestation.
Do not delete preliminary local packages or any Academy/Production resource.

## Local reproduction

Use existing local Node 24/esbuild/Miniflare/workerd; no installation or download.
Set `QY_ESBUILD_PATH` and `QY_MINIFLARE_PATH` to reviewed installed packages.
For this Windows host, optional `QY_TEST_OPENSSL` points to the existing native
`C:/Program Files/Git/mingw64/bin/openssl.exe`; explicit test preloading substitutes
it for MSYS OpenSSL only for ephemeral loopback certificates. It does not modify
trust stores or control the existing owner server. Use a new evidence directory.

```powershell
node scripts/run-consultation-step2a-acceptance.mjs .local-c1-package-step2a-new-acceptance
node --require ./scripts/consultation-local-file-stdio.cjs scripts/test-consultation-preview-migrations.mjs
node scripts/test-consultation-deployment-guards.mjs
node scripts/test-consultation-package-reproducibility.mjs
# Set QY_C1_FREE_PROFILE to a private local JSON evidence path for the extended run:
node --require ./scripts/consultation-local-file-stdio.cjs scripts/test-consultation-pages.mjs
node scripts/review-consultation-preview.mjs .local-c1-package-u3b2b-step2a-review
```

All commands above are local only. The extended packaged suite includes the
original 65 checks plus new Free-plan/security tests. Instrumentation deliberately
records only paths/methods/counts/status/timing; no query parameters, bodies,
passwords, keyring values, OTPs or customer data. Only synthetic fixtures are used.
