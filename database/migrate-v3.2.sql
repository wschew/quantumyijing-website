-- Quantum YiJing v3.2
-- Secure SenangPay payment integration foundation.
-- Run ONCE only after v3.1.1.

ALTER TABLE payments ADD COLUMN gateway_mode TEXT NOT NULL DEFAULT '';
ALTER TABLE payments ADD COLUMN gateway_message TEXT NOT NULL DEFAULT '';
ALTER TABLE payments ADD COLUMN gateway_hash_verified INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS payment_gateway_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT '',
  order_reference TEXT NOT NULL DEFAULT '',
  transaction_id TEXT NOT NULL DEFAULT '',
  status_id TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  hash_received TEXT NOT NULL DEFAULT '',
  hash_verified INTEGER NOT NULL DEFAULT 0,
  gateway_mode TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gateway_events_order
  ON payment_gateway_events(order_reference, provider);

CREATE INDEX IF NOT EXISTS idx_gateway_events_transaction
  ON payment_gateway_events(transaction_id, provider);

SELECT name FROM sqlite_master
WHERE type='table' AND name='payment_gateway_events';

PRAGMA table_info(payments);
