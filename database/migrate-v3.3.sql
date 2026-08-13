-- Quantum YiJing® v3.3
-- YJ12 Affiliate + Registration / Commission Accounting Foundation
-- Run ONCE only after v3.2.1.
-- IMPORTANT: Apply to PREVIEW D1 first. Verify before Production.
--
-- Existing structures preserved:
--   products.affiliate_enabled
--   products.commission_type
--   products.commission_value
--   orders.affiliate_code
--   order_items pricing snapshot columns from v3.1.1
--   payments / receipts from v3.1+
--
-- This migration adds:
--   1. Registration-support fields on orders
--   2. Affiliate master records
--   3. Affiliate commission ledger
--   4. Monthly payout batches + payout items
--   5. Affiliate programme settings
--   6. Useful indexes
--
-- Commission rates are stored as percentages:
--   20 = 20%
--
-- Commission amounts are snapshotted at sale/commission creation time
-- so historical commissions are not changed by future rate changes.


-- ============================================================
-- A. ORDERS: REGISTRATION + AFFILIATE SNAPSHOT FIELDS
-- ============================================================

ALTER TABLE orders ADD COLUMN customer_country TEXT NOT NULL DEFAULT '';

ALTER TABLE orders ADD COLUMN affiliate_id INTEGER;

ALTER TABLE orders ADD COLUMN affiliate_rate REAL NOT NULL DEFAULT 0;

ALTER TABLE orders ADD COLUMN affiliate_commission REAL NOT NULL DEFAULT 0;

ALTER TABLE orders ADD COLUMN affiliate_attribution_source TEXT NOT NULL DEFAULT '';

ALTER TABLE orders ADD COLUMN affiliate_attributed_at TEXT NOT NULL DEFAULT '';


CREATE INDEX IF NOT EXISTS idx_orders_affiliate_code
  ON orders(affiliate_code);

CREATE INDEX IF NOT EXISTS idx_orders_affiliate_id
  ON orders(affiliate_id);

CREATE INDEX IF NOT EXISTS idx_orders_affiliate_status
  ON orders(affiliate_code, payment_status);


-- ============================================================
-- B. AFFILIATE MASTER
-- ============================================================

CREATE TABLE IF NOT EXISTS affiliates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  affiliate_code TEXT NOT NULL UNIQUE,

  full_name TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',

  account_type TEXT NOT NULL DEFAULT 'Individual'
    CHECK(account_type IN ('Individual','Company')),

  bank_name TEXT NOT NULL DEFAULT '',
  bank_account_name TEXT NOT NULL DEFAULT '',
  bank_account_number TEXT NOT NULL DEFAULT '',

  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK(status IN ('Pending','Approved','Rejected','Suspended','Archived')),

  commission_override REAL,

  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT NOT NULL DEFAULT '',
  rejected_at TEXT NOT NULL DEFAULT '',
  suspended_at TEXT NOT NULL DEFAULT '',

  privacy_consent INTEGER NOT NULL DEFAULT 0,
  terms_accepted INTEGER NOT NULL DEFAULT 0,
  terms_accepted_at TEXT NOT NULL DEFAULT '',

  notes TEXT NOT NULL DEFAULT '',

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX IF NOT EXISTS idx_affiliates_code
  ON affiliates(affiliate_code);

CREATE INDEX IF NOT EXISTS idx_affiliates_email
  ON affiliates(email);

CREATE INDEX IF NOT EXISTS idx_affiliates_status
  ON affiliates(status);


-- ============================================================
-- C. AFFILIATE COMMISSION LEDGER
-- ============================================================

CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  affiliate_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,

  affiliate_code TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL DEFAULT '',
  order_reference TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',

  gross_sale REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MYR',

  commission_rate REAL NOT NULL DEFAULT 0,
  commission_amount REAL NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK(status IN ('Pending','Approved','Payable','Paid','Reversed','Cancelled')),

  eligible_at TEXT NOT NULL DEFAULT '',
  approved_at TEXT NOT NULL DEFAULT '',
  payable_at TEXT NOT NULL DEFAULT '',
  paid_at TEXT NOT NULL DEFAULT '',
  reversed_at TEXT NOT NULL DEFAULT '',

  reversal_reason TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (affiliate_id) REFERENCES affiliates(id) ON DELETE RESTRICT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,

  UNIQUE(order_id, product_id, affiliate_id)
);


CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_affiliate
  ON affiliate_commissions(affiliate_id);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_order
  ON affiliate_commissions(order_id);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_status
  ON affiliate_commissions(status);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_affiliate_status
  ON affiliate_commissions(affiliate_id, status);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_created
  ON affiliate_commissions(created_at);


