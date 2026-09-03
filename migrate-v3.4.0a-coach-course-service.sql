-- Quantum YiJing v3.4.0a — Coach Course + Service Commission Patch
-- Run AFTER migrate-v3.4.0-coach-foundation.sql on PREVIEW D1.
-- Does not alter Affiliate, orders, payments or accounting tables.

ALTER TABLE coach_course_assignments ADD COLUMN closing_date TEXT DEFAULT '';
ALTER TABLE coach_course_assignments ADD COLUMN closed_at TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS coach_service_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL,
  service_code TEXT NOT NULL,
  service_name TEXT NOT NULL,
  product_id INTEGER DEFAULT NULL,
  effective_from TEXT NOT NULL,
  effective_until TEXT DEFAULT '',
  commission_rate REAL NOT NULL DEFAULT 0,
  commission_fixed_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Inactive')),
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(coach_id, service_code, effective_from),
  FOREIGN KEY(coach_id) REFERENCES coaches(id)
);
CREATE INDEX IF NOT EXISTS idx_coach_service_assignments_coach ON coach_service_assignments(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_service_assignments_status ON coach_service_assignments(status);

-- Convert existing coach numbers from QY-C0001 style to QY-C01 style.
-- Safe while IDs are below 100, as requested.
UPDATE coaches
SET coach_code = 'QY-C' || printf('%02d', CAST(SUBSTR(coach_code,5) AS INTEGER))
WHERE coach_code GLOB 'QY-C[0-9][0-9][0-9][0-9]';
