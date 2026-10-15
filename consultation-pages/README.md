# C1 U3-B2A local deployment package

Prepared for owner review only. No deployment, remote database, provider operation,
commit, staged file or owner-server restart is part of this phase. The package is
for a **new, dedicated synthetic C1 Pages project**. Never use the existing site's
root directory as Pages output, and never attach an existing/shared database.

## Build locally

Use Node 24 with an **already installed** esbuild. No npm/npx installation is
required or performed. In PowerShell, set `QY_ESBUILD_PATH` to the absolute local
esbuild package path, then run:

```powershell
node scripts/build-consultation-pages.mjs .local-c1-package-u3b2a-review
```

The destination must not exist. The builder refuses overwrite. Generated package
directories matching `.local-c1-package*/` are ignored by Git. The supplied local
review artifact is `.local-c1-package-u3b2a-final/`.

Only `public/` is the future Pages output. It contains `_worker.js` (bundled ES
module, no Node dependencies), `_routes.json` (all requests through the Worker),
and exactly five C1 assets: customer/QY HTML, shared JS/CSS and Academy logo.
`offline/`, inventory, templates, credentials and SQL must never be uploaded as
static assets. There is no root-site build, Functions directory, admin dashboard,
portal magic-link handler, provider binding or public setup endpoint in the bundle.

`package-inventory.json` records every other package file and its SHA-256, the
Worker hash, manifest fingerprint and complete Worker input list. Every dependency must be the C1 entry, consultation modules or
the pinned C1 manifest. The build rejects other inputs. The artifact contains no
password or keyring. The disabled `wrangler.template.jsonc` is intentionally
invalid until separate U3-B2B identity review; it is not a deployment instruction.

## Configuration and request boundary

The server-only `CONSULTATION_CONFIG` binding contains the reviewed configuration
JSON shaped by `offline/config.template.json`. Policies require actual approved
version/text/SHA-256 values. Fill the exact dedicated project, canonical HTTPS
pages.dev origin, independently attested database UUID, expected UUID, manifest
fingerprint and synthetic product/practitioner mappings. No request body can
provide server configuration. Draft examples cannot enable a runtime.

The entry accepts only `ASSETS`, `CONSULTATION_CONFIG`, the six explicitly
supported adapter bindings/flags and these Pages metadata fields: `CF_PAGES`,
`CF_PAGES_BRANCH`, `CF_PAGES_COMMIT_SHA`, `CF_PAGES_URL`. Metadata never enters the
adapter dependency object. Unknown fields, shared DB aliases, ADMIN_TOKEN and
provider credentials reject. Exact host/origin and all three Preview/bootstrap/
mock gates must match. The full live adapter contract is checked for **every
request, including assets**. A disabled marker denies assets as well as APIs.
Existing atomic mutation assertions remain unchanged.

Static requests have an exact path/method allowlist and no query strings. Root,
`/customer`, `/customer.html`, `/qy` and `/qy.html` resolve to Pages clean HTML
asset paths, avoiding .html-to-clean-URL redirect loops. ASSETS
receives a new URL-only request with no cookies or authorization headers. All
responses receive no-store, nosniff, no-referrer, frame denial, restrictive CSP
and camera/microphone/geolocation denial. API origin, cookies, QY/customer CSRF,
canonical ownership and challenge controls remain authoritative. No CORS or
fallback to the existing site's routes is provided.

## Synthetic interface sequence

1. QY signs in with the dedicated consultation account. In **Synthetic Preview
   access**, enter an explicitly registered synthetic customer ID and establish
   its synthetic portal session. This requires QY mutation CSRF; it grants no
   identity/contact review, OTP verification, consent or booking confirmation.
2. Open Customer Booking in the same browser and establish the consultation
   context. Independent QY account-contact review remains necessary.
3. The customer requests an account OTP and gives its opaque request ID to QY.
   QY enters that exact ID and explicitly reads the protected encrypted mock
   outbox. There is no OTP list, automatic retrieval or real message delivery.
4. Customer completes account OTP and the separate report-contact challenge,
   then submits private intake. QY offers an available appointment; customer
   accepts the policy. The booking stays **PaymentPending**.

The packaged HTML selects Preview behavior and removes loopback customer login.
The shared source retains existing loopback demo support for its regression
suites. In Preview mode no loopback login, outbox-list or capture control runs;
the Worker does not mount any of those endpoints. Both English and Simplified
Chinese include the new access controls and request-ID guidance. Only the
language preference uses browser storage. OTP output is protected from
translation, cleared on hide/navigation/logout and guarded against an in-flight
response restoring it after hide. Real-browser/mobile acceptance remains pending.

## Offline schema and account preparation

`offline/000-isolated-prerequisites.sql` projects the exact repository compatibility
DDL and pinned academy portal prerequisite for a **fresh isolated database only**.
Its source pins are checked against the existing manifest, with provenance in
`schema-provenance.json`. The 15 numbered C1 SQL files retain their original
canonical checksums. No pinned migration, financial source module or Production
schema file is edited. Compatibility financial tables exist only to satisfy the
isolated schema contract; the package seeds/writes no orders or payments.

