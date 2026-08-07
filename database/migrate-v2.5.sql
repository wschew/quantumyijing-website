-- Quantum YiJing v2.5 - CRM Intelligence & Follow-up
-- Run ONCE against the existing quantumyijing-enquiries D1 database after v2.4 migration.

ALTER TABLE enquiries ADD COLUMN priority TEXT NOT NULL DEFAULT 'Normal';
ALTER TABLE enquiries ADD COLUMN next_action TEXT NOT NULL DEFAULT '';
ALTER TABLE enquiries ADD COLUMN tags TEXT NOT NULL DEFAULT '';
ALTER TABLE enquiries ADD COLUMN contact_preference TEXT NOT NULL DEFAULT 'Any';

CREATE INDEX IF NOT EXISTS idx_enquiries_priority ON enquiries(priority);
CREATE INDEX IF NOT EXISTS idx_enquiries_next_action ON enquiries(next_action);

-- Existing active leads start at Normal priority and Any contact preference.
UPDATE enquiries SET priority='Normal' WHERE trim(priority)='';
UPDATE enquiries SET contact_preference='Any' WHERE trim(contact_preference)='';
