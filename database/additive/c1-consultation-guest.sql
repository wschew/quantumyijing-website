-- Additive guest workflow v1. The original 15 pinned migrations remain unchanged.
-- Dedicated synthetic C1 Preview only; apply once, never run the original initializer again.
CREATE TABLE consultation_guest_intakes (
 booking_id TEXT NOT NULL PRIMARY KEY REFERENCES consultation_bookings(id),
 intake_id TEXT NOT NULL UNIQUE REFERENCES consultation_customer_intakes(id),
 customer_id INTEGER NOT NULL REFERENCES customers(id),
 preferred_start INTEGER NOT NULL,
 command_id TEXT NOT NULL UNIQUE,
 fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
 contact_verified INTEGER NOT NULL DEFAULT 0 CHECK(contact_verified=0)
);
CREATE TRIGGER consultation_guest_link_guard BEFORE INSERT ON consultation_guest_intakes
 WHEN NOT EXISTS(SELECT 1 FROM consultation_bookings b JOIN consultation_customer_intakes i ON i.id=NEW.intake_id WHERE b.id=NEW.booking_id AND b.customer_id=NEW.customer_id AND i.customer_id=NEW.customer_id)
 BEGIN SELECT RAISE(ABORT,'guest linkage rejected'); END;
CREATE TRIGGER consultation_guest_link_immutable BEFORE UPDATE ON consultation_guest_intakes BEGIN SELECT RAISE(ABORT,'guest linkage immutable'); END;
CREATE TRIGGER consultation_guest_link_no_delete BEFORE DELETE ON consultation_guest_intakes BEGIN SELECT RAISE(ABORT,'guest linkage immutable'); END;
CREATE TABLE consultation_guest_offer_links (
 offer_id TEXT NOT NULL PRIMARY KEY REFERENCES consultation_offers(id),
 token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
 expires_at INTEGER NOT NULL,
 issued_by TEXT NOT NULL,
 used_at INTEGER
);
CREATE TABLE consultation_guest_events (
 id TEXT NOT NULL PRIMARY KEY,
 booking_id TEXT NOT NULL REFERENCES consultation_bookings(id),
 event TEXT NOT NULL CHECK(event IN ('Submitted','LinkIssued','Accepted','QYRead')),
 actor_reference TEXT NOT NULL,
 occurred_at INTEGER NOT NULL
);
CREATE TRIGGER consultation_guest_event_immutable BEFORE UPDATE ON consultation_guest_events BEGIN SELECT RAISE(ABORT,'guest audit immutable'); END;
CREATE TRIGGER consultation_guest_event_no_delete BEFORE DELETE ON consultation_guest_events BEGIN SELECT RAISE(ABORT,'guest audit immutable'); END;
CREATE TABLE consultation_guest_admission (
 id INTEGER NOT NULL PRIMARY KEY CHECK(id=1),
 window_started_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL CHECK(attempts BETWEEN 0 AND 20)
);
INSERT INTO consultation_guest_admission VALUES(1,0,0);
CREATE VIEW consultation_all_workflow_intakes AS
 SELECT booking_id,intake_id,customer_id FROM consultation_workflow_intakes
 UNION ALL SELECT booking_id,intake_id,customer_id FROM consultation_guest_intakes;
