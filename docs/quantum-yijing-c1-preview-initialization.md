# C1 private Preview initialization

Baseline: `c1-bazi-consultation-development`, `2cb91214c45e9a4de7f28f8d7bb12fbdd0bd4a16`. Local implementation and synthetic validation only. No remote request, resource creation, deployment, credential installation, existing-server restart or Git mutation was executed.

The initializer resolves the missing owner-run migration/provisioning transport. It does not create resources, seed customers/products/practitioners/promotions, install application secrets, change Pages configuration, activate Preview or supply payment integration. No public setup/bootstrap/recovery endpoint is introduced. Existing C1 and Academy runtime modules, authentication algorithms, schema sources and all 15 pinned migrations are unchanged.

## Owner prerequisites

Use Node 24 and normal Windows PowerShell in a private session without transcript, debug tracing, TLS-inspection proxy, debugger or heap capture. Secrets are prompted as SecureString and passed to the Node child over private stdin; they are never arguments, files or environment variables. The process holds plaintext/password hashes in memory temporarily; JavaScript strings cannot be guaranteed zeroized. End the process after use. No secrets are included in the target file.

The new Pages project and new dedicated D1 must already exist. Independently verify their account, Pages project ID and D1 UUID in Cloudflare. Use a short-lived account-scoped API token with D1 write, Pages read and permission to read the selected account details; do not use a global API key. Grant the narrowest available resource scope. This tool only calls the approved account details, exact Pages project and exact D1 UUID; it does not enumerate or query Academy/shared databases. Revoke the token after initialization. An owner-approved maintenance window with one initializer and no other DDL/activation operators is required.

Before running, configure **the new project's Preview environment** with exactly one D1 binding `CONSULTATION_DB` pointing to the new UUID. Configure its Production branch as `c1-production-disabled`. Both Preview and Production must explicitly have these values:

| Variable | Value |
|---|---|
| CONSULTATION_PREVIEW_ENABLED | `false` |
| CONSULTATION_SYNTHETIC_BOOTSTRAP_ENABLED | `false` |
| CONSULTATION_MOCK_DELIVERY_ENABLED | `false` |
| SUBSCRIPTION_AUTOMATION_ENABLED | `false` |

Preview `CONSULTATION_DEPLOYMENT_SLOT` must be `preview`; Production must be `disabled`, with **no D1 bindings**. Keep Production config `{}` and no Production keyring. The tool reads and verifies Pages settings before each migration and provisioning write; it never changes them. It also keeps the database marker disabled. D1 itself has no Pages Preview slot: the exact Pages binding and environment settings establish that association.

## Target file and minimum commands

Create an ignored local directory, for example `.local-c1-package-preview-initialization/`, and save `target.json` there. Replace placeholders with independently verified IDs; do not change the fixed project, origin or branch. The duplicate account/UUID fields must match the separately approved target. Approval flags are owner attestations, not substitutes for live API identity checks.

```json
{
  "action": "initialize",
  "accountId": "<VERIFIED_ACCOUNT_ID_32_LOWERCASE_HEX>",
  "expectedAccountId": "<SAME_OWNER_APPROVED_ACCOUNT_ID>",
  "projectId": "<VERIFIED_NEW_PAGES_PROJECT_ID>",
  "databaseId": "<VERIFIED_NEW_D1_UUID>",
  "expectedDatabaseId": "<SAME_OWNER_APPROVED_D1_UUID>",
  "project": "qy-c1-consultation-preview",
  "databaseName": "qy-c1-consultation-preview-db",
  "productionBranch": "c1-production-disabled",
  "branch": "c1-bazi-consultation-development",
  "slot": "preview",
  "origin": "https://c1-bazi-consultation-development.qy-c1-consultation-preview.pages.dev",
  "manifestSha256": "<manifestSha256_FROM_CURRENT_PACKAGE_INVENTORY>",
  "freshDatabase": true,
  "ownerApproved": true,
  "ownerApprovedHostname": true,
  "independentlyVerifiedUuid": true
}
```

After owner approval, run from the repository directory:

```powershell
node scripts/consultation-migration-verifier.mjs
powershell -NoProfile -File scripts/initialize-consultation-preview.ps1 -Target .local-c1-package-preview-initialization/target.json
```

This first invocation prompts for the Cloudflare token only. Expected result: `ok:true`, `migrations:15`, `disabled:true`, `administrators:0` for a fresh database. It creates the disabled identity marker after the complete schema. No resource is created.

Change **only** `action` to `administrator` in the same target file and rerun the identical PowerShell command. It prompts privately for token, username, password and confirmation. Existing username/password rules and PBKDF2-SHA256 600,000 iterations apply. Expected result: `administrators:1`, still disabled. The account/audit transaction cannot replace an existing account and rechecks disabled marker, identity, complete ledger and synthetic inventory.

Finally change `action` to `verify` and rerun the command. Verification is read-only, requires no password, prints sanitized counts only, and must report 15 migrations, disabled state and one administrator. Do not run `administrator` again to recover a password. This tool intentionally provides no rotation/recovery feature.