`migration-plan.json` lists the exact ordinal/file/checksum and parameterized
ledger insertion for each migration. Migration SQL and its ledger row belong in
one atomic transaction. The first control migration creates the ledger. Stop on
any schema/ledger mismatch. The plan is review material, not a remote executor.
No automatic baseline adoption, marker rewrite, down migration or seed is supplied.
Register only newly invented synthetic customers with `SYNTHETIC-` references;
never copy Production customers, sessions or financial records. Supply an explicit
synthetic CONSULT-BAZI product (MYR 1,300) and Approved practitioner mapping. No
financial seed is required. Create the immutable environment marker with matching
UUID/origin/manifest and `synthetic_only=1, enabled=0` for offline preparation.

`scripts/provision-consultation-preview-offline.mjs --offline-db <existing.sqlite>`
accepts bounded UTF-8 JSON on **stdin**, never credentials in command arguments.
Input fields are `config`, `username`, `password`, `confirmation`, `action`
(`initialize` or `rotate`), plus `expectedVersion` for rotation. Feed it through a
trusted private local stdin producer; do not put passwords in shell history,
source, transcripts, redirected public files or clipboard tooling. The input
limit is 4 KiB. This tool does not create a database or export credential SQL.

The CLI requires Windows, a regular canonical `.sqlite` file and private file
and parent ACLs limited to the current user, SYSTEM and Administrators; it does
not change ACLs. It validates all 15 ledger entries/schema objects, exact disabled
marker and synthetic inventory before transactionally provisioning the account.
Password records use the existing PBKDF2-SHA256 600,000-iteration implementation
and random salt. Initialization cannot replace an account. Rotation uses an
expected-version CAS, revokes QY sessions and appends sanitized audit evidence
while preserving data, keys and schema. Errors contain no credential details.
Existing strings cannot be guaranteed erased from JavaScript memory; keep this
offline process private and short-lived. CLI ACL success and real remote D1
credential transfer still need operator validation in U3-B2B; the tested core
uses disposable SQLite. There is no remote provisioning or public recovery path.

Provide the six independent versioned key purposes privately as
`CONSULTATION_KEYRING`: intake, contact, lookup, challenge, meeting, mockDelivery.
No actual secrets were generated for deployment. Preserve historical key
versions and prepare encrypted backups/recovery separately. Offline tooling does
not activate the environment. Never reset a database for password recovery.

## Payment and provider boundary

There is no capture adapter, finance-review adapter, checkout, reconciliation or
synthetic payment-confirmation route. Direct Confirmed transitions reject. Local
package acceptance tests prove an actual accepted offer stays PaymentPending and
orders/payments remain empty in both SQLite and workerd/D1. Historical regression
fixtures continue to exercise their existing isolated synthetic payment machinery;
that machinery is not imported or mounted in this package. No Zoom, email,
WhatsApp, SMS or payment network operation was performed.

## Local validation

Set `QY_MINIFLARE_PATH` to an existing local Miniflare installation and
`QY_ESBUILD_PATH` to local esbuild. Run the new suites:

```powershell
node --require ./scripts/consultation-local-file-stdio.cjs scripts/test-consultation-pages.mjs
node scripts/test-consultation-pages-ui.mjs
```

The optional require hook transports workerd config/control/logs through freshly
allocated temporary regular files when Windows denies Node anonymous pipes. It
also captures read-only historical `git show` fixtures this way. For old HTTPS
fixtures whose MSYS OpenSSL cannot create signal pipes, set `QY_TEST_PYTHON` to an
existing Python with cryptography; the hook substitutes an equivalent ephemeral
localhost/127.0.0.1 self-signed certificate. No trust-store change, new download,
test assertion change or remote service is involved. Use this helper only for
synthetic tests; temporary runtime config can contain synthetic keys. Files are
removed when each test runtime exits normally. The helper never controls the
existing owner server.

The new package suite runs actual bundled Worker code in Node/SQLite and
workerd/Miniflare/D1 with outbound global fetch disabled. Frontend tests execute
the actual Preview handlers with a synthetic DOM/API. These are not browser
rendering, deployed restart or Cloudflare resource-attestation tests.

## U3-B2B prerequisites and owner review

- Approve and independently attest exact isolated account/project/database IDs,
  branch/origin/binding mapping, schema, synthetic seeds and policy text/hashes.
- Review package inventory and disabled configuration; authorize remote creation,
  migration/provisioning and deployment separately. Upload only `public/`.
- Approve private account transfer to D1, six-purpose keys, encrypted backups,
  rotation/recovery and old-key retention. No credential export path exists here.
- For an existing 14-entry marker, design and authorize an immutable marker-version
  upgrade; this package only prepares fresh isolated prerequisites.
- Measure deployed Worker CPU and D1 query budget. Full per-request validation is
  intentionally retained; local functional tests are not a CPU-limit guarantee.
- Verify Pages ASSETS behavior, metadata allowlist, CSP, TLS, cookie host isolation,
  disable races, persistent remote D1 restart and explicit mock-outbox TTL cleanup.
- Perform real English/Chinese desktop/iPhone/Android acceptance in the isolated
  environment. Authorize any existing demonstration restart separately.
- Keep payment confirmation unavailable. Any future payment-evidence adapter or
  provider integration requires its own scope and review.

Recovery remains disable-first and code-first with additive schema/audit/key
history retained. No destructive cleanup, financial repair, database reset or
automatic promotion activation is part of this package.
