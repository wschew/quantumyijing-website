-- Quantum YiJing v3.3.5
-- Payment & Accounting Cleanup
-- Apply to PREVIEW D1 first.

ALTER TABLE payments ADD COLUMN settlement_status TEXT DEFAULT 'Pending';
ALTER TABLE payments ADD COLUMN reconciled_at TEXT;

-- Normalize legacy verification value.
UPDATE payments
SET settlement_status = 'Reconciled',
    reconciled_at = COALESCE(verified_at, CURRENT_TIMESTAMP),
    verification_status = 'Verified'
WHERE verification_status = 'Reconciled';

-- Existing records that already have bank received + settlement date
-- can be treated as Settled unless they were already marked Reconciled.
UPDATE payments
SET settlement_status = 'Settled'
WHERE COALESCE(settlement_status,'Pending') = 'Pending'
  AND bank_received_amount IS NOT NULL
  AND settlement_date IS NOT NULL
  AND settlement_date <> '';
