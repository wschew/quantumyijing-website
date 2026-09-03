PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS payment_email_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  notification_type TEXT NOT NULL CHECK(notification_type IN ('CustomerReceipt','InternalPaymentNotice')),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Sent','Failed')),
  recipient TEXT NOT NULL DEFAULT '',
  provider_message_id TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  UNIQUE(order_id, notification_type)
);

CREATE INDEX IF NOT EXISTS idx_payment_email_notifications_order
  ON payment_email_notifications(order_id);

CREATE INDEX IF NOT EXISTS idx_payment_email_notifications_status
  ON payment_email_notifications(status);
