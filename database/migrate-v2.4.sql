-- Quantum YiJing v2.4 - Academy Operating System Phase 1
-- Run once against the existing quantumyijing-enquiries D1 database.

ALTER TABLE enquiries ADD COLUMN lifecycle_stage TEXT NOT NULL DEFAULT 'Lead';
ALTER TABLE enquiries ADD COLUMN last_contacted_at TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_id INTEGER NOT NULL UNIQUE,
  student_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  programme TEXT NOT NULL DEFAULT '',
  lifecycle_stage TEXT NOT NULL DEFAULT 'Registered',
  enrolled_date TEXT NOT NULL DEFAULT '',
  graduated_date TEXT NOT NULL DEFAULT '',
  private_notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (enquiry_id) REFERENCES enquiries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS crm_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_id INTEGER NOT NULL,
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (enquiry_id) REFERENCES enquiries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_enquiries_lifecycle_stage ON enquiries(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id);
CREATE INDEX IF NOT EXISTS idx_students_lifecycle_stage ON students(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_crm_activities_enquiry_id ON crm_activities(enquiry_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_date ON crm_activities(activity_date DESC);

-- Seed a timeline entry for existing enquiries, without duplicating entries if rerun.
INSERT INTO crm_activities (enquiry_id, activity_type, description, activity_date)
SELECT e.id, 'Enquiry', 'Website enquiry received.', e.submitted_at_malaysia
FROM enquiries e
WHERE NOT EXISTS (
  SELECT 1 FROM crm_activities a
  WHERE a.enquiry_id = e.id AND a.activity_type = 'Enquiry'
);
