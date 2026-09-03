-- Quantum YiJing v3.4.1g3
-- Coach Payout Recovery (Preview D1 only)
--
-- Purpose:
--   Recreate the two missing coach payout tables after the accidental DROP,
--   restore the known MYR 5.00 paid test payout and its payout item,
--   and retain the supplementary-payout design by NOT restoring
--   UNIQUE(coach_id, payout_period).
--
-- IMPORTANT:
--   1) Run on PREVIEW D1 only.
--   2) Create a D1 Time Travel bookmark immediately before running this file.
--   3) This script assumes coach_payouts and coach_payout_items are currently missing.
--   4) It does not touch coaches, coach assignments, products, orders, payments,
--      affiliates, enquiries, or any other tables.

CREATE TABLE IF NOT EXISTS coach_payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL,
  payout_period TEXT NOT NULL,
  payout_reference TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL DEFAULT 'MYR',
  course_revenue REAL NOT NULL DEFAULT 0,
  service_revenue REAL NOT NULL DEFAULT 0,
  total_commission REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Draft'
    CHECK(status IN ('Draft','Approved','Paid','Cancelled')),
  approved_at TEXT DEFAULT '',
  payment_date TEXT DEFAULT '',
  payment_reference TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(coach_id) REFERENCES coaches(id)
);

CREATE TABLE IF NOT EXISTS coach_payout_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payout_id INTEGER NOT NULL,
  coach_id INTEGER NOT NULL,
  source_type TEXT NOT NULL
    CHECK(source_type IN ('Course','Service')),
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

CREATE INDEX IF NOT EXISTS idx_coach_payouts_coach_period
ON coach_payouts(coach_id,payout_period);

CREATE INDEX IF NOT EXISTS idx_coach_payouts_status_period
ON coach_payouts(status,payout_period);

CREATE INDEX IF NOT EXISTS idx_coach_payout_items_payout
ON coach_payout_items(payout_id);

INSERT OR IGNORE INTO coach_payouts (
  id, coach_id, payout_period, payout_reference, currency,
  course_revenue, service_revenue, total_commission, status,
  approved_at, payment_date, payment_reference, notes
) VALUES (
  1, 1, '2026-08', 'COACHPAY-202608-C01-8645591B', 'MYR',
  0, 0, 5, 'Paid', '', '2026-08-26',
  'TEST-BANK-20260826-001',
  'Recovered by v3.4.1g3 after Preview D1 coach payout table recovery.'
);

INSERT OR IGNORE INTO coach_payout_items (
  id, payout_id, coach_id, source_type, source_id, source_period,
  description, eligible_revenue, commission_rate,
  commission_fixed_amount, commission_amount
) VALUES (
  1, 1, 1, 'Course', 4, '2026-08',
  'COACH-TEST-01 · Coach Payout Test',
  0, 30, 5, 5
);

SELECT name, sql
FROM sqlite_master
WHERE type='table'
  AND name IN ('coach_payouts','coach_payout_items')
ORDER BY name;

SELECT
  id, coach_id, payout_period, payout_reference, currency,
  total_commission, status, payment_date, payment_reference
FROM coach_payouts
ORDER BY id;

SELECT
  id, payout_id, coach_id, source_type, source_id, source_period,
  description, eligible_revenue, commission_rate,
  commission_fixed_amount, commission_amount
FROM coach_payout_items
ORDER BY id;
