-- Quantum YiJing International Academy
-- v2.6 Student Management - TEST DATA ONLY
-- Generated: 2026-08-07
-- Safe marker: source = 'TEST-v2.6' and reference prefix = 'TEST-V26-'
-- This script does NOT send emails. It inserts rows directly into Cloudflare D1.
-- Run only on the database you intend to test.

-- Optional clean start: remove a previous copy of this exact test dataset.
DELETE FROM crm_activities
WHERE enquiry_id IN (SELECT id FROM enquiries WHERE source='TEST-v2.6' OR reference LIKE 'TEST-V26-%');

DELETE FROM students
WHERE enquiry_id IN (SELECT id FROM enquiries WHERE source='TEST-v2.6' OR reference LIKE 'TEST-V26-%');

DELETE FROM enquiries
WHERE source='TEST-v2.6' OR reference LIKE 'TEST-V26-%';

-- ---------------------------------------------------------------------------
-- A. 10 test enquiries that are already converted to students
-- ---------------------------------------------------------------------------
INSERT INTO enquiries (
  reference, submitted_at_utc, submitted_at_malaysia, submitted_date,
  name, email, phone, country, interest, message, language,
  status, source, follow_up_date, notes, lifecycle_stage, last_contacted_at,
  priority, next_action, tags, contact_preference
) VALUES
('TEST-V26-S001','2026-07-15T02:15:00Z','15 Jul 2026, 10:15 am','2026-07-15','Tan Wei Ming','tan.weiming@example.invalid','+6012-9001001','Malaysia','I Ching Fundamentals','Test student record for v2.6.','en','Converted','TEST-v2.6','','Excellent attendance and participation.','Active Student','05 Aug 2026, 3:30 pm','Warm','Send advanced programme information.','student,iching,active','WhatsApp'),
('TEST-V26-S002','2026-07-18T04:20:00Z','18 Jul 2026, 12:20 pm','2026-07-18','Lim Siew Ling','lim.siewling@example.invalid','+6016-9001002','Malaysia','Bazi Masterclass','Test student record for v2.6.','en','Converted','TEST-v2.6','2026-08-10','Deposit received; balance pending.','Active Student','06 Aug 2026, 11:00 am','Hot','Follow up on remaining fee.','student,bazi,payment','WhatsApp'),
('TEST-V26-S003','2026-07-20T01:45:00Z','20 Jul 2026, 9:45 am','2026-07-20','John Lee','john.lee@example.invalid','+659001003','Singapore','Feng Shui','Test student record for v2.6.','en','Converted','TEST-v2.6','2026-08-14','Starts next intake.','Registered','01 Aug 2026, 2:00 pm','Normal','Send class schedule before intake.','student,fengshui,registered','Email'),
('TEST-V26-S004','2026-06-10T06:30:00Z','10 Jun 2026, 2:30 pm','2026-06-10','Wong Jia Hui','wong.jiahui@example.invalid','+6017-9001004','Malaysia','Liu Yao Divination','Test student record for v2.6.','zh','Converted','TEST-v2.6','','Course completed; certificate issued.','Graduate','30 Jul 2026, 10:00 am','Low','Invite to alumni advanced workshop.','student,liuyao,graduate','Email'),
('TEST-V26-S005','2026-07-22T08:00:00Z','22 Jul 2026, 4:00 pm','2026-07-22','Ahmad Faiz','ahmad.faiz@example.invalid','+6013-9001005','Malaysia','Quantum YiJing','Test student record for v2.6.','en','Converted','TEST-v2.6','','Very active in discussions.','Active Student','06 Aug 2026, 4:15 pm','Warm','Discuss research-oriented module.','student,quantum,active','WhatsApp'),
('TEST-V26-S006','2026-05-15T03:10:00Z','15 May 2026, 11:10 am','2026-05-15','Sarah Lim','sarah.lim@example.invalid','+659001006','Singapore','Flying Star Feng Shui','Test student record for v2.6.','en','Converted','TEST-v2.6','','Returned for advanced class.','Alumni','15 Jul 2026, 1:00 pm','Normal','Invite to annual Feng Shui update.','student,flyingstar,alumni','Email'),
('TEST-V26-S007','2026-08-01T02:30:00Z','1 Aug 2026, 10:30 am','2026-08-01','Chew Kah Mun','chew.kahmun@example.invalid','+6012-9001007','Malaysia','I Ching Fundamentals','Test student record for v2.6.','zh','Converted','TEST-v2.6','2026-08-08','Registration confirmed; awaiting start date.','Registered','05 Aug 2026, 9:30 am','Hot','Confirm class commencement date.','student,iching,registered','WhatsApp'),
('TEST-V26-S008','2026-07-05T00:40:00Z','5 Jul 2026, 8:40 am','2026-07-05','David Ng','david.ng@example.invalid','+6149001008','Australia','Feng Shui','Test student record for v2.6.','en','Converted','TEST-v2.6','','Online student.','Active Student','02 Aug 2026, 8:00 pm','Normal','Check online lesson access.','student,fengshui,online','Email'),
('TEST-V26-S009','2026-04-12T05:00:00Z','12 Apr 2026, 1:00 pm','2026-04-12','Lee Mei Yin','lee.meiyin@example.invalid','+6018-9001009','Malaysia','Quantum YiJing','Test student record for v2.6.','zh','Converted','TEST-v2.6','','Strong research interest.','Graduate','25 Jul 2026, 4:00 pm','Warm','Discuss research collaboration opportunity.','student,quantum,graduate,research','Email'),
('TEST-V26-S010','2026-07-28T07:15:00Z','28 Jul 2026, 3:15 pm','2026-07-28','Michael Tan','michael.tan@example.invalid','+6739001010','Brunei','Bazi Masterclass','Test student record for v2.6.','en','Converted','TEST-v2.6','','Referral student.','Active Student','04 Aug 2026, 2:30 pm','Normal','Ask for referral feedback after module 1.','student,bazi,referral','Phone');

