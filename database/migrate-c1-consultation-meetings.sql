-- U2-C: publication metadata, encrypted secrets and sanitized append-only evidence.
CREATE TABLE consultation_meeting_publications (
 id TEXT NOT NULL PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES consultation_bookings(id) ON DELETE RESTRICT,
 customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>0),
 appointment_kind TEXT NOT NULL CHECK(appointment_kind IN ('Offer','Replacement')),
 appointment_id TEXT NOT NULL, appointment_version INTEGER NOT NULL CHECK(typeof(appointment_version)='integer' AND appointment_version>0),
 start_at INTEGER NOT NULL CHECK(typeof(start_at)='integer'), end_at INTEGER NOT NULL CHECK(end_at=start_at+5400000),
 state TEXT NOT NULL CHECK(state IN ('Published','Revoked','Deleted')),
 key_id TEXT NOT NULL, nonce BLOB NOT NULL CHECK(typeof(nonce)='blob' AND length(nonce)=12),
 created_at INTEGER NOT NULL, created_by TEXT NOT NULL,
 UNIQUE(booking_id,revision), UNIQUE(key_id,nonce)
);
CREATE UNIQUE INDEX consultation_meeting_current ON consultation_meeting_publications(booking_id) WHERE state='Published';
CREATE TABLE consultation_meeting_secrets (
 publication_id TEXT NOT NULL PRIMARY KEY REFERENCES consultation_meeting_publications(id) ON DELETE RESTRICT,
 key_id TEXT NOT NULL, nonce BLOB NOT NULL CHECK(typeof(nonce)='blob' AND length(nonce)=12),
 ciphertext BLOB NOT NULL CHECK(typeof(ciphertext)='blob' AND length(ciphertext) BETWEEN 16 AND 4096), UNIQUE(key_id,nonce)
);
CREATE TABLE consultation_meeting_events (
 id TEXT NOT NULL PRIMARY KEY, publication_id TEXT NOT NULL REFERENCES consultation_meeting_publications(id) ON DELETE RESTRICT,
 event TEXT NOT NULL CHECK(event IN ('Published','Replaced','Revoked','Deleted','CustomerViewed')),
 command_id TEXT UNIQUE, actor_kind TEXT NOT NULL CHECK(actor_kind IN ('QY','Customer')), actor_reference TEXT NOT NULL,
 occurred_at INTEGER NOT NULL CHECK(typeof(occurred_at)='integer'),
 CHECK((event='CustomerViewed' AND actor_kind='Customer' AND command_id IS NULL) OR (event<>'CustomerViewed' AND actor_kind='QY' AND command_id IS NOT NULL))
);
CREATE UNIQUE INDEX consultation_meeting_view_once ON consultation_meeting_events(publication_id,actor_reference) WHERE event='CustomerViewed';
CREATE TRIGGER consultation_meeting_publication_insert BEFORE INSERT ON consultation_meeting_publications
 WHEN NEW.state<>'Published' OR EXISTS(SELECT 1 FROM consultation_meeting_publications WHERE id=NEW.id OR (booking_id=NEW.booking_id AND revision=NEW.revision) OR (booking_id=NEW.booking_id AND state='Published') OR (key_id=NEW.key_id AND nonce=NEW.nonce))
 OR NEW.revision<>(SELECT COALESCE(MAX(revision),0)+1 FROM consultation_meeting_publications WHERE booking_id=NEW.booking_id)
 OR NOT EXISTS(SELECT 1 FROM consultation_bookings b WHERE b.id=NEW.booking_id AND b.customer_id=NEW.customer_id AND b.state='Confirmed' AND (
 (NEW.appointment_kind='Replacement' AND EXISTS(SELECT 1 FROM consultation_workflow_appointments a WHERE a.id=NEW.appointment_id AND a.booking_id=b.id AND a.sequence=NEW.appointment_version AND a.state='Active' AND a.start_at=NEW.start_at AND a.end_at=NEW.end_at))
 OR (NEW.appointment_kind='Offer' AND NOT EXISTS(SELECT 1 FROM consultation_workflow_appointments WHERE booking_id=b.id AND state='Active') AND EXISTS(SELECT 1 FROM consultation_offers o WHERE o.id=b.current_offer_id AND o.id=NEW.appointment_id AND o.revision=NEW.appointment_version AND o.start_at=NEW.start_at AND o.end_at=NEW.end_at))))
 BEGIN SELECT RAISE(ABORT,'meeting publication rejected'); END;
