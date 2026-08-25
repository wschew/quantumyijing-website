-- Quantum YiJing® Academy Operating System
-- v3.4.1d — Reusable Course Registration Requirements
-- ADDITIVE ONLY. No payment/accounting/affiliate/coach payout tables are changed.

CREATE TABLE IF NOT EXISTS product_registration_settings (
  product_id INTEGER PRIMARY KEY,
  gender_required INTEGER NOT NULL DEFAULT 0,
  meal_preference_required INTEGER NOT NULL DEFAULT 0,
  accommodation_included INTEGER NOT NULL DEFAULT 0,
  accommodation_notes_enabled INTEGER NOT NULL DEFAULT 0,
  registration_time TEXT NOT NULL DEFAULT '',
  checkout_time TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_registration_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_id INTEGER NOT NULL UNIQUE,
  product_id INTEGER NOT NULL,
  gender TEXT NOT NULL DEFAULT '',
  meal_preference TEXT NOT NULL DEFAULT '',
  accommodation_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_course_registration_details_product
  ON course_registration_details(product_id);

CREATE INDEX IF NOT EXISTS idx_course_registration_details_enquiry
  ON course_registration_details(enquiry_id);