## Atomicity and stopping behavior

The transport uses the fixed HTTPS origin `https://api.cloudflare.com/client/v4`, bearer authentication, no redirects, a 30-second request timeout, no automatic retries and generic errors. The [D1 query API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/) accepts parameterized batch requests. Each prerequisite/migration unit is submitted in one request; migration DDL and its original-path/checksum ledger INSERT are never split. The existing SQL lexer preserves complete trigger bodies. No raw BEGIN/COMMIT or Wrangler SQL-file import is used remotely.

Before any migration, a deliberate failing batch must roll back both a synthetic probe table and its row. The client checks that the schema is unchanged afterward. If the remote API does not provide that behavior, initialization stops before migrations. A bad probe is never automatically removed: inspect the dedicated database before proceeding. Local workerd/D1 rollback is verified, but actual management-API semantics remain a mandatory owner-run conformance check, not a locally proven remote result.

Each exact expected schema prefix is constructed locally from the original prerequisites and pinned migrations using SQLite. Reruns compare full application schema SQL, not just table names, and verify the contiguous immutable ledger. The tool resumes only an exact prefix. Unknown objects, partial migrations, drifted checksums/ledger, wrong/active markers or nonmatching target metadata stop execution; there is no baseline adoption or reset. Only the exact Cloudflare internal names `_cf_METADATA`, `_cf_KV` and SQLite-owned objects are excluded. The owner verified `_cf_KV` in the dedicated empty D1 database; it must never be dropped or modified by initialization. Other unexpected platform objects also stop for inspection.

DDL migration 1 creates its ledger in the same batch. Later migrations each append their own ledger row. Previously committed units remain after a later unit fails; the failed unit must leave no partial DDL or ledger. A completed rerun does not replay migrations or overwrite the marker. There is no destructive cleanup. A failed post-check or connection timeout is **not** permission to retry blindly: stop, then use `verify` for a complete database, or explicitly rerun `initialize` after checking the target and confirming the last committed prefix. No automatic resend occurs.

Administrator preparation invokes the existing `provisionOffline()` implementation against an in-memory exact-schema mirror, then sends its record and audit as bound parameters. The dedicated remote account insert and required audit insert share one batch. A zero-row guard causes audit insertion failure and whole-batch rollback. No raw hashes, API responses, credentials or SQL bodies are printed. On a lost provisioning response, `verify` can discover that the single account committed; a second administrator attempt refuses rather than replacing it. A failed credential input never generates a remote account write.

The final checks cover schema/ledger, disabled marker, foreign keys, quick integrity, administrator count and empty orders/payments/assertions. Marker activation during administrator provisioning aborts the account/audit write. Separate Cloudflare configuration updates cannot share a transaction with D1: do not activate or change bindings concurrently. Initialization never sets enabled=1 or installs application key material.

## Focused local evidence and limits

Run only the new focused suite with an existing local Miniflare installation:

```powershell
$env:QY_MINIFLARE_PATH='<EXISTING_MINIFLARE_PACKAGE_PATH>'
node --require ./scripts/consultation-local-file-stdio.cjs scripts/test-consultation-preview-initialization.mjs
```

All remote API behavior in this suite is an in-process fake over disposable SQLite and actual local workerd/D1; tests make **zero remote calls**. Updated result: **44 passed, zero failed**, Node v24.20.0 with the existing local Miniflare installation. Tests cover target rejection, wrong account/UUID/project/binding/gates, prerequisite and migration rollback, exact-prefix resume, rerun safety, schema drift, password rejection, account/audit rollback, activation race, lost response, existing-account refusal, unchanged password verification and secret-safe single-attempt transport errors. The resource-configuration follow-up adds preservation of a synthetic `_cf_KV` table in SQLite, unknown-object refusal, actual D1 rejection of reserved-table creation, and confirmation that the initializer never submits platform-table writes. D1 security is not weakened to fabricate its internal table. JavaScript syntax, PowerShell parsing, whitespace and all 15 migration pins are checked separately. No historical regression campaign is rerun.

No paid service, deployed initialization Worker or Worker CPU is needed: password hashing runs in the local process. D1 Free read/write/storage and API limits still apply. A rejected or oversized management batch stops rather than being split. This does not establish deployed application CPU compliance: the existing PBKDF2 login still needs the separately bounded Cloudflare Free test. No algorithm/strength changes or passkey integration are included.

After initialization, ordinary remaining setup is the existing owner-approved synthetic inventory/product/practitioner/promotion data, approved policy configuration and six-purpose Preview keyring. These are not fabricated here. Keep Preview disabled until separately verified and approved. Trusted payment integration remains absent/disabled; accepted Preview bookings cannot be confirmed by this tool.

Changed files are only the initializer, private PowerShell wrapper, focused synthetic suite and this runbook. No Pages/Academy runtime or pinned source changes.
