# C1 Stage A2 — local implementation checkpoint

Status: **CONDITIONAL PASS for isolated synthetic Preview preparation**. No remote operations, deployment, Git staging/commit or changes to Academy/shared modules were performed. Starting branch: `c1-bazi-consultation-development`; HEAD: `c50e54577619db7858d2dd7b4979014a174b5a41`. Earlier uncommitted work was retained.

## Architecture and use

QY Dashboard now has Pricing management. Sign in using the unchanged C1 administrator login, then Refresh pricing. Save a future promotion as a Draft; separately approve and activate it after reviewing its price and dates. The server records the authenticated session as approver. MYR prices must be positive, at most RM1300; dates must be real, ordered MYT dates starting today or later. Inclusive overlapping Active periods are rejected by database triggers, including concurrent activation. Approved prices/dates/approval attribution cannot be edited. Revoke and create a new version for future business changes; existing offers are never repriced. The existing October–December 2026 promotion is neither inserted nor updated by this addition.

Issue a single-use code with a final price, optional customer-facing description and MYT expiry. Do not put personal information in descriptions. The final amount must not exceed the currently applicable approved promotion, otherwise RM1300. A 256-bit random lowercase hexadecimal code is shown once; only SHA-256 persists. Privately deliver the displayed code, then clear it. Inventory never returns codes or verifiers. There is no public listing, customer restriction or reusable/multiple-use mode. Unverified guest email/phone cannot securely establish customer ownership. A code is a transferable bearer capability until redeemed, revoked or expired; it grants pricing only, not booking/intake access. Revocation is allowed only before redemption.

If issuance is uncertain, refresh inventory before taking further action. A lost code cannot be recovered; revoke the identified unused record and issue a replacement. The UI suppresses simultaneous issue clicks but deliberately does not automatically retry an uncertain request.

The existing bilingual booking form accepts one optional code. Review price and terms returns a five-minute signed quote, shortened to the code's expiry when earlier. It shows regular price, applicable promotion/base price, individual reduction and final price. Base eligibility uses the quote/submission date in Malaysia, not the appointment date. The server signs the final amount and code ID, without returning its verifier or plaintext code. Acceptance binds that quote and current versioned terms. Edited inputs require another review and explicit acceptance.

Checkout revalidates signature, terms, current base promotion, code, lead time and availability. The same D1 batch creates encrypted intake, consent/audit, accepted immutable offer, held slot, PaymentPending booking, private-access hash, code redemption and immutable price breakdown. The final breakdown insertion has a mandatory consistency trigger: if conditional redemption updated no row, the entire batch aborts. Concurrent competing redemptions therefore cannot both commit. Failed transactions consume no code. Existing request fingerprints return a successful retry before checking whether its code has since been used or expired. No stacking, paid-state fabrication or provider calls are introduced.

Price snapshots retain regular/base/final amounts, promotion attribution in the offer, and individual discount attribution/description. Older offers have no invented breakdown. Dashboard uses Payment deadline for self-service PaymentPending and Offer deadline for historical manual offers. Payment reconciliation still compares the immutable offer final amount and requires trusted full-payment evidence. Administrator exception, cancellation, rescheduling and PDF workflows remain unchanged.

## Private booking access and recovery

Existing booking-specific, hash-fragment links are retained, hash-only in storage, limited to that offer's expiry and non-sensitive offer information. They never expose encrypted birth details or a public booking directory. The UI now explicitly asks customers to save the private link and contact QY if lost, without sending birth details.

There is **no automatic link recovery in Preview**: no verified delivery channel is available. A reference, unverified email/phone or knowledge of birth details must not authorize a replacement link or disclosure. Support may inspect the case through authenticated QY controls and provide generic next-step guidance; it must not release private information or create another booking merely on a claimant's assertion. Restoring access requires an independently verified channel and an approved support procedure, neither implemented nor claimed here. For synthetic testing, retain the original private link; use QY exception review if it is lost. Expired unpaid holds follow existing bounded expiry. A redeemed code is not automatically restored when a hold expires.

## Additive schema and resource bounds

`database/additive/c1-consultation-pricing.sql` adds discount verifiers, immutable offer price breakdowns, pricing audit events, an inventory index and integrity/overlap/history triggers. It does not alter any existing table definition, original migration, ledger row, administrator or offer. Apply once after the guest and self-service additions. Existing tables deliberately cause a rerun to fail; inspect any failure before rerunning. Local transaction-failure testing is not a guarantee about Wrangler file-import chunking: do not assume a failed remote import made no changes.

Cleanup remains lazy and bounded: calendar/quote process at most two expired eligible unpaid holds; checkout processes at most one to preserve query headroom. Linked orders/payment review evidence remain on the QY exception path. There are no per-quote rows, new external services, cron or password algorithms. Existing anonymous admission limits and Preview synthetic-record cap remain. Code lookup is indexed; administrator inventories are limited to 100 newest records. Historical codes/events/prices are retained, not silently deleted. Long-term audit/storage retention and large-volume operation require an owner policy before commercial use.

## Local verification

Final focused runs:

