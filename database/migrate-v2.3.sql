-- Run this ONCE only if the v2.2.1 enquiries table already exists.
ALTER TABLE enquiries ADD COLUMN follow_up_date TEXT NOT NULL DEFAULT '';
ALTER TABLE enquiries ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE enquiries ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_enquiries_follow_up_date ON enquiries(follow_up_date);
