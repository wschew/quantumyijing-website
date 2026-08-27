-- Quantum YiJing v3.4.1g1
-- Allow supplementary coach payout batches in the same payout month.

PRAGMA foreign_keys=OFF;

CREATE TABLE coach_payouts_new (
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
  FOREIGN KEY(coach_id) REFERENCES coaches(id)
);

INSERT INTO coach_payouts_new (
  id, coach_id, payout_period, payout_reference, currency,
  course_revenue, service_revenue, total_commission, status,
  approved_at, payment_date, payment_reference, notes,
  created_at, updated_at
)
SELECT
  id, coach_id, payout_period, payout_reference, currency,
  course_revenue, service_revenue, total_commission, status,
  approved_at, payment_date, payment_reference, notes,
  created_at, updated_at
FROM coach_payouts;

DROP TABLE coach_payouts;
ALTER TABLE coach_payouts_new RENAME TO coach_payouts;

CREATE INDEX IF NOT EXISTS idx_coach_payouts_coach_period
  ON coach_payouts(coach_id, payout_period);

CREATE INDEX IF NOT EXISTS idx_coach_payouts_status_period
  ON coach_payouts(status, payout_period);

PRAGMA foreign_keys=ON;

SELECT id, coach_id, payout_period, payout_reference, total_commission, status
FROM coach_payouts
ORDER BY id;

SELECT sql
FROM sqlite_master
WHERE type='table' AND name='coach_payouts';
