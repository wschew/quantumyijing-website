# C1 Stage A3 — Individual Final Price Before Booking

**CONDITIONAL PASS: locally implemented and tested; awaiting owner approval.** No remote operations, deployment, Git staging/commit, server restart or Academy/shared changes were performed. Branch: `c1-bazi-consultation-development`; HEAD at start: `c50e54577619db7858d2dd7b4979014a174b5a41`. Existing uncommitted work was retained.

## Administrator and customer flow

Sign in through the unchanged C1 administrator login. Pricing management now shows **Create Individual Special Price**, Bazi Consultation, read-only regular/current selling prices, final price in RM, an optional **customer-facing** description and MYT expiry. Click **Create Private Booking Link**. The URL appears once, with a copy button when the Clipboard API is available. Clear the URL after private delivery. No internal-only notes field is added; do not put private personal information in descriptions.

Inventory displays invitation ID, description, final price, expiry and Unused/Redeemed/Revoked/Expired status. A changed pricing basis is additionally marked Stale — reissue. Unused invitations can be revoked through the existing QY session/CSRF safeguards, rechecked in SQL during mutation. A lost or uncertain link cannot be retrieved: inspect inventory, revoke the identified unused invitation and issue another. There is no automatic issue retry. Copying is an explicit user action; the operating-system clipboard remains the owner's responsibility.

The customer opens `customer.html#invitation=<private-token>`. The fragment is removed from the address bar before API calls; token validation uses a same-origin JSON POST body. No token is placed in an HTTP URL, log, analytics call, browser storage or listing. The existing page has no-referrer protection. Token and quote state are held only in page memory and cleared on pagehide; a restored invitation form then remains locked. Duplicate page initialization was removed so clearing the fragment cannot discard the invitation context. Invalid/expired/revoked/redeemed/stale invitations leave the form unavailable, never silently falling back to normal pricing.

A valid link shows regular price, applicable selling price, individual final price, description and expiry before appointment selection. The customer chooses an available slot, enters guest information and reviews a server-signed quote and versioned booking terms, then explicitly accepts the final amount. English/Chinese switching preserves entered fields. Normal visitors continue through the same automatic self-service flow without a code field, using the eligible RM980 seasonal promotion or RM1300 regular price.

No email or phone address is treated as identity proof. **The invitation is a transferable bearer credential: anyone possessing it may use it before redemption/expiry/revocation.** It provides a price, not access to another customer's intake or bookings. QY must deliver it privately; it cannot be securely restricted to an unverified guest contact.

## Reused security and atomicity

The existing 256-bit random code generator, SHA-256 verifier storage, single-use state, administrative pricing audit, HMAC quotation, encrypted intake, versioned consent, unique request fingerprint, overlap triggers, D1 batch and immutable final-price snapshot are reused. Only the URL is returned for a new invitation; no separately entered customer code is required. Existing A2 code records/APIs remain for compatibility, while code issuance/entry controls are removed from the active administrator/customer interfaces.

Invitation creation atomically writes the verifier, existing pricing audit event and immutable invitation pricing basis. Approval attribution remains the actual authenticated QY session. Creation rejects prices above the current applicable selling price and rechecks that exact price/promotion in the transaction. Single-use redemption remains inside the same booking batch as the slot hold and immutable final price. The existing required price-consistency trigger aborts the whole batch if conditional redemption did not update the invitation. No failed booking consumes an invitation. Successful identical retries return the existing booking before checking subsequently expired invitation/promotion state; a changed request with the same ID remains rejected.

**Stale-price rule:** current base amount AND promotion ID/version must match the invitation's immutable creation basis at validation and checkout. A different promotion is stale even at the same amount. Reject for administrator reissue instead of substituting a new final price. The existing transaction-level promotion guard also rejects a change between verification and commit. The comparison is against the currently applicable basis; it does not introduce a separate global pricing-event epoch. An accepted booking always retains its original final price and accepted terms regardless of later pricing changes.

Booking finishes at **PaymentPending** with the existing 48-hour payment deadline and private offer-scoped access link. Appointment confirmation still requires trusted full-payment verification, and Preview payment remains unavailable. The 72-hour lead time, 90-minute duration, slot conflict protection, bounded unpaid-hold expiry, legacy exception handling, cancellation/rescheduling and manual PDF workflow remain unchanged.

Lost booking-access links retain the A2 limitation: no public recovery endpoint, no unrestricted access token and no automatic recovery through an unverified contact. Retain the booking-specific link; contact authenticated QY support for exception review without disclosing birth details. This phase does not invent a verified delivery channel.

## Additive migration

`database/additive/c1-consultation-invitations.sql`, packaged as `offline/019-invitations-additive.sql`, adds only:

- `consultation_price_invitations`, linking an existing verifier ID to immutable base price and promotion ID/version;
- three consistency/history triggers on that new table.

It contains no data rewrite, table drop, ALTER or backfill. Original 15 migrations and additions 016/017/018 remain intact and byte-identical in the package relative to the deployed A2 package. Existing codes, bookings, promotions, accepted terms, prices and audit rows are not changed by applying 019. The owner's existing RM980 booking `BAZI-9debad86-d2fb-49d9-b4a9-f507e807d00b` was not accessed or modified remotely.

Apply **019 once only** to the already initialized A2 database. Do not rerun 018 or initialization. The migration deliberately fails if its objects exist; a failed Wrangler import may be partial, so inspect schema state before any retry. Local transactional migration rollback is tested, but remote import chunking/atomicity is not claimed.

## Local verification

Final focused results:

