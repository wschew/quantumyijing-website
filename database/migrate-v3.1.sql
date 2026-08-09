-- Quantum YiJing v3.1
-- Unified Payment & Accounting Foundation
-- Run ONCE only after v3.0.2a.

ALTER TABLE payments ADD COLUMN payment_method TEXT NOT NULL DEFAULT '';
ALTER TABLE payments ADD COLUMN gross_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN provider_fee REAL NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN net_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN settlement_date TEXT NOT NULL DEFAULT '';
ALTER TABLE payments ADD COLUMN bank_received_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE payments ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'Unverified';
ALTER TABLE payments ADD COLUMN verified_at TEXT NOT NULL DEFAULT '';
ALTER TABLE payments ADD COLUMN customer_receipt_issuer TEXT NOT NULL DEFAULT '';
ALTER TABLE payments ADD COLUMN notes TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_payments_status_method
  ON payments(status, payment_method);

CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_number TEXT NOT NULL UNIQUE,
  order_id INTEGER NOT NULL,
  payment_id INTEGER NOT NULL,
  issuer TEXT NOT NULL DEFAULT 'Quantum YiJing',
  document_type TEXT NOT NULL DEFAULT 'Receipt',
  customer_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MYR',
  issue_date TEXT NOT NULL DEFAULT '',
  receipt_status TEXT NOT NULL DEFAULT 'Not Issued',
  external_document_reference TEXT NOT NULL DEFAULT '',
  pdf_path TEXT NOT NULL DEFAULT '',
  email_sent_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_receipts_order ON receipts(order_id);
CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(receipt_status);

-- Backfill legacy payment rows so v2.9/v3.0 records remain meaningful.
UPDATE payments
SET
  payment_method = CASE
    WHEN lower(provider) LIKE '%senang%' THEN 'SenangPay'
    WHEN lower(provider) LIKE '%google%' THEN 'Google Play Books'
    WHEN lower(provider) LIKE '%bank%' THEN 'Bank Transfer'
    WHEN lower(provider) LIKE '%manual%' THEN 'Manual'
    ELSE provider
  END,
  gross_amount = CASE WHEN gross_amount = 0 THEN amount ELSE gross_amount END,
  net_amount = CASE WHEN net_amount = 0 THEN amount ELSE net_amount END,
  bank_received_amount = CASE WHEN bank_received_amount = 0 THEN amount ELSE bank_received_amount END,
  verification_status = CASE
    WHEN status IN ('Paid','External') THEN 'Verified'
    ELSE verification_status
  END,
  customer_receipt_issuer = CASE
    WHEN customer_receipt_issuer != '' THEN customer_receipt_issuer
    WHEN lower(provider) LIKE '%google%' THEN 'External Platform'
    WHEN status = 'External' THEN 'External Platform'
    ELSE 'Quantum YiJing'
  END;

SELECT name FROM sqlite_master
WHERE type='table' AND name='receipts';

SELECT id, order_id, provider, payment_method, gross_amount, provider_fee,
       net_amount, bank_received_amount, verification_status,
       customer_receipt_issuer
FROM payments
ORDER BY id DESC
LIMIT 10;
