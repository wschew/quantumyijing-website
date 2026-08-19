PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS generic_payment_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL UNIQUE,
  payment_purpose TEXT NOT NULL DEFAULT 'General Payment',
  customer_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_generic_payment_requests_order
  ON generic_payment_requests(order_id);
