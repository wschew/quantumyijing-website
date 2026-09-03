PRAGMA foreign_keys=ON;

ALTER TABLE payments ADD COLUMN accounting_eligible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN accounting_eligible_at TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS payment_verification_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  payment_id INTEGER,
  verification_method TEXT NOT NULL CHECK(verification_method IN ('Automatic','Manual')),
  verification_source TEXT NOT NULL DEFAULT '',
  verified_by TEXT NOT NULL DEFAULT '',
  verification_status TEXT NOT NULL CHECK(verification_status IN ('Verified','Rejected','Review')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY(payment_id) REFERENCES payments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_verification_events_order ON payment_verification_events(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_verification_events_payment ON payment_verification_events(payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_accounting_eligible ON payments(accounting_eligible,accounting_eligible_at);
