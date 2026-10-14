-- U2-B additive availability only. Existing reservations are not rewritten.
CREATE TABLE consultation_availability_windows (
 id TEXT NOT NULL PRIMARY KEY, practitioner_id INTEGER NOT NULL REFERENCES coaches(id) ON DELETE RESTRICT,
 start_at INTEGER NOT NULL CHECK(typeof(start_at)='integer'), end_at INTEGER NOT NULL CHECK(typeof(end_at)='integer' AND end_at>=start_at+5400000),
 state TEXT NOT NULL CHECK(state IN ('Active','Withdrawn')), revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=1),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer' AND start_at>created_at), updated_at INTEGER NOT NULL CHECK(typeof(updated_at)='integer' AND updated_at>=created_at)
);
CREATE INDEX consultation_availability_coverage ON consultation_availability_windows(practitioner_id,state,start_at,end_at);
CREATE TABLE consultation_availability_events (
 id TEXT NOT NULL PRIMARY KEY, window_id TEXT NOT NULL REFERENCES consultation_availability_windows(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=1), command_id TEXT NOT NULL UNIQUE,
 event TEXT NOT NULL CHECK(event IN ('Created','Modified','Withdrawn')), actor_session_id TEXT NOT NULL,
 start_at INTEGER NOT NULL, end_at INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('Active','Withdrawn')),
 occurred_at INTEGER NOT NULL CHECK(typeof(occurred_at)='integer'), UNIQUE(window_id,revision)
);
CREATE TRIGGER consultation_availability_insert BEFORE INSERT ON consultation_availability_windows
 WHEN NEW.revision<>1 OR NEW.state<>'Active' OR EXISTS(SELECT 1 FROM consultation_availability_windows WHERE id=NEW.id)
 BEGIN SELECT RAISE(ABORT,'availability insert rejected'); END;
CREATE TRIGGER consultation_availability_update BEFORE UPDATE ON consultation_availability_windows
 WHEN NEW.id IS NOT OLD.id OR NEW.practitioner_id IS NOT OLD.practitioner_id OR NEW.created_at IS NOT OLD.created_at OR NEW.revision<>OLD.revision+1 OR OLD.state<>'Active' OR OLD.start_at<=(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
 OR (NEW.state='Active' AND NEW.start_at<=(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))) OR (NEW.state='Withdrawn' AND (NEW.start_at<>OLD.start_at OR NEW.end_at<>OLD.end_at))
 OR EXISTS(SELECT 1 FROM (SELECT practitioner_id,start_at,end_at FROM consultation_slot_reservations WHERE state IN ('Held','Confirmed') UNION ALL SELECT practitioner_id,start_at,end_at FROM consultation_workflow_appointments WHERE state='Active') r WHERE r.practitioner_id=OLD.practitioner_id AND r.start_at>=OLD.start_at AND r.end_at<=OLD.end_at
 AND NOT(NEW.state='Active' AND r.start_at>=NEW.start_at AND r.end_at<=NEW.end_at)
 AND NOT EXISTS(SELECT 1 FROM consultation_availability_windows w WHERE w.id<>OLD.id AND w.practitioner_id=r.practitioner_id AND w.state='Active' AND w.start_at<=r.start_at AND w.end_at>=r.end_at))
 BEGIN SELECT RAISE(ABORT,'availability change conflicts with reservation'); END;
CREATE TRIGGER consultation_availability_delete BEFORE DELETE ON consultation_availability_windows BEGIN SELECT RAISE(ABORT,'availability history preserved'); END;
CREATE TRIGGER consultation_availability_event_insert BEFORE INSERT ON consultation_availability_events
 WHEN EXISTS(SELECT 1 FROM consultation_availability_events WHERE id=NEW.id OR command_id=NEW.command_id OR (window_id=NEW.window_id AND revision=NEW.revision))
 OR NOT EXISTS(SELECT 1 FROM consultation_availability_windows w WHERE w.id=NEW.window_id AND w.revision=NEW.revision AND w.start_at=NEW.start_at AND w.end_at=NEW.end_at AND w.state=NEW.state AND w.updated_at=NEW.occurred_at)
 BEGIN SELECT RAISE(ABORT,'availability audit rejected'); END;
CREATE TRIGGER consultation_availability_event_update BEFORE UPDATE ON consultation_availability_events BEGIN SELECT RAISE(ABORT,'availability audit immutable'); END;
CREATE TRIGGER consultation_availability_event_delete BEFORE DELETE ON consultation_availability_events BEGIN SELECT RAISE(ABORT,'availability audit immutable'); END;
CREATE TRIGGER consultation_availability_slot_insert BEFORE INSERT ON consultation_slot_reservations WHEN NEW.state IN ('Held','Confirmed') AND NOT EXISTS(SELECT 1 FROM consultation_availability_windows w WHERE w.practitioner_id=NEW.practitioner_id AND w.state='Active' AND w.start_at<=NEW.start_at AND w.end_at>=NEW.end_at) BEGIN SELECT RAISE(ABORT,'appointment outside availability'); END;
CREATE TRIGGER consultation_availability_slot_update BEFORE UPDATE ON consultation_slot_reservations WHEN NEW.state IN ('Held','Confirmed') AND (NEW.start_at<>OLD.start_at OR NEW.end_at<>OLD.end_at OR NEW.practitioner_id<>OLD.practitioner_id OR OLD.state NOT IN ('Held','Confirmed')) AND NOT EXISTS(SELECT 1 FROM consultation_availability_windows w WHERE w.practitioner_id=NEW.practitioner_id AND w.state='Active' AND w.start_at<=NEW.start_at AND w.end_at>=NEW.end_at) BEGIN SELECT RAISE(ABORT,'appointment outside availability'); END;
CREATE TRIGGER consultation_availability_replacement_insert BEFORE INSERT ON consultation_workflow_appointments WHEN NEW.state='Active' AND NOT EXISTS(SELECT 1 FROM consultation_availability_windows w WHERE w.practitioner_id=NEW.practitioner_id AND w.state='Active' AND w.start_at<=NEW.start_at AND w.end_at>=NEW.end_at) BEGIN SELECT RAISE(ABORT,'appointment outside availability'); END;
CREATE TRIGGER consultation_availability_replacement_update BEFORE UPDATE ON consultation_workflow_appointments WHEN NEW.state='Active' AND (NEW.start_at<>OLD.start_at OR NEW.end_at<>OLD.end_at OR NEW.practitioner_id<>OLD.practitioner_id OR OLD.state NOT IN ('Active')) AND NOT EXISTS(SELECT 1 FROM consultation_availability_windows w WHERE w.practitioner_id=NEW.practitioner_id AND w.state='Active' AND w.start_at<=NEW.start_at AND w.end_at>=NEW.end_at) BEGIN SELECT RAISE(ABORT,'appointment outside availability'); END;