| Check | Result |
|---|---|
| A3 `scripts/test-consultation-invitations.mjs` | **96 assertions PASS** |
| Existing Stage A `scripts/test-consultation-selfservice.mjs` | **57 assertions PASS** |
| Adapted A2 `scripts/test-consultation-pricing.mjs` | **91 assertions PASS**; legacy A2 API tests retained, UI assertions adapted to private links |
| Original migration pins | **15 PASS** |
| Syntax | **10 changed JavaScript/build/test files PASS** |
| Whitespace | Git diff and explicit phase-file trailing-whitespace checks PASS |
| Local workerd/D1 | **BLOCKED: `spawn EPERM`**; optional nine checks not counted as passes |

A3 exercises actual bundled Worker code with disposable transactional SQLite, the retained A2 Worker as a pre-migration historical fixture, deterministic barriers after independent request verification and before competing writes, and actual customer/QY UI handlers in a synthetic DOM. It covers normal RM980 and private RM880, unknown/tampered/expired/revoked/reused invitations, distinct-slot concurrent redemption, rollback and retry, exact consent, price changes including during issuance/commit, immutable history, QY session/CSRF, bilingual field preservation, once-only URL display/copy/clearing, browser-like address-bar fragment removal with exactly one initialization, pagehide locking, no public token inventory and no unverified confirmation. Historical preservation includes a genuine local A2-created RM980 PaymentPending booking before applying 019. It does not establish current remote database contents or real-browser behavior.

Representative A3 checkout: **34 submitted SQL statements**, **20.143 ms host wall time**, **31 ms Node process CPU**. The adapted A2 cleanup test measured **42 submissions** with one expired hold processed during checkout. These include Preview assertion/admission statements but not separately counted trigger-internal operations. They are single local samples, not percentiles, actual D1 execution/row-billing metadata or deployed Worker CPU. SHA-256/HMAC/AES and existing native secret login are reused; no new password KDF, external service, cron or paid feature is introduced. Inventory remains bounded to 100 rows per category, and token lookup is indexed. Existing anonymous admission controls remain. Long-term audit growth/retention still needs an owner policy before commercial operation.

**Cloudflare Free assessment: CONDITIONAL.** Request work is bounded locally, but deployed CPU and genuine D1 semantics/cost remain unverified because workerd cannot spawn here. Real-browser A3 smoke testing is also pending. Do not claim production readiness; trusted live payment and approved real-customer policies remain absent.

## Exact phase-file inventory

1. `database/additive/c1-consultation-invitations.sql` — new
2. `functions/lib/consultation/pricing-admin.js`
3. `functions/lib/consultation/selfservice-booking.js`
4. `functions/lib/consultation/preview-adapter.js`
5. `consultation-preview/customer.html`
6. `consultation-preview/guest-booking-ui.js`
7. `consultation-preview/qy.html`
8. `consultation-preview/workflow-ui.js`
9. `scripts/build-consultation-pages.mjs`
10. `scripts/test-consultation-selfservice.mjs`
11. `scripts/test-consultation-pricing.mjs`
12. `scripts/test-consultation-invitations.mjs` — new
13. `scripts/test-consultation-guest-ui.mjs`
14. `docs/c1-individual-price-stage-a3.md` — new

This inventory describes this phase, not all pre-existing dirty/untracked files. Earlier deployment packages were not overwritten.

## Prepared package and proposed owner commands

Prepared/tested A3 package: `.local-c1-package-preview-invitations-1792202035096`.

Its `wrangler.jsonc` is copied byte-for-byte from the deployed A2 package. It preserves `CONSULTATION_DB`, exact dedicated D1 UUID/expected UUID, approved Preview origin, branch restrictions, product/practitioner IDs, draft policies and Preview flags. Production remains disabled and unbound; subscription automation remains false. Secrets are absent from the package and are not installed/replaced by this procedure. Public output includes only C1 assets and Worker; SQL stays under offline. Package inventory hashes and isolated Worker input paths were checked.

Before remote approval, the owner can run the optional **local-only** workerd/D1 checks from normal PowerShell:

```powershell
$env:QY_ESBUILD_PATH='C:\Users\WIN10\AppData\Local\npm-cache\_npx\32026684e21afda6\node_modules\esbuild\lib\main.js'
$env:QY_MINIFLARE_PATH='C:\Users\WIN10\AppData\Local\npm-cache\_npx\32026684e21afda6\node_modules\miniflare'
node scripts/test-consultation-invitations.mjs
```

**Proposed remote commands, not executed; separate owner approval required:**

```powershell
Set-Location 'C:\Users\WIN10\Desktop\qy-c1-bazi-consultation-development'
$package='.local-c1-package-preview-invitations-1792202035096'
$env:CLOUDFLARE_ACCOUNT_ID='f87d6f0679c6fe4c1c08af320850b52c'
npx.cmd wrangler d1 execute 734455fd-cdec-4e14-ad6f-96f80f22f3e7 --remote --env preview --config "$package/wrangler.jsonc" --file "$package/offline/019-invitations-additive.sql"
if ($LASTEXITCODE -ne 0) { throw 'STOP: inspect additive schema state; do not deploy or rerun blindly.' }
npx.cmd wrangler pages deploy "$package/public" --project-name qy-c1-consultation-preview --branch c1-bazi-consultation-development --config "$package/wrangler.jsonc"
```

After an approved deployment, issue one RM880 invitation on QY Dashboard, open it privately, check the regular/base/final amounts in English and Chinese, select an unused slot and explicitly accept the final quote. Confirm PaymentPending and the matching QY saved price/payment deadline. Do not alter the existing owner booking, simulate payment or mark confirmed. Ordinary visitors should still see RM980 while the existing seasonal promotion is eligible.

Rollback retains all additive schema/history. Revoke unused A3 links through authenticated controls before withdrawing A3 functionality; do not continue distributing invitation links while an older frontend is running. No table drops, price rewrites or resetting redeemed invitations. Await owner review before any remote step.
