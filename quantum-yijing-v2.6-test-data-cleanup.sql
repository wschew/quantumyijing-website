-- Quantum YiJing v2.6 TEST DATA CLEANUP
-- Deletes only rows created by quantum-yijing-v2.6-test-data.sql.

DELETE FROM crm_activities
WHERE enquiry_id IN (SELECT id FROM enquiries WHERE source='TEST-v2.6' OR reference LIKE 'TEST-V26-%');

DELETE FROM students
WHERE enquiry_id IN (SELECT id FROM enquiries WHERE source='TEST-v2.6' OR reference LIKE 'TEST-V26-%');

DELETE FROM enquiries
WHERE source='TEST-v2.6' OR reference LIKE 'TEST-V26-%';

SELECT 'Remaining TEST enquiries' AS item, COUNT(*) AS count FROM enquiries WHERE source='TEST-v2.6';