CREATE TRIGGER consultation_meeting_publication_update BEFORE UPDATE ON consultation_meeting_publications
 WHEN NEW.id IS NOT OLD.id OR NEW.booking_id IS NOT OLD.booking_id OR NEW.customer_id IS NOT OLD.customer_id OR NEW.revision IS NOT OLD.revision OR NEW.appointment_kind IS NOT OLD.appointment_kind OR NEW.appointment_id IS NOT OLD.appointment_id OR NEW.appointment_version IS NOT OLD.appointment_version OR NEW.start_at IS NOT OLD.start_at OR NEW.end_at IS NOT OLD.end_at OR NEW.key_id IS NOT OLD.key_id OR NEW.nonce IS NOT OLD.nonce OR NEW.created_at IS NOT OLD.created_at OR NEW.created_by IS NOT OLD.created_by
 OR NOT((OLD.state='Published' AND NEW.state IN ('Revoked','Deleted')) OR (OLD.state='Revoked' AND NEW.state='Deleted'))
 BEGIN SELECT RAISE(ABORT,'meeting publication immutable'); END;
CREATE TRIGGER consultation_meeting_publication_delete BEFORE DELETE ON consultation_meeting_publications BEGIN SELECT RAISE(ABORT,'meeting history preserved'); END;
CREATE TRIGGER consultation_meeting_secret_insert BEFORE INSERT ON consultation_meeting_secrets
 WHEN EXISTS(SELECT 1 FROM consultation_meeting_secrets WHERE publication_id=NEW.publication_id OR (key_id=NEW.key_id AND nonce=NEW.nonce)) OR NOT EXISTS(SELECT 1 FROM consultation_meeting_publications WHERE id=NEW.publication_id AND state='Published' AND key_id=NEW.key_id AND nonce=NEW.nonce)
 BEGIN SELECT RAISE(ABORT,'meeting secret rejected'); END;
CREATE TRIGGER consultation_meeting_secret_update BEFORE UPDATE ON consultation_meeting_secrets BEGIN SELECT RAISE(ABORT,'meeting secret immutable'); END;
CREATE TRIGGER consultation_meeting_secret_delete BEFORE DELETE ON consultation_meeting_secrets WHEN NOT EXISTS(SELECT 1 FROM consultation_meeting_publications WHERE id=OLD.publication_id AND state='Deleted') BEGIN SELECT RAISE(ABORT,'explicit deletion required'); END;
CREATE TRIGGER consultation_meeting_event_insert BEFORE INSERT ON consultation_meeting_events
 WHEN EXISTS(SELECT 1 FROM consultation_meeting_events WHERE id=NEW.id OR (NEW.command_id IS NOT NULL AND command_id=NEW.command_id) OR (NEW.event='CustomerViewed' AND event='CustomerViewed' AND publication_id=NEW.publication_id AND actor_reference=NEW.actor_reference))
 BEGIN SELECT RAISE(ABORT,'meeting audit replacement rejected'); END;
CREATE TRIGGER consultation_meeting_event_update BEFORE UPDATE ON consultation_meeting_events BEGIN SELECT RAISE(ABORT,'meeting audit immutable'); END;
CREATE TRIGGER consultation_meeting_event_delete BEFORE DELETE ON consultation_meeting_events BEGIN SELECT RAISE(ABORT,'meeting audit immutable'); END;