-- ---------------------------------------------------------------------------
-- B. Create 10 matching student records
-- Student IDs are deliberately TEST-prefixed so they cannot be mistaken for real IDs.
-- ---------------------------------------------------------------------------
INSERT INTO students (enquiry_id, student_id, name, email, phone, country, programme, lifecycle_stage, enrolled_date, graduated_date, private_notes)
SELECT id,'TEST-QY2026-9001',name,email,phone,country,'I Ching Fundamentals','Active Student','2026-07-20','', 'TEST: Excellent attendance.' FROM enquiries WHERE reference='TEST-V26-S001';
INSERT INTO students (enquiry_id, student_id, name, email, phone, country, programme, lifecycle_stage, enrolled_date, graduated_date, private_notes)
SELECT id,'TEST-QY2026-9002',name,email,phone,country,'Bazi Masterclass','Active Student','2026-07-22','', 'TEST: Deposit paid; balance pending.' FROM enquiries WHERE reference='TEST-V26-S002';
INSERT INTO students (enquiry_id, student_id, name, email, phone, country, programme, lifecycle_stage, enrolled_date, graduated_date, private_notes)
SELECT id,'TEST-QY2026-9003',name,email,phone,country,'Feng Shui','Registered','2026-08-01','', 'TEST: Starts next intake.' FROM enquiries WHERE reference='TEST-V26-S003';
INSERT INTO students (enquiry_id, student_id, name, email, phone, country, programme, lifecycle_stage, enrolled_date, graduated_date, private_notes)
SELECT id,'TEST-QY2026-9004',name,email,phone,country,'Liu Yao Divination','Graduate','2026-03-01','2026-06-30', 'TEST: Certificate issued.' FROM enquiries WHERE reference='TEST-V26-S004';
INSERT INTO students (enquiry_id, student_id, name, email, phone, country, programme, lifecycle_stage, enrolled_date, graduated_date, private_notes)
SELECT id,'TEST-QY2026-9005',name,email,phone,country,'Quantum YiJing','Active Student','2026-07-25','', 'TEST: Active discussion participant.' FROM enquiries WHERE reference='TEST-V26-S005';
INSERT INTO students (enquiry_id, student_id, name, email, phone, country, programme, lifecycle_stage, enrolled_date, graduated_date, private_notes)
SELECT id,'TEST-QY2026-9006',name,email,phone,country,'Flying Star Feng Shui','Alumni','2025-11-01','2026-02-28', 'TEST: Alumni returning for advanced class.' FROM enquiries WHERE reference='TEST-V26-S006';
INSERT INTO students (enquiry_id, student_id, name, email, phone, country, programme, lifecycle_stage, enrolled_date, graduated_date, private_notes)
SELECT id,'TEST-QY2026-9007',name,email,phone,country,'I Ching Fundamentals','Registered','2026-08-05','', 'TEST: Awaiting class start.' FROM enquiries WHERE reference='TEST-V26-S007';
INSERT INTO students (enquiry_id, student_id, name, email, phone, country, programme, lifecycle_stage, enrolled_date, graduated_date, private_notes)
SELECT id,'TEST-QY2026-9008',name,email,phone,country,'Feng Shui','Active Student','2026-07-10','', 'TEST: Online learner in Australia.' FROM enquiries WHERE reference='TEST-V26-S008';
INSERT INTO students (enquiry_id, student_id, name, email, phone, country, programme, lifecycle_stage, enrolled_date, graduated_date, private_notes)
SELECT id,'TEST-QY2026-9009',name,email,phone,country,'Quantum YiJing','Graduate','2026-01-15','2026-07-15', 'TEST: Research-oriented graduate.' FROM enquiries WHERE reference='TEST-V26-S009';
INSERT INTO students (enquiry_id, student_id, name, email, phone, country, programme, lifecycle_stage, enrolled_date, graduated_date, private_notes)
SELECT id,'TEST-QY2026-9010',name,email,phone,country,'Bazi Masterclass','Active Student','2026-08-01','', 'TEST: Referral student from Brunei.' FROM enquiries WHERE reference='TEST-V26-S010';

