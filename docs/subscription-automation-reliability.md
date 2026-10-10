# Subscription automation operational contract

R4 local hardening; no activation or migration is authorized by this document.

## Provider evidence and delivery guarantee

Official Resend SDK documentation/source confirms that email creation (`/emails`)
accepts `Idempotency-Key`:
- https://github.com/resend/resend-node/blob/main/src/common/interfaces/idempotent-request.interface.ts
- https://github.com/resend/resend-node/blob/main/src/emails/emails.ts
- https://github.com/resend/resend-node/blob/main/src/resend.ts

Inspected 2026-10-09. The documentation website could not be read through the
available network policy. Retention and exactly-once guarantees were NOT verified.
Do not claim exactly-once delivery, including mailbox delivery.

Event-based notices use `event:<source_event_id>` in the durable log's
`scheduled_for` identity slot; candidate/preview timestamps and source events are
unchanged. Reminder logs retain the exact period-date identity. The admin analytics response projects the source event timestamp for new event
identities, preserving its existing `scheduled_for` date presentation. Direct SQL
consumers must treat the stored event `scheduled_for` as an identity, not a date. A partial unique event index also prevents duplicate
logs for the same subscription/type/channel/event. Separate events at the same
second have separate logs and provider keys.

Historical logs are not rewritten and keys are never regenerated. An existing log
with the exact source event ID is reused regardless of timestamp format. A
matching timestamp-only historical event log blocks automatic sending: Sent and
Skipped stay terminal, and uncertain logs are held for reconciliation. It cannot
establish which of multiple same-second events was processed. The
`legacyEventIdentityUnknown` counter reports that ambiguity for operator review;
never assign or replay these events automatically.

Each notification log gets a stored random immutable provider key and exact
serialized payload. Only explicit HTTP 429 rejection retries automatically, after
the existing six-hour delay, with a maximum of three dispatches. Other permanent
4xx failures stop. Transport errors, 408/409/5xx, invalid success bodies, process
loss after dispatch and Sent-update failures require reconciliation. An expired
in-flight lease is never automatically resent, regardless of elapsed time or key
retention. Legacy Pending/Failed logs without delivery state are likewise held.

A two-hour lease preserves existing Preview timing. Claimed-but-not-dispatched
work can be reclaimed after expiry. Sending work is quarantined instead. Updates
require the exact lease token and matching state, preventing stale completion from
overwriting newer processing. Dispatch and normal completion also require a
fresh-clock, unexpired lease. Accepted completion after expiry is reconciled with
the provider ID when the same attempt still owns the row; it is never blindly Sent.
A run scans at most 100 expired Sending rows independently of current candidate
eligibility, fencing each update by its observed token and lease. Preview only
counts them. `expiredReconciled`, remaining `expiredSending`, and reconciliation
states remain visible and trigger attention even when no candidates qualify. New logs and delivery state are inserted atomically.

### Ambiguous delivery recovery

Review the delivery state's reason and retained provider ID, if available.
An authorized operator must reconcile provider acceptance using provider records
or webhooks (not executed or implemented here). Confirm acceptance before marking
Sent; confirm nonacceptance before authorizing a new send. Never reset ambiguous
rows or rotate their key merely to retry. No reconciliation mutation endpoint is
introduced in R4. Persisted payloads contain customer information; restrict access,
define retention and never log/export them. Stored keys contain no personal data.

## Existing business rules retained

Authenticated request `event_not_before` takes precedence over the environment in
both run and preview. Run requires a valid cutoff; preview may omit it. This is
existing scheduler compatibility, not a new authorization bypass. Operators must
approve the cutoff; it controls lifecycle notices, not renewal reminders.

Catch-up records Active -> PastDue -> Expired, but notices qualify against current
status: only Expired is sent after complete catch-up. CancellationScheduledNotice
is a scheduling confirmation, not an actual cancellation-completion notice.

P1 policy corrections: new verified-order renewals on zero-grace plans persist
an explicit grace boundary equal to the renewed period end, matching manual
renewal. Historical blank grace is never inferred as zero grace or repaired;
blank grace still does not expire PastDue. Cancellation retains priority, and
zero-grace catch-up retains both past_due and expired audit events.

