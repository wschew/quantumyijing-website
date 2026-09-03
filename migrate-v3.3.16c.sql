
PRAGMA foreign_keys=ON;

ALTER TABLE generic_payment_requests
  ADD COLUMN affiliate_code TEXT NOT NULL DEFAULT '';

ALTER TABLE generic_payment_requests
  ADD COLUMN affiliate_test_mode INTEGER NOT NULL DEFAULT 0;

ALTER TABLE generic_payment_requests
  ADD COLUMN affiliate_test_rate REAL NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_generic_payment_requests_affiliate
  ON generic_payment_requests(affiliate_code);
