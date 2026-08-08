-- Quantum YiJing v2.7 — Digital Business Platform / Marketing Foundation
-- Run once after v2.6 migrations. CREATE TABLE statements are re-runnable.

CREATE TABLE IF NOT EXISTS enquiry_attribution (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_id INTEGER NOT NULL UNIQUE,
  marketing_source TEXT NOT NULL DEFAULT 'Website',
  campaign_code TEXT NOT NULL DEFAULT '',
  landing_page TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  utm_content TEXT NOT NULL DEFAULT '',
  affiliate_code TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (enquiry_id) REFERENCES enquiries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_attribution_source ON enquiry_attribution(marketing_source);
CREATE INDEX IF NOT EXISTS idx_attribution_campaign ON enquiry_attribution(campaign_code);
CREATE INDEX IF NOT EXISTS idx_attribution_affiliate ON enquiry_attribution(affiliate_code);

CREATE TABLE IF NOT EXISTS content_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_type TEXT NOT NULL CHECK(content_type IN ('event','promotion','news','landing')),
  slug TEXT NOT NULL UNIQUE,
  title_en TEXT NOT NULL,
  title_zh TEXT NOT NULL DEFAULT '',
  summary_en TEXT NOT NULL DEFAULT '',
  summary_zh TEXT NOT NULL DEFAULT '',
  body_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Published','Archived')),
  starts_at TEXT NOT NULL DEFAULT '',
  ends_at TEXT NOT NULL DEFAULT '',
  external_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_content_type_status ON content_items(content_type,status);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  product_type TEXT NOT NULL CHECK(product_type IN ('course','membership','consultation','ebook','digital','physical','event','other')),
  name_en TEXT NOT NULL,
  name_zh TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  description_zh TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Active','Inactive','Archived')),
  price REAL,
  currency TEXT NOT NULL DEFAULT 'MYR',
  sales_channel TEXT NOT NULL DEFAULT 'Website',
  payment_provider TEXT NOT NULL DEFAULT 'SenangPay',
  external_purchase_url TEXT NOT NULL DEFAULT '',
  senangpay_enabled INTEGER NOT NULL DEFAULT 0,
  affiliate_enabled INTEGER NOT NULL DEFAULT 0,
  commission_type TEXT NOT NULL DEFAULT '',
  commission_value REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_products_type_status ON products(product_type,status);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  medium TEXT NOT NULL DEFAULT '',
  target_slug TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Active','Paused','Completed','Archived')),
  starts_at TEXT NOT NULL DEFAULT '',
  ends_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_campaign_status ON campaigns(status);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_reference TEXT NOT NULL UNIQUE,
  enquiry_id INTEGER,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'MYR',
  subtotal REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  sales_channel TEXT NOT NULL DEFAULT 'Website',
  payment_provider TEXT NOT NULL DEFAULT 'SenangPay',
  payment_status TEXT NOT NULL DEFAULT 'Pending' CHECK(payment_status IN ('Pending','Paid','Failed','Cancelled','Refunded','External')),
  campaign_code TEXT NOT NULL DEFAULT '',
  affiliate_code TEXT NOT NULL DEFAULT '',
  external_order_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (enquiry_id) REFERENCES enquiries(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_campaign ON orders(campaign_code);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_transaction_id TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MYR',
  status TEXT NOT NULL DEFAULT 'Pending',
  raw_reference TEXT NOT NULL DEFAULT '',
  paid_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
