-- Close every unique-key REPLACE collision path without recursive_triggers assumptions.
CREATE TRIGGER consultation_workflow_active_appointment_collision BEFORE INSERT ON consultation_workflow_appointments
 WHEN EXISTS(SELECT 1 FROM consultation_workflow_appointments WHERE booking_id=NEW.booking_id AND state='Active')
 BEGIN SELECT RAISE(ABORT,'active appointment replacement rejected'); END;
CREATE TRIGGER consultation_workflow_reschedule_collision BEFORE INSERT ON consultation_reschedule_requests
 WHEN EXISTS(SELECT 1 FROM consultation_reschedule_requests WHERE id=NEW.id OR (booking_id=NEW.booking_id AND state IN ('Pending','OwnerReview') AND NEW.state IN ('Pending','OwnerReview')))
 BEGIN SELECT RAISE(ABORT,'reschedule evidence replacement rejected'); END;
CREATE TRIGGER consultation_workflow_reschedule_identity BEFORE UPDATE ON consultation_reschedule_requests
 WHEN NEW.id IS NOT OLD.id OR NEW.booking_id IS NOT OLD.booking_id OR NEW.requested_at IS NOT OLD.requested_at OR NEW.appointment_start_snapshot IS NOT OLD.appointment_start_snapshot OR NEW.original_start_snapshot IS NOT OLD.original_start_snapshot OR NEW.request_type IS NOT OLD.request_type OR NEW.eligibility IS NOT OLD.eligibility
 OR OLD.state IN ('Approved','Declined','Withdrawn')
 BEGIN SELECT RAISE(ABORT,'reschedule request immutable'); END;
CREATE TRIGGER consultation_workflow_reschedule_delete BEFORE DELETE ON consultation_reschedule_requests BEGIN SELECT RAISE(ABORT,'reschedule request immutable'); END;
CREATE TRIGGER consultation_workflow_original_slot_collision BEFORE INSERT ON consultation_slot_reservations
 WHEN EXISTS(SELECT 1 FROM consultation_slot_reservations WHERE id=NEW.id OR offer_id=NEW.offer_id)
 BEGIN SELECT RAISE(ABORT,'original reservation replacement rejected'); END;
