# C1 guest-request MVP — local Preview handoff

Local synthetic Preview only. No remote operations were performed. Secure C1 administrator login, existing keyring, account version, 15 pinned migrations and shared/Academy services are unchanged by this phase.

## Behavior

- `/customer.html` immediately presents the encrypted-intake request form and dated availability calendar. No account, OTP, outbox or synthetic-session setup is used.
- Calendar slots are 90 minutes, start on half-hour boundaries, require at least 72 hours lead time, and cover a bounded 31-day horizon. Preferred times are requests, not reservations. QY retains the existing availability editor, offer issuance and SQL reservation/conflict guards.
- Each request creates only an opaque canonical customer row in the dedicated Preview DB, not a login/account or verified-contact record. Name, birth details, questions and unverified contact remain in the existing AES-GCM encrypted intake. Consent evidence uses the existing version/hash tables. QY reads the intake through the existing authenticated and audited route.
- QY reviews the booking, proposes a time, then selects **Create private offer link**. Share that link privately with the intended test participant. It grants access only to that offer's time, amount, policy, deadline and acceptance; never private intake, customer contacts, other bookings or Zoom details. Possession is not proof of identity/contact ownership.
- Link material is 256-bit random, only its hash is stored, and it expires with the existing 48-hour offer. Replacement invalidates the earlier link. The fragment is removed from the browser address immediately and submitted only in same-origin POST bodies. No browser storage, automatic email or WhatsApp delivery is used.
- Acceptance atomically records immutable offer acceptance and PaymentPending. Duplicate acceptance is safe. Existing trusted-payment evidence and SQL guards remain mandatory for confirmation. There is no payment adapter in this Preview; no unsupported administrator declaration can mark the booking paid.
- Existing post-consultation administrative PDF metadata and intake retention paths support both legacy and guest intake links through an additive view.

## Database addition

`database/additive/c1-consultation-guest.sql` adds guest intake linkage, booking-specific offer-link hashes, sanitized events, a singleton anonymous admission bucket and a view combining old/new intake links. It does not rewrite any existing table, alter the existing migration ledger or manufacture verified contacts. Guest admission is limited to 20 attempts/hour and 200 retained guest requests in this synthetic Preview. Backward database-clock movement fails closed. Anonymous exhaustion does not consume QY login or control budgets. Do not delete consent/audit/booking records to bypass the cap. A retention-reviewed cleanup procedure and real-customer policies are required before commercial activation.

## Focused verification

`node scripts/test-consultation-guest-mvp.mjs` builds a new isolated package and runs one integrated synthetic Worker/SQLite test. Final result: 53 assertions passed, 0 failed. Includes calendar privacy, adult/lead-time checks, encryption, guest submission without portal session, QY authorization/CSRF, overlap rollback, scoped link rotation/expiry, acceptance rollback/idempotency, PaymentPending, unpaid-confirmation blocking, guest admission exhaustion and preserved administrator hash/15 pins.

This is a local bundled Worker test under Node with a transactional SQLite D1 adapter, not a browser or remote Cloudflare test. It does not establish deployed Free CPU compliance. The current six-purpose keyring and legacy Preview gates remain unchanged for compatibility, even though the active guest journey does not use OTP or mock delivery.

## Minimum owner-approved deployment sequence

Use only the dedicated Preview project/account/database. First review and approve the additive SQL. Do not rerun initialization, original migrations or administrator provisioning. If execution fails or any guest object already exists, stop and inspect before rerunning; the addition is intentionally not an unguarded idempotent reinitializer.

From the repository root, substitute the package directory reported by the integrated test (its verified configuration is copied locally after the test):

```powershell
$env:CLOUDFLARE_ACCOUNT_ID='f87d6f0679c6fe4c1c08af320850b52c'
$package='.local-c1-package-preview-guest-mvp-1792138997861'
npx.cmd wrangler d1 execute 734455fd-cdec-4e14-ad6f-96f80f22f3e7 --remote --env preview --config "$package/wrangler.jsonc" --command "SELECT database_id,origin,enabled,synthetic_only FROM consultation_preview_environment WHERE id=1; SELECT COUNT(*) AS pinnedMigrations FROM consultation_migration_ledger; SELECT name FROM sqlite_master WHERE name LIKE 'consultation_guest_%';"
```

Proceed only if the exact UUID/approved branch origin match, enabled=1, synthetic_only=1, pinnedMigrations=15 and no guest objects exist. Then separately authorize and apply only the additive file, followed by the new package:

```powershell
npx.cmd wrangler d1 execute 734455fd-cdec-4e14-ad6f-96f80f22f3e7 --remote --env preview --config "$package/wrangler.jsonc" --file "$package/offline/016-guest-additive.sql"
# Continue only if the additive import succeeds. Otherwise STOP before deployment.
npx.cmd wrangler pages deploy "$package/public" --project-name qy-c1-consultation-preview --branch c1-bazi-consultation-development --config "$package/wrangler.jsonc"
```

Wrangler's SQL-file execution is documented at https://developers.cloudflare.com/workers/wrangler/commands/d1/ . Do not upload or alter secrets; preserve CONSULTATION_ADMIN_SECRET and CONSULTATION_KEYRING. Production/default remain disabled and unbound. No remote command in this document was executed during implementation.

Open the clean branch alias `/customer.html` for invented adult details. In `/qy.html`, use the existing administrator login, review the request, approve/propose a time and create the private offer link. Accepting remains PaymentPending; trusted finance integration must be approved separately before a commercial confirmed booking is possible.

Rollback: redeploy the previous approved package, retaining the additive tables and all new records. Do not drop tables or reinitialize D1. The previous package will not display guest requests; QY must preserve/follow up any submitted request before reverting operational use.
