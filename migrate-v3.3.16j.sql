
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS affiliate_terms_versions (
  version TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

UPDATE affiliate_terms_versions SET is_current=0;

INSERT INTO affiliate_terms_versions(version,title,effective_date,is_current)
VALUES(
  'QY-AFF-2026-08-V1',
  'Quantum YiJing Affiliate Program Terms & Conditions',
  '2026-08-23',
  1
)
ON CONFLICT(version) DO UPDATE SET
  title=excluded.title,
  effective_date=excluded.effective_date,
  is_current=1;

CREATE TABLE IF NOT EXISTS affiliate_application_compliance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id INTEGER,
  email_normalized TEXT NOT NULL UNIQUE,
  nationality TEXT NOT NULL DEFAULT '',
  identification_type TEXT NOT NULL DEFAULT '',
  identification_number TEXT NOT NULL DEFAULT '',
  identification_last4 TEXT NOT NULL DEFAULT '',
  identification_hash TEXT NOT NULL DEFAULT '',
  terms_version TEXT NOT NULL DEFAULT '',
  terms_accepted_at TEXT NOT NULL DEFAULT '',
  terms_ip_country TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (affiliate_id) REFERENCES affiliates(id) ON DELETE SET NULL,
  FOREIGN KEY (terms_version) REFERENCES affiliate_terms_versions(version) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_affiliate_compliance_affiliate
  ON affiliate_application_compliance(affiliate_id);

CREATE TABLE IF NOT EXISTS affiliate_customer_attributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id INTEGER NOT NULL,
  customer_email_normalized TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL DEFAULT '',
  first_order_id INTEGER,
  first_order_reference TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active'
    CHECK(status IN ('Active','Expired','Reassigned')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (affiliate_id) REFERENCES affiliates(id) ON DELETE RESTRICT,
  FOREIGN KEY (first_order_id) REFERENCES orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_affiliate_customer_attributions_affiliate
  ON affiliate_customer_attributions(affiliate_id,status);

CREATE INDEX IF NOT EXISTS idx_affiliate_customer_attributions_expiry
  ON affiliate_customer_attributions(expires_at,status);
