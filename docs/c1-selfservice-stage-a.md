# C1 Stage A self-service booking — local implementation

Local synthetic Preview only. No remote D1, secret, deployment, Git or Academy/shared changes were performed.

## Customer flow

Select a server-listed time, enter encrypted intake and contact, and click **Review price and terms**. This first call creates no booking. The server returns a five-minute HMAC-signed quote containing the selected start, approved promotional/regular price, product/practitioner and current booking-policy version/hash. The bilingual page shows the actual amount and original configured policy, then requires a separate explicit checkbox and **Accept terms and reserve appointment**.

Submission rechecks the quote signature, expiry, current price/promotion, terms, 72-hour lead time and available window. Existing guest intake/consent preparation is reused inside the same D1 batch as the immutable accepted offer, original slot reservation, PaymentPending booking, sanitized audit and private-link hash. Existing overlap triggers arbitrate competing reservations. It never records a paid or confirmed state, writes financial records or calls a provider. Preview displays payment unavailable.

Request IDs retain the existing command fingerprint. Repeated identical requests return the same booking and deterministic private link, derived with domain-separated HMAC from the existing lookup key. Only the link hash persists; key-version attribution is stored so retained lookup keys support retry after key rotation. A different payload with the same request ID is rejected. Browser uncertainty locks further submission rather than automatically creating a new request.

Legacy guest submission, administrator review/offers, private access, availability, cancellation/rescheduling and post-consultation PDF controls remain available. No administrator account or stored password hash was changed.

## Expiry and exceptions

Lazy maintenance runs on guest calendar/quote/checkout requests, with at most two expired Stage A unpaid holds handled per request. Each guarded batch advances its booking to OfferExpired, releases the reservation, preserves accepted pricing/terms history and applies the existing FinalExpired intake retention policy. There is no cron, background polling, external service or paid feature. If idle, rows stay held until the next relevant request; no expired hold becomes a confirmation.

Automatic release is limited to Stage A PaymentPending/Accepted offers with an expired deadline, no linked order and no capture-review evidence. These conditions are checked again in the same transaction. Linked orders, payment evidence and legacy offers remain on the existing QY exception path. Future trusted payment integration must extend this boundary before live payment activation; it must never release a possibly paid appointment blindly. Existing original reservation triggers continue to block overlap until a release actually commits.

Admission remains the existing separate anonymous bucket (20 attempts/hour, monotonic fail-closed clock behavior) and 200 retained synthetic requests. Public quotation does not allocate per-request database rows. Ordinary administrator authorization does not consume that admission bucket. This does not establish deployed Cloudflare Free CPU compliance.

## Database addition

`database/additive/c1-consultation-selfservice.sql` adds only consultation_selfservice_bookings and immutable-identity/history triggers, linking the existing booking and offer plus lookup-key version. Apply after guest-v1 only. Do not alter/replay the 15 pinned migrations, guest-v1 migration, promotion approval, existing offers or administrator provisioning. The package includes this as offline/017-selfservice-additive.sql. No migration has been applied remotely.

## Focused validation

`node scripts/test-consultation-selfservice.mjs`: PASS, 57 assertions. Actual locally bundled Worker, transactional SQLite adapter, synthetic records only. Two independently dispatched requests are held after preparation before competing atomic batches, then serialized by SQLite. Exactly one distinct-request reservation wins; concurrent identical requests resolve to one booking/link. Also covers RM980, RM1300 fallback, terms/price/quote changes, commit-time price race, failure rollback, idempotency, privacy, 72-hour rule, automatic expiry bounds, linked-order protection, unchanged legacy QY review, unverified-confirmation rejection and bilingual UI review/acceptance. No browser or deployed distributed scheduling/CPU claim is made.

## Files changed in this phase

- functions/lib/consultation/guest-booking.js (factor existing preparation without changing legacy submission semantics)
- functions/lib/consultation/selfservice-booking.js
- functions/lib/consultation/preview-adapter.js
- consultation-preview/customer.html
- consultation-preview/guest-booking-ui.js
- database/additive/c1-consultation-selfservice.sql
- scripts/build-consultation-pages.mjs
- scripts/test-consultation-selfservice.mjs
- docs/c1-selfservice-stage-a.md

## Next owner-approved Preview verification

Prepared package: `.local-c1-package-preview-selfservice-1792161111868`. Existing verified wrangler.jsonc is copied unchanged; Production/default remain disabled and unbound. Preserve CONSULTATION_ADMIN_SECRET, CONSULTATION_KEYRING and all current synthetic records/promotion. Review the additive SQL and package first. Only after explicit approval, the owner may run:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID='f87d6f0679c6fe4c1c08af320850b52c'
$package='.local-c1-package-preview-selfservice-1792161111868'
npx.cmd wrangler d1 execute 734455fd-cdec-4e14-ad6f-96f80f22f3e7 --remote --env preview --config "$package/wrangler.jsonc" --file "$package/offline/017-selfservice-additive.sql"
if ($LASTEXITCODE -ne 0) { throw 'STOP: inspect additive migration state; do not deploy or rerun blindly.' }
npx.cmd wrangler pages deploy "$package/public" --project-name qy-c1-consultation-preview --branch c1-bazi-consultation-development --config "$package/wrangler.jsonc"
```

Do not rerun if self-service objects already exist. Do not initialize the database again. After deployment, submit one invented guest request on an available slot: verify the displayed eligible RM980 (otherwise RM1300), explicit terms checkbox, PaymentPending receipt/private link and held slot disappearing from the calendar. Verify the QY Dashboard shows the same saved price and PaymentPending. Do not accept a second legacy offer, simulate payment or mark paid.

Trusted payment integration remains absent. Commercial confirmation and payment checkout are not enabled. Existing policies remain synthetic drafts; this package is not a real-customer launch approval. Deployed CPU and browser validation remain owner-run Preview checks.

Rollback is a redeployment of the previous approved package while retaining additive schema and all records. No table drops or record/price rewrites. The previous package lacks automatic Stage A maintenance, so QY must monitor Stage A pending holds through the exception process while rolled back.