-- ---------------------------------------------------------------------------
-- C. 8 CRM-only test leads (not students yet) to test v2.5 + v2.6 integration
-- ---------------------------------------------------------------------------
INSERT INTO enquiries (
  reference, submitted_at_utc, submitted_at_malaysia, submitted_date,
  name, email, phone, country, interest, message, language,
  status, source, follow_up_date, notes, lifecycle_stage, last_contacted_at,
  priority, next_action, tags, contact_preference
) VALUES
('TEST-V26-L001','2026-08-07T00:20:00Z','7 Aug 2026, 8:20 am','2026-08-07','Alice Tan','alice.tan@example.invalid','+6012-9102001','Malaysia','Academy Course','Interested in beginner I Ching course.','en','New','TEST-v2.6','2026-08-08','TEST lead.','Lead','','Hot','Call tomorrow morning.','lead,academy,hot','Phone'),
('TEST-V26-L002','2026-08-06T03:15:00Z','6 Aug 2026, 11:15 am','2026-08-06','Kelvin Lim','kelvin.lim@example.invalid','+6016-9102002','Malaysia','Bazi Consultation','Asked about Bazi course versus consultation.','en','Contacted','TEST-v2.6','2026-08-10','Brochure already sent.','Prospect','6 Aug 2026, 4:00 pm','Normal','Send comparison brochure.','lead,bazi','Email'),
('TEST-V26-L003','2026-08-05T06:45:00Z','5 Aug 2026, 2:45 pm','2026-08-05','Mary Ong','mary.ong@example.invalid','+659102003','Singapore','Research Collaboration','Interested in research discussion.','en','Follow-up','TEST-v2.6','2026-08-07','Potential Zoom discussion.','Prospect','6 Aug 2026, 9:00 pm','Hot','Arrange Zoom meeting.','lead,research,priority','Email'),
('TEST-V26-L004','2026-08-02T01:30:00Z','2 Aug 2026, 9:30 am','2026-08-02','Jason Goh','jason.goh@example.invalid','+6017-9102004','Malaysia','General Enquiry','No longer interested.','en','Closed','TEST-v2.6','','Closed test lead.','Closed','3 Aug 2026, 10:00 am','Low','','lead,closed','Any'),
('TEST-V26-L005','2026-08-04T04:25:00Z','4 Aug 2026, 12:25 pm','2026-08-04','Steven Ho','steven.ho@example.invalid','+6019-9102005','Malaysia','Feng Shui Consultation','Requested quotation.','en','Follow-up','TEST-v2.6','2026-08-05','Awaiting payment decision.','Prospect','4 Aug 2026, 5:30 pm','Warm','Follow up on quotation.','lead,fengshui,proposal','WhatsApp'),
('TEST-V26-L006','2026-08-07T02:10:00Z','7 Aug 2026, 10:10 am','2026-08-07','Cindy Lee','cindy.lee@example.invalid','+6014-9102006','Malaysia','Baby Naming','Interested in baby naming service.','zh','Contacted','TEST-v2.6','2026-08-14','Prefers Chinese communication.','Prospect','7 Aug 2026, 1:00 pm','Normal','WhatsApp service requirements.','lead,naming,chinese','WhatsApp'),
('TEST-V26-L007','2026-08-07T05:05:00Z','7 Aug 2026, 1:05 pm','2026-08-07','Kenny Wong','kenny.wong@example.invalid','+6011-9102007','Malaysia','Academy Course','Ready to register if schedule suits.','en','New','TEST-v2.6','2026-08-07','High intent.','Prospect','','Hot','Immediate call about schedule.','lead,academy,high-intent','Phone'),
('TEST-V26-L008','2026-08-03T09:20:00Z','3 Aug 2026, 5:20 pm','2026-08-03','Jasmine Tan','jasmine.tan@example.invalid','+6739102008','Brunei','Quantum YiJing','Asked about online programme.','en','Follow-up','TEST-v2.6','2026-08-12','International online prospect.','Prospect','5 Aug 2026, 2:00 pm','Warm','Send online programme outline.','lead,quantum,online','Email');

