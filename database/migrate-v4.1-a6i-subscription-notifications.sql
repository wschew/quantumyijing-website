-- ============================================================
-- Quantum YiJing v4.1 A6I
-- Subscription Transactional Notification Foundation
--
-- Scope:
--   Email lifecycle/service notifications only.
--   No marketing automation.
--   No payment/accounting mutation.
--   No membership mutation.
--   No subscription lifecycle mutation.
-- ============================================================

CREATE TABLE IF NOT EXISTS subscription_notification_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  subscription_id INTEGER NOT NULL,

  notification_type TEXT NOT NULL CHECK(
    notification_type IN (
      'RenewalReminder30d',
      'RenewalReminder7d',
      'PastDueNotice',
      'ExpiredNotice',
      'CancellationScheduledNotice'
    )
  ),

  channel TEXT NOT NULL DEFAULT 'email'
    CHECK(channel IN ('email')),

  recipient TEXT NOT NULL DEFAULT '',

  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK(status IN (
      'Pending',
      'Sent',
      'Failed',
      'Skipped'
    )),

  source_event_id INTEGER,

  provider_message_id TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',

  scheduled_for TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(subscription_id)
    REFERENCES subscriptions(id)
    ON DELETE CASCADE,

  FOREIGN KEY(source_event_id)
    REFERENCES subscription_events(id)
    ON DELETE SET NULL,

  UNIQUE(
    subscription_id,
    notification_type,
    channel,
    scheduled_for
  )
);

CREATE INDEX IF NOT EXISTS idx_subscription_notification_subscription
ON subscription_notification_logs(subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscription_notification_status
ON subscription_notification_logs(status);

CREATE INDEX IF NOT EXISTS idx_subscription_notification_type
ON subscription_notification_logs(notification_type);

CREATE INDEX IF NOT EXISTS idx_subscription_notification_scheduled
ON subscription_notification_logs(scheduled_for);

CREATE INDEX IF NOT EXISTS idx_subscription_notification_event
ON subscription_notification_logs(source_event_id);