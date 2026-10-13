-- Additive lifecycle records. Preserve original accepted offer/payment/price snapshots.
CREATE TABLE consultation_workflow_appointments (
 id TEXT NOT NULL PRIMARY KEY,
 booking_id TEXT NOT NULL REFERENCES consultation_bookings(id) ON DELETE RESTRICT,
 sequence INTEGER NOT NULL CHECK(typeof(sequence)='integer' AND sequence>=1),
 practitioner_id INTEGER NOT NULL REFERENCES coaches(id) ON DELETE RESTRICT,
 start_at INTEGER NOT NULL CHECK(typeof(start_at)='integer'),
 end_at INTEGER NOT NULL CHECK(end_at=start_at+5400000),
 state TEXT NOT NULL CHECK(state IN ('Active','Released')),
 request_id TEXT NOT NULL UNIQUE REFERENCES consultation_reschedule_requests(id) ON DELETE RESTRICT,
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer'),
 UNIQUE(booking_id,sequence)
);
CREATE UNIQUE INDEX consultation_workflow_current_appointment ON consultation_workflow_appointments(booking_id) WHERE state='Active';
CREATE UNIQUE INDEX consultation_workflow_pending_reschedule ON consultation_reschedule_requests(booking_id) WHERE state IN ('Pending','OwnerReview');
CREATE TRIGGER consultation_workflow_appointment_insert BEFORE INSERT ON consultation_workflow_appointments
 WHEN NEW.state<>'Active' OR EXISTS(SELECT 1 FROM consultation_workflow_appointments WHERE id=NEW.id OR request_id=NEW.request_id OR (booking_id=NEW.booking_id AND sequence=NEW.sequence))
 OR NEW.sequence<>COALESCE((SELECT MAX(sequence)+1 FROM consultation_workflow_appointments WHERE booking_id=NEW.booking_id),1)
 OR NOT EXISTS(SELECT 1 FROM consultation_reschedule_requests r JOIN consultation_bookings b ON b.id=r.booking_id WHERE r.id=NEW.request_id AND r.booking_id=NEW.booking_id AND r.state='Approved' AND r.replacement_start_at=NEW.start_at AND b.state='Confirmed' AND b.practitioner_id=NEW.practitioner_id AND NEW.start_at>NEW.created_at
 AND NEW.start_at<=(CAST(strftime('%s',date(b.original_start_at/1000.0,'unixepoch','+8 hours','+31 days')) AS INTEGER)*1000-28800000-1))
 OR EXISTS(SELECT 1 FROM consultation_workflow_appointments WHERE practitioner_id=NEW.practitioner_id AND state='Active' AND start_at<NEW.end_at AND end_at>NEW.start_at)
 OR EXISTS(SELECT 1 FROM consultation_slot_reservations WHERE practitioner_id=NEW.practitioner_id AND state IN ('Held','Confirmed') AND start_at<NEW.end_at AND end_at>NEW.start_at)
 BEGIN SELECT RAISE(ABORT,'workflow appointment rejected'); END;
CREATE TRIGGER consultation_workflow_appointment_update BEFORE UPDATE ON consultation_workflow_appointments
 WHEN NEW.id IS NOT OLD.id OR NEW.booking_id IS NOT OLD.booking_id OR NEW.sequence IS NOT OLD.sequence OR NEW.practitioner_id IS NOT OLD.practitioner_id OR NEW.start_at IS NOT OLD.start_at OR NEW.end_at IS NOT OLD.end_at OR NEW.request_id IS NOT OLD.request_id OR NEW.created_at IS NOT OLD.created_at OR OLD.state<>'Active' OR NEW.state<>'Released'
 BEGIN SELECT RAISE(ABORT,'workflow appointment immutable'); END;
CREATE TRIGGER consultation_workflow_appointment_delete BEFORE DELETE ON consultation_workflow_appointments BEGIN SELECT RAISE(ABORT,'workflow appointment immutable'); END;
-- Protect both directions: initial offers must not overlap replacement appointments.
CREATE TRIGGER consultation_workflow_initial_slot_insert BEFORE INSERT ON consultation_slot_reservations
 WHEN NEW.state IN ('Held','Confirmed') AND EXISTS(SELECT 1 FROM consultation_workflow_appointments WHERE practitioner_id=NEW.practitioner_id AND state='Active' AND start_at<NEW.end_at AND end_at>NEW.start_at)
 BEGIN SELECT RAISE(ABORT,'workflow appointment overlap'); END;
CREATE TRIGGER consultation_workflow_initial_slot_update BEFORE UPDATE ON consultation_slot_reservations
 WHEN NEW.state IN ('Held','Confirmed') AND EXISTS(SELECT 1 FROM consultation_workflow_appointments WHERE practitioner_id=NEW.practitioner_id AND state='Active' AND start_at<NEW.end_at AND end_at>NEW.start_at)
 BEGIN SELECT RAISE(ABORT,'workflow appointment overlap'); END;
CREATE TABLE consultation_workflow_lifecycle_events (
 id TEXT NOT NULL PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES consultation_bookings(id) ON DELETE RESTRICT,
 event TEXT NOT NULL CHECK(event IN ('RescheduleRequested','RescheduleApproved','OwnerReview','OfferExpired','ExceptionReview','CancelledForfeited','NoShowForfeited','ProviderRemedyPending','RetentionUpdated','ReportUnknown','ReportFollowUp','ReportDeleted')),
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('Customer','QY')), actor_reference TEXT NOT NULL,
 evidence_reference TEXT CHECK(evidence_reference IS NULL OR length(evidence_reference) BETWEEN 1 AND 128),
 occurred_at INTEGER NOT NULL CHECK(typeof(occurred_at)='integer')
);
CREATE TRIGGER consultation_workflow_lifecycle_insert BEFORE INSERT ON consultation_workflow_lifecycle_events
 WHEN EXISTS(SELECT 1 FROM consultation_workflow_lifecycle_events WHERE id=NEW.id)
 BEGIN SELECT RAISE(ABORT,'workflow lifecycle evidence rejected'); END;
CREATE TRIGGER consultation_workflow_lifecycle_update BEFORE UPDATE ON consultation_workflow_lifecycle_events BEGIN SELECT RAISE(ABORT,'workflow lifecycle immutable'); END;
CREATE TRIGGER consultation_workflow_lifecycle_delete BEFORE DELETE ON consultation_workflow_lifecycle_events BEGIN SELECT RAISE(ABORT,'workflow lifecycle immutable'); END;
