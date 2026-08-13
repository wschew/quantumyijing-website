-- Quantum YiJing® v3.3.2
-- Affiliate Application & Administration support
-- Run ONCE after v3.3.1.
--
-- The v3.3/v3.3.1 schema already contains the required affiliate fields.
-- This migration adds an application lookup index only.

CREATE INDEX IF NOT EXISTS idx_affiliates_email_status
  ON affiliates(email,status);

SELECT name FROM sqlite_master
WHERE type='index' AND name='idx_affiliates_email_status';