-- ============================================================
-- D. MONTH-END AFFILIATE PAYOUT BATCHES
-- ============================================================

CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  payout_reference TEXT NOT NULL UNIQUE,
  affiliate_id INTEGER NOT NULL,

  payout_period TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'MYR',

  eligible_sales_count INTEGER NOT NULL DEFAULT 0,
  total_sales REAL NOT NULL DEFAULT 0,
  total_commission REAL NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'Draft'
    CHECK(status IN ('Draft','Approved','Paid','Cancelled')),

  bank_name TEXT NOT NULL DEFAULT '',
  bank_account_name TEXT NOT NULL DEFAULT '',
  bank_account_last4 TEXT NOT NULL DEFAULT '',

  payment_reference TEXT NOT NULL DEFAULT '',
  payment_date TEXT NOT NULL DEFAULT '',

  statement_number TEXT NOT NULL DEFAULT '',
  statement_generated_at TEXT NOT NULL DEFAULT '',
  statement_email_sent_at TEXT NOT NULL DEFAULT '',

  notes TEXT NOT NULL DEFAULT '',

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (affiliate_id) REFERENCES affiliates(id) ON DELETE RESTRICT
);


CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_affiliate
  ON affiliate_payouts(affiliate_id);

CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_period
  ON affiliate_payouts(payout_period);

CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_status
  ON affiliate_payouts(status);


-- ============================================================
-- E. PAYOUT ↔ COMMISSION LINK
-- ============================================================

CREATE TABLE IF NOT EXISTS affiliate_payout_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  payout_id INTEGER NOT NULL,
  commission_id INTEGER NOT NULL UNIQUE,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (payout_id) REFERENCES affiliate_payouts(id) ON DELETE CASCADE,
  FOREIGN KEY (commission_id) REFERENCES affiliate_commissions(id) ON DELETE RESTRICT
);


CREATE INDEX IF NOT EXISTS idx_affiliate_payout_items_payout
  ON affiliate_payout_items(payout_id);


-- ============================================================
-- F. AFFILIATE PROGRAMME SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS affiliate_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),

  programme_enabled INTEGER NOT NULL DEFAULT 1,

  default_commission_rate REAL NOT NULL DEFAULT 20,

  referral_days INTEGER NOT NULL DEFAULT 30,

  minimum_payout REAL NOT NULL DEFAULT 0,

  commission_hold_days INTEGER NOT NULL DEFAULT 14,

  payout_frequency TEXT NOT NULL DEFAULT 'Monthly',

  customer_name_visible_to_affiliate INTEGER NOT NULL DEFAULT 1,

  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


INSERT OR IGNORE INTO affiliate_settings (
  id,
  programme_enabled,
  default_commission_rate,
  referral_days,
  minimum_payout,
  commission_hold_days,
  payout_frequency,
  customer_name_visible_to_affiliate
)
VALUES (
  1,
  1,
  20,
  30,
  0,
  14,
  'Monthly',
  1
);


-- ============================================================
-- G. YJ12 AFFILIATE DEFAULT
-- ============================================================
-- YJ12 was already created with affiliate_enabled = 1.
-- Use a percentage commission for the first Affiliate Programme.
-- Default 20% may later be changed in Admin.
--
-- We intentionally do NOT hard-lock the product commission here.
-- If commission_type/value are blank, application code should use:
--   affiliate override
--   -> product-specific rate
--   -> affiliate_settings.default_commission_rate
--
-- Existing YJ12 product remains unchanged unless these fields are blank.

UPDATE products
SET
  commission_type = CASE
    WHEN commission_type = '' THEN 'percentage'
    ELSE commission_type
  END,
  commission_value = CASE
    WHEN commission_value IS NULL THEN 20
    ELSE commission_value
  END,
  affiliate_enabled = 1,
  updated_at = CURRENT_TIMESTAMP
WHERE sku = 'YJ12';


-- ============================================================
-- H. VERIFICATION QUERIES
-- ============================================================

SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name IN (
    'affiliates',
    'affiliate_commissions',
    'affiliate_payouts',
    'affiliate_payout_items',
    'affiliate_settings'
  )
ORDER BY name;


PRAGMA table_info(orders);

PRAGMA table_info(affiliates);

PRAGMA table_info(affiliate_commissions);

PRAGMA table_info(affiliate_payouts);


SELECT
  id,
  programme_enabled,
  default_commission_rate,
  referral_days,
  minimum_payout,
  commission_hold_days,
  payout_frequency,
  customer_name_visible_to_affiliate
FROM affiliate_settings
WHERE id = 1;


SELECT
  id,
  sku,
  slug,
  affiliate_enabled,
  commission_type,
  commission_value
FROM products
WHERE sku = 'YJ12';