- `scripts/test-consultation-pricing.mjs`: **92 assertions passed** against the actual bundled Worker with transactional disposable SQLite and executed customer/QY UI handlers in a synthetic DOM. Covers RM1300/RM980/RM880, invalid/expired/revoked/reused codes, independent concurrent requests held before competing writes on distinct slots, retry, price changes, expiry/revocation before commit, final-write rollback, final-price consent, legacy RM1300 preservation, bilingual switching with field preservation, QY session/CSRF protection, unchanged password hash, unpaid-confirmation rejection, schema/pins and resource bounds.
- Existing `scripts/test-consultation-selfservice.mjs`: **57 assertions passed** with the additive schema; existing Stage A booking, conflicts, expiry, replay and exception behavior retained.
- 15 original migration pins verified; foreign-key checks passed; JavaScript syntax checks passed for the 11 changed JavaScript/test/build files. Git whitespace and explicit new-file trailing-whitespace checks passed.
- Local workerd/D1 attempt through the existing cached Miniflare: **BLOCKED, `spawn EPERM`**. The optional nine workerd/D1 checks were not executed. Do not count them as passing. Actual browser interaction was not run; synthetic DOM tests are not browser compatibility evidence.

Representative successful discounted checkout: **23 submitted write-batch statements + 11 separate read submissions = 34**. Observed host wall time **20.152 ms**, Node process CPU **16 ms**. A checkout with expired holds queued submitted **42 statements** including its one cleanup batch. These include Preview assertion wrappers and admission writes; trigger-internal work is not separately counted. These are individual local samples, not percentiles, actual D1 billing metadata or deployed Worker CPU. No Cloudflare Free CPU compliance claim is made. Both deployed CPU and D1 runtime behavior remain conditional pending owner-run validation.

## Files changed in this phase

1. `database/additive/c1-consultation-pricing.sql` (new)
2. `functions/lib/consultation/pricing-admin.js` (new)
3. `functions/lib/consultation/selfservice-booking.js`
4. `functions/lib/consultation/foundation.js`
5. `functions/lib/consultation/preview-adapter.js`
6. `functions/lib/consultation/workflow.js`
7. `functions/lib/consultation/guest-booking.js`
8. `consultation-preview/customer.html`
9. `consultation-preview/qy.html`
10. `consultation-preview/guest-booking-ui.js`
11. `consultation-preview/workflow-ui.js`
12. `scripts/build-consultation-pages.mjs`
13. `scripts/test-consultation-selfservice.mjs`
14. `scripts/test-consultation-pricing.mjs` (new)
15. `docs/c1-pricing-stage-a2.md` (new)

Some listed files were already untracked/modified at the starting checkpoint. This list describes this phase's edits, not the entire dirty worktree.

## Prepared package and approval boundary

Latest A2 tested package: `.local-c1-package-preview-pricing-1792199612954`. Its copied `wrangler.jsonc` is byte-identical to the established aligned Preview configuration: project `qy-c1-consultation-preview`, branch restriction `c1-bazi-consultation-development`, approved truncated branch origin, product/practitioner 1 and D1 `734455fd-cdec-4e14-ad6f-96f80f22f3e7` under `CONSULTATION_DB`. Existing Preview flags/configuration remain; Production is disabled and unbound. No secrets were copied into the package. Existing remote secrets would be reused.

**Next step: owner review.** Before remote approval, run the optional workerd/D1 checks in normal PowerShell where workerd can start:

```powershell
$env:QY_ESBUILD_PATH='C:\Users\WIN10\AppData\Local\npm-cache\_npx\32026684e21afda6\node_modules\esbuild\lib\main.js'
$env:QY_MINIFLARE_PATH='C:\Users\WIN10\AppData\Local\npm-cache\_npx\32026684e21afda6\node_modules\miniflare'
node scripts/test-consultation-pricing.mjs
```

Only after separate owner approval, apply **only** the new additive SQL to the dedicated Preview database, then deploy the tested package. Do not rerun initialization or any original migration:

```powershell
$package='.local-c1-package-preview-pricing-1792199612954'
$env:CLOUDFLARE_ACCOUNT_ID='f87d6f0679c6fe4c1c08af320850b52c'
npx.cmd wrangler d1 execute 734455fd-cdec-4e14-ad6f-96f80f22f3e7 --remote --env preview --config "$package/wrangler.jsonc" --file "$package/offline/018-pricing-additive.sql"
if ($LASTEXITCODE -ne 0) { throw 'STOP: inspect additive schema state; do not deploy or rerun blindly.' }
npx.cmd wrangler pages deploy "$package/public" --project-name qy-c1-consultation-preview --branch c1-bazi-consultation-development --config "$package/wrangler.jsonc"
```

After approved deployment, use invented data on a free slot, issue one RM880 code through QY, verify RM1300 → RM980 → RM880 breakdown in both languages, explicitly accept and verify PaymentPending and matching QY price/deadline. Do not modify the existing owner booking, simulate payment or mark confirmed. Roll back application code by redeploying the prior package while retaining additive schema/history; never drop tables or rewrite prices. Previously redeemed discounts remain consumed.

Commercial launch remains blocked by absent trusted payment integration and draft-only policies. Secure automated lost-link recovery is unavailable. Cloudflare Free deployed CPU, actual D1 execution/row costs and real-browser A2 validation remain unproven. No production readiness claim is made.
