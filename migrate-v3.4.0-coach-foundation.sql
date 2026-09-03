-- Quantum YiJing v3.4.0 — Coach Management & Commission Foundation
-- Separate from Affiliate accounting. No existing Affiliate/Payment tables are modified.

CREATE TABLE IF NOT EXISTS coaches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  email TEXT NOT NULL UNIQUE,
  phone TEXT DEFAULT '',
  country TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  bank_account_name TEXT DEFAULT '',
  bank_account_number TEXT DEFAULT '',
  identification_type TEXT DEFAULT '',
  identification_number TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Suspended','Archived')),
  portal_enabled INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coach_credentials (
  coach_id INTEGER PRIMARY KEY,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 100000,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(coach_id) REFERENCES coaches(id)
);

CREATE TABLE IF NOT EXISTS coach_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT DEFAULT '',
  FOREIGN KEY(coach_id) REFERENCES coaches(id)
);

CREATE TABLE IF NOT EXISTS coach_course_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  course_sku TEXT DEFAULT '',
  course_name TEXT DEFAULT '',
  course_start_date TEXT DEFAULT '',
  course_end_date TEXT DEFAULT '',
  course_status TEXT NOT NULL DEFAULT 'Planned' CHECK(course_status IN ('Planned','Conducted','Cancelled')),
  commission_mode TEXT NOT NULL DEFAULT 'fixed_per_participant' CHECK(commission_mode IN ('fixed_per_participant','percentage_of_revenue','fixed_course')),
  commission_rate REAL NOT NULL DEFAULT 0,
  commission_fixed_amount REAL NOT NULL DEFAULT 0,
  participant_count INTEGER NOT NULL DEFAULT 0,
  eligible_course_revenue REAL NOT NULL DEFAULT 0,
  participant_count_locked INTEGER NOT NULL DEFAULT 0,
  final_commission REAL DEFAULT NULL,
  payout_eligible_month TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(coach_id, product_id, course_start_date),
  FOREIGN KEY(coach_id) REFERENCES coaches(id)
);

CREATE INDEX IF NOT EXISTS idx_coaches_status ON coaches(status);
CREATE INDEX IF NOT EXISTS idx_coach_assignments_coach ON coach_course_assignments(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_assignments_product ON coach_course_assignments(product_id);
CREATE INDEX IF NOT EXISTS idx_coach_assignments_status ON coach_course_assignments(course_status);
CREATE INDEX IF NOT EXISTS idx_coach_sessions_token ON coach_sessions(token_hash);