-- ---------------------------------------------------------------------------
-- D. Timeline/activity records for realistic CRM/student detail testing
-- ---------------------------------------------------------------------------
INSERT INTO crm_activities (enquiry_id, activity_type, description, activity_date)
SELECT id,'Enquiry','TEST: Website enquiry received.','15 Jul 2026, 10:15 am' FROM enquiries WHERE reference='TEST-V26-S001';
INSERT INTO crm_activities (enquiry_id, activity_type, description, activity_date)
SELECT id,'Course','TEST: Converted to student TEST-QY2026-9001.','20 Jul 2026, 9:00 am' FROM enquiries WHERE reference='TEST-V26-S001';
INSERT INTO crm_activities (enquiry_id, activity_type, description, activity_date)
SELECT id,'Meeting','TEST: Discussed advanced learning pathway.','5 Aug 2026, 3:30 pm' FROM enquiries WHERE reference='TEST-V26-S001';

INSERT INTO crm_activities (enquiry_id, activity_type, description, activity_date)
SELECT id,'Payment','TEST: Deposit received; balance outstanding.','22 Jul 2026, 12:00 pm' FROM enquiries WHERE reference='TEST-V26-S002';
INSERT INTO crm_activities (enquiry_id, activity_type, description, activity_date)
SELECT id,'Follow-up','TEST: Follow up remaining fee.','6 Aug 2026, 11:00 am' FROM enquiries WHERE reference='TEST-V26-S002';

INSERT INTO crm_activities (enquiry_id, activity_type, description, activity_date)
SELECT id,'Course','TEST: Registered for next intake.','1 Aug 2026, 2:00 pm' FROM enquiries WHERE reference='TEST-V26-S003';

INSERT INTO crm_activities (enquiry_id, activity_type, description, activity_date)
SELECT id,'Course','TEST: Course completed.','30 Jun 2026, 5:00 pm' FROM enquiries WHERE reference='TEST-V26-S004';
INSERT INTO crm_activities (enquiry_id, activity_type, description, activity_date)
SELECT id,'Note','TEST: Certificate issued.','15 Jul 2026, 10:00 am' FROM enquiries WHERE reference='TEST-V26-S004';

INSERT INTO crm_activities (enquiry_id, activity_type, description, activity_date)
SELECT id,'WhatsApp','TEST: Sent Academy course information.','6 Aug 2026, 4:00 pm' FROM enquiries WHERE reference='TEST-V26-L001';
INSERT INTO crm_activities (enquiry_id, activity_type, description, activity_date)
SELECT id,'Brochure Sent','TEST: Bazi brochure sent by email.','6 Aug 2026, 4:00 pm' FROM enquiries WHERE reference='TEST-V26-L002';
INSERT INTO crm_activities (enquiry_id, activity_type, description, activity_date)
SELECT id,'Meeting','TEST: Proposed Zoom research discussion.','6 Aug 2026, 9:00 pm' FROM enquiries WHERE reference='TEST-V26-L003';
INSERT INTO crm_activities (enquiry_id, activity_type, description, activity_date)
SELECT id,'Follow-up','TEST: Quotation follow-up required.','4 Aug 2026, 5:30 pm' FROM enquiries WHERE reference='TEST-V26-L005';
INSERT INTO crm_activities (enquiry_id, activity_type, description, activity_date)
SELECT id,'WhatsApp','TEST: Customer prefers Chinese communication.','7 Aug 2026, 1:00 pm' FROM enquiries WHERE reference='TEST-V26-L006';

-- ---------------------------------------------------------------------------
-- E. Verification results (should return 18 enquiries, 10 students)
-- ---------------------------------------------------------------------------
SELECT 'TEST enquiries' AS item, COUNT(*) AS count FROM enquiries WHERE source='TEST-v2.6';
SELECT 'TEST students' AS item, COUNT(*) AS count
FROM students s JOIN enquiries e ON e.id=s.enquiry_id WHERE e.source='TEST-v2.6';
SELECT lifecycle_stage, COUNT(*) AS count
FROM students s JOIN enquiries e ON e.id=s.enquiry_id
WHERE e.source='TEST-v2.6'
GROUP BY lifecycle_stage ORDER BY lifecycle_stage;
