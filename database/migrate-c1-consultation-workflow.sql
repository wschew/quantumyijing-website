-- Additive workflow links and manual PDF metadata only. No PDF content/object storage.
CREATE TABLE consultation_workflow_intakes (
 booking_id TEXT NOT NULL PRIMARY KEY REFERENCES consultation_bookings(id) ON DELETE RESTRICT,
 intake_id TEXT NOT NULL UNIQUE REFERENCES consultation_customer_intakes(id) ON DELETE RESTRICT,
 customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 delivery_contact_id TEXT NOT NULL REFERENCES consultation_verified_contacts(id) ON DELETE RESTRICT
);
CREATE TRIGGER consultation_workflow_intake_insert BEFORE INSERT ON consultation_workflow_intakes
 WHEN EXISTS(SELECT 1 FROM consultation_workflow_intakes WHERE booking_id=NEW.booking_id OR intake_id=NEW.intake_id)
 OR NOT EXISTS(SELECT 1 FROM consultation_bookings b JOIN consultation_customer_intakes i ON i.id=NEW.intake_id
 JOIN consultation_verified_contacts c ON c.id=NEW.delivery_contact_id
 WHERE b.id=NEW.booking_id AND b.customer_id=NEW.customer_id AND i.customer_id=NEW.customer_id AND c.customer_id=NEW.customer_id AND c.channel=b.report_channel)
 BEGIN SELECT RAISE(ABORT,'workflow linkage rejected'); END;
CREATE TRIGGER consultation_workflow_intake_update BEFORE UPDATE ON consultation_workflow_intakes BEGIN SELECT RAISE(ABORT,'workflow linkage immutable'); END;
CREATE TRIGGER consultation_workflow_intake_delete BEFORE DELETE ON consultation_workflow_intakes BEGIN SELECT RAISE(ABORT,'workflow linkage immutable'); END;
CREATE TABLE consultation_workflow_events (
 id TEXT NOT NULL PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES consultation_bookings(id) ON DELETE RESTRICT,
 event TEXT NOT NULL CHECK(event IN ('Submitted','Offered','Accepted','UnderReview','Declined','Completed','ExceptionReview','Confirmed','ReportReady','ReportDelivered','RetentionUpdated')),
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('Customer','QY')), actor_reference TEXT NOT NULL,
 occurred_at INTEGER NOT NULL
);
CREATE TABLE consultation_workflow_commands (
 command_id TEXT NOT NULL PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES consultation_bookings(id) ON DELETE RESTRICT,
 fingerprint_key_id TEXT NOT NULL, fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64), occurred_at INTEGER NOT NULL
);
CREATE TABLE consultation_manual_reports (
 booking_id TEXT NOT NULL PRIMARY KEY REFERENCES consultation_bookings(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL CHECK(revision>=1),
 state TEXT NOT NULL CHECK(state IN ('Prepared','Delivered','Unknown','FollowUp','Deleted')),
 channel TEXT NOT NULL CHECK(channel IN ('email','whatsapp')),
 evidence_reference TEXT CHECK(evidence_reference IS NULL OR length(evidence_reference) BETWEEN 1 AND 128),
 prepared_at INTEGER NOT NULL, delivered_at INTEGER, deleted_at INTEGER,
 CHECK(state<>'Delivered' OR (delivered_at IS NOT NULL AND evidence_reference IS NOT NULL)),
 CHECK(state<>'Deleted' OR (delivered_at IS NOT NULL AND deleted_at IS NOT NULL)),
 CHECK(delivered_at IS NULL OR delivered_at>=prepared_at), CHECK(deleted_at IS NULL OR deleted_at>=delivered_at)
);
CREATE TRIGGER consultation_workflow_command_insert BEFORE INSERT ON consultation_workflow_commands
 WHEN EXISTS(SELECT 1 FROM consultation_workflow_commands WHERE command_id=NEW.command_id) BEGIN SELECT RAISE(ABORT,'workflow command rejected'); END;
CREATE TRIGGER consultation_workflow_command_update BEFORE UPDATE ON consultation_workflow_commands BEGIN SELECT RAISE(ABORT,'workflow command immutable'); END;
CREATE TRIGGER consultation_workflow_command_delete BEFORE DELETE ON consultation_workflow_commands BEGIN SELECT RAISE(ABORT,'workflow command immutable'); END;
CREATE TRIGGER consultation_workflow_event_insert BEFORE INSERT ON consultation_workflow_events
 WHEN EXISTS(SELECT 1 FROM consultation_workflow_events WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'workflow event rejected'); END;
CREATE TRIGGER consultation_workflow_event_update BEFORE UPDATE ON consultation_workflow_events BEGIN SELECT RAISE(ABORT,'workflow event immutable'); END;
CREATE TRIGGER consultation_workflow_event_delete BEFORE DELETE ON consultation_workflow_events BEGIN SELECT RAISE(ABORT,'workflow event immutable'); END;
CREATE TRIGGER consultation_manual_report_insert BEFORE INSERT ON consultation_manual_reports
 WHEN EXISTS(SELECT 1 FROM consultation_manual_reports WHERE booking_id=NEW.booking_id) OR NEW.revision<>1 OR NEW.state<>'Prepared'
 OR NEW.delivered_at IS NOT NULL OR NEW.deleted_at IS NOT NULL
 BEGIN SELECT RAISE(ABORT,'manual report rejected'); END;
CREATE TRIGGER consultation_manual_report_update BEFORE UPDATE ON consultation_manual_reports
 WHEN NEW.booking_id IS NOT OLD.booking_id OR NEW.revision<>OLD.revision+1 OR NEW.channel IS NOT OLD.channel OR NEW.prepared_at IS NOT OLD.prepared_at
 OR (OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS NOT OLD.delivered_at) OR OLD.state='Deleted'
 BEGIN SELECT RAISE(ABORT,'manual report update rejected'); END;
CREATE TRIGGER consultation_manual_report_delete BEFORE DELETE ON consultation_manual_reports BEGIN SELECT RAISE(ABORT,'manual report evidence immutable'); END;
