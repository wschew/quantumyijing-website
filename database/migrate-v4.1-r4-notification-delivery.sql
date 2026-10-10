-- Additive delivery state. Existing legacy notification rows are not rewritten.
CREATE TABLE subscription_notification_delivery (
  log_id INTEGER PRIMARY KEY REFERENCES subscription_notification_logs(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('Ready','Claimed','Sending','Retryable','Sent','Permanent','Reconcile')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT NOT NULL DEFAULT '',
  lease_until TEXT NOT NULL DEFAULT '',
  first_attempt_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  provider_message_id TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_subscription_notification_delivery_state ON subscription_notification_delivery(state,updated_at);

-- Event-specific scheduled_for identities retain the original unique log constraint.
-- Partial uniqueness protects immutable event identity even if its timestamp changes.
-- Preflight must reject historical duplicate (subscription,type,channel,event) rows
-- before applying; never delete/deduplicate audit rows automatically.
CREATE UNIQUE INDEX idx_subscription_notification_event_identity
ON subscription_notification_logs(subscription_id,notification_type,channel,source_event_id)
WHERE source_event_id IS NOT NULL;
CREATE INDEX idx_subscription_notification_delivery_lease
ON subscription_notification_delivery(state,lease_until,log_id);
