-- Quantum YiJing® v3.4.1 — Coach Portal + Month-End Payout Workflow
-- Run AFTER v3.4.0 / v3.4.0a migrations on PREVIEW D1.
-- Does NOT modify Affiliate, orders, payments, receipts or customer accounting tables.

CREATE TABLE IF NOT EXISTS coach_payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL,
  payout_period TEXT NOT NULL,
  payout_reference TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL DEFAULT 'MYR',
  course_revenue REAL NOT NULL DEFAULT 0,
  service_revenue REAL NOT NULL DEFAULT 0,
  total_commission REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Approved','Paid','Cancelled')),
  approved_at TEXT DEFAULT '',
  payment_date TEXT DEFAULT '',
  payment_reference TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(coach_id,payout_period),
  FOREIGN KEY(coach_id) REFERENCES coaches(id)
);

CREATE TABLE IF NOT EXISTS coach_payout_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payout_id INTEGER NOT NULL,
  coach_id INTEGER NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('Course','Service')),
  source_id INTEGER NOT NULL,
  source_period TEXT NOT NULL,
  description TEXT DEFAULT '',
  eligible_revenue REAL NOT NULL DEFAULT 0,
  commission_rate REAL NOT NULL DEFAULT 0,
  commission_fixed_amount REAL NOT NULL DEFAULT 0,
  commission_amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_type,source_id,source_period),
  FOREIGN KEY(payout_id) REFERENCES coach_payouts(id),
  FOREIGN KEY(coach_id) REFERENCES coaches(id)
);

CREATE INDEX IF NOT EXISTS idx_coach_payouts_period ON coach_payouts(payout_period);
CREATE INDEX IF NOT EXISTS idx_coach_payouts_status ON coach_payouts(status);
CREATE INDEX IF NOT EXISTS idx_coach_payout_items_payout ON coach_payout_items(payout_id);
CREATE INDEX IF NOT EXISTS idx_coach_payout_items_source ON coach_payout_items(source_type,source_id,source_period);
