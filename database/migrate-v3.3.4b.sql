-- Quantum YiJing® v3.3.4b
-- Product & Affiliate Administration Controls
-- Run ONCE on PREVIEW D1 first.

ALTER TABLE affiliates ADD COLUMN portal_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE affiliates ADD COLUMN admin_status_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliates ADD COLUMN admin_status_updated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliates ADD COLUMN admin_status_updated_by TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliates ADD COLUMN last_portal_disabled_at TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliates ADD COLUMN last_portal_enabled_at TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_affiliates_status_portal
ON affiliates(status, portal_enabled);

SELECT id,affiliate_code,full_name,status,portal_enabled,
       membership_expires_at,admin_status_reason
FROM affiliates
ORDER BY id;