Pending enrollment still permits blank dates. Activation, resumption and entry
into PastDue require valid period start/end timestamps with end strictly later
than start. Validation accepts ISO dates, zoned ISO timestamps and legacy SQLite
UTC timestamps. Existing transaction snapshot guards include both boundaries;
a concurrent date change rejects the stale write without creating an event.
Invalid historical Active/PastDue records are annotated with periodDateIssues
in authenticated admin list/detail responses, without writes. Lists retain their
existing 500-row limit. Lifecycle preview/run reports invalid periods when a
candidate would enter PastDue; independent cancellation and terminal expiry are
not blocked by this validation. No dates or entitlements are inferred or restored.

## Backlogs, monitoring and activation

Lifecycle supports authenticated `after_id` pagination, retaining the default
first-500 behavior. The worker traverses up to five pages, including failed pages,
and independently attempts notifications. `failed`, `hasMore`, and cursor counters
remain visible. More than 2500 persistent failures can still starve later IDs on
future hourly runs because automatic cycles restart at zero. `hasMore` now triggers
attention and the worker returns `nextAfterId`. The minimal recovery is an
explicit, separately approved run starting at that cursor through
`SUBSCRIPTION_LIFECYCLE_AFTER_ID` (a nonnegative safe integer), then resetting it
to zero after draining so lower IDs are revisited. This setting does not persist
or advance automatically, and must not be left fixed as a permanent schedule.
A durable fairness design remains separately approvable; R4 does not implement one. Notification candidate queries
exclude permanent/quarantined and legacy uncertain records before their limit.

Requests have bounded timeouts. Worker logs contain numeric summaries, not response
bodies, recipients, provider payloads or secrets. Alert on failure counts, remaining
backlog, reconciliation/permanent states, legacy uncertain logs, and missed cycles.
An alert destination/infrastructure is not provisioned here. Provider acceptance
is not delivery confirmation; bounce/delivery webhook reconciliation remains open.

`wrangler.production.template.jsonc` has no crons, no endpoints or secrets and an
explicit disabled flag. Keep it disabled until account ownership, approved identical
HTTPS Production origin, matching ADMIN_TOKEN, correct Pages D1 binding, schema,
verified sender, cutoff, alerting and rollback/recovery approval are verified.
No Production URL or credential is inferred. Preview retains its existing targets.

The additive `migrate-v4.1-r4-notification-delivery.sql` is required before deploying
notification code. Its partial event uniqueness index requires a read-only
preflight for any historical duplicates:

```sql
SELECT COUNT(*) AS duplicate_groups FROM (
  SELECT subscription_id,notification_type,channel,source_event_id
  FROM subscription_notification_logs WHERE source_event_id IS NOT NULL
  GROUP BY subscription_id,notification_type,channel,source_event_id
  HAVING COUNT(*)>1
);
```

If nonzero, stop migration planning and reconcile audit history with separate
approval; do not delete rows automatically. The migration adds a lease scan index
and changes no historical records or the original timestamp uniqueness constraint.
It is prepared only; no operational database migration was run.
Tests construct ephemeral synthetic schemas only. Downgrade must not run an old
notification sender against ambiguous rows: it lacks these quarantine protections.
Marketing, WhatsApp, CRM, payment/accounting and independent entitlements are not
changed. Shared provider credentials/rate limits remain an operational dependency.

## Local pagination harness correction

The 500-row failure double threw synchronously rather than behaving like D1's
asynchronous transaction rejection. In an isolated A/B reproduction, both frozen
and real `Date.now()` failed on the next localhost request with `UND_ERR_SOCKET`;
yielding an event-loop turn passed. Modeling the failure as an asynchronous
rejection after `setImmediate` also passed. The harness now uses that transport
boundary; it does not retry HTTP requests, hide failures or change application
pagination. Deterministic assertions still require 500 failures followed by the
501st row's successful transition. This demonstrates a local transport/failure-
injector interaction, not a production pagination defect or a resource-limit diagnosis.
