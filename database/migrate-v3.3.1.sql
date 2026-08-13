-- Quantum YiJing® v3.3.1
-- Affiliate Membership Renewal + 12-Month Customer Attribution
-- Run ONCE only after v3.3. Apply to PREVIEW D1 first.

-- A. Affiliate membership / renewal fields
ALTER TABLE affiliates ADD COLUMN membership_started_at TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliates ADD COLUMN membership_expires_at TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliates ADD COLUMN last_renewed_at TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliates ADD COLUMN renewal_status TEXT NOT NULL DEFAULT 'Not Due';
ALTER TABLE affiliates ADD COLUMN renewal_reminder_30d_sent_at TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliates ADD COLUMN renewal_reminder_7d_sent_at TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliates ADD COLUMN expiry_notice_sent_at TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_affiliates_membership_expiry
  ON affiliates(membership_expires_at);
CREATE INDEX IF NOT EXISTS idx_affiliates_renewal_status
  ON affiliates(renewal_status);

-- B. Customer attribution
CREATE TABLE IF NOT EXISTS affiliate_customer_attribution (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  affiliate_id INTEGER NOT NULL,
  affiliate_code TEXT NOT NULL,
  first_order_id INTEGER,
  first_order_reference TEXT NOT NULL DEFAULT '',
  first_referred_at TEXT NOT NULL DEFAULT '',
  attribution_started_at TEXT NOT NULL,
  attribution_expires_at TEXT NOT NULL,
  last_referred_at TEXT NOT NULL DEFAULT '',
  last_order_id INTEGER,
  status TEXT NOT NULL DEFAULT 'Active'
    CHECK(status IN ('Active','Expired','Replaced','Revoked')),
  attribution_source TEXT NOT NULL DEFAULT 'Affiliate Purchase',
  replaced_by_affiliate_id INTEGER,
  replaced_at TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (affiliate_id) REFERENCES affiliates(id) ON DELETE RESTRICT,
  FOREIGN KEY (first_order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (last_order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (replaced_by_affiliate_id) REFERENCES affiliates(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_customer_active_email
  ON affiliate_customer_attribution(customer_email)
  WHERE status = 'Active';
CREATE INDEX IF NOT EXISTS idx_affiliate_customer_affiliate
  ON affiliate_customer_attribution(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_customer_expiry
  ON affiliate_customer_attribution(attribution_expires_at);
CREATE INDEX IF NOT EXISTS idx_affiliate_customer_status
  ON affiliate_customer_attribution(status);
CREATE INDEX IF NOT EXISTS idx_affiliate_customer_code
  ON affiliate_customer_attribution(affiliate_code);

-- C. Settings
ALTER TABLE affiliate_settings ADD COLUMN affiliate_membership_months INTEGER NOT NULL DEFAULT 12;
ALTER TABLE affiliate_settings ADD COLUMN customer_attribution_months INTEGER NOT NULL DEFAULT 12;
ALTER TABLE affiliate_settings ADD COLUMN renewal_reminder_30_days INTEGER NOT NULL DEFAULT 1;
ALTER TABLE affiliate_settings ADD COLUMN renewal_reminder_7_days INTEGER NOT NULL DEFAULT 1;
ALTER TABLE affiliate_settings ADD COLUMN expiry_notice_enabled INTEGER NOT NULL DEFAULT 1;

UPDATE affiliate_settings
SET
  affiliate_membership_months = CASE WHEN affiliate_membership_months <= 0 THEN 12 ELSE affiliate_membership_months END,
  customer_attribution_months = CASE WHEN customer_attribution_months <= 0 THEN 12 ELSE customer_attribution_months END,
  updated_at = CURRENT_TIMESTAMP
WHERE id = 1;

-- D. Verification
SELECT id, programme_enabled, default_commission_rate, referral_days,
       affiliate_membership_months, customer_attribution_months,
       renewal_reminder_30_days, renewal_reminder_7_days, expiry_notice_enabled
FROM affiliate_settings
WHERE id = 1;

SELECT name
FROM sqlite_master
WHERE type='table' AND name='affiliate_customer_attribution';
