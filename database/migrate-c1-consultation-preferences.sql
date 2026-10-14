-- U2-A only: append-only preferences, never reservations or offers.
CREATE TABLE consultation_appointment_preferences (
 id TEXT NOT NULL PRIMARY KEY,
 booking_id TEXT NOT NULL REFERENCES consultation_bookings(id) ON DELETE RESTRICT,
 customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=1),
 booking_version INTEGER NOT NULL CHECK(typeof(booking_version)='integer' AND booking_version>=1),
 command_id TEXT NOT NULL UNIQUE,
 start_1 INTEGER NOT NULL CHECK(typeof(start_1)='integer'),
 start_2 INTEGER CHECK(start_2 IS NULL OR typeof(start_2)='integer'),
 start_3 INTEGER CHECK(start_3 IS NULL OR typeof(start_3)='integer'),
 actor_context_id TEXT NOT NULL REFERENCES consultation_customer_contexts(id) ON DELETE RESTRICT,
 occurred_at INTEGER NOT NULL CHECK(typeof(occurred_at)='integer'),
 UNIQUE(booking_id,revision),
 CHECK(start_1>occurred_at AND (start_2 IS NULL OR start_2>occurred_at) AND (start_3 IS NULL OR start_3>occurred_at)),
 CHECK(start_3 IS NULL OR start_2 IS NOT NULL),
 CHECK(start_2 IS NULL OR start_2<>start_1),
 CHECK(start_3 IS NULL OR (start_3<>start_1 AND start_3<>start_2))
);
CREATE TRIGGER consultation_preferences_insert BEFORE INSERT ON consultation_appointment_preferences
 WHEN EXISTS(SELECT 1 FROM consultation_appointment_preferences WHERE id=NEW.id OR command_id=NEW.command_id OR (booking_id=NEW.booking_id AND revision=NEW.revision))
 OR NEW.revision<>(SELECT COALESCE(MAX(revision),0)+1 FROM consultation_appointment_preferences WHERE booking_id=NEW.booking_id)
 OR NOT EXISTS(SELECT 1 FROM consultation_bookings b JOIN consultation_customer_contexts x ON x.id=NEW.actor_context_id WHERE b.id=NEW.booking_id AND b.customer_id=NEW.customer_id AND x.customer_id=b.customer_id AND b.state IN ('Submitted','UnderReview') AND b.current_offer_id IS NULL AND NOT EXISTS(SELECT 1 FROM consultation_offers WHERE booking_id=b.id) AND b.row_version=NEW.booking_version)
 BEGIN SELECT RAISE(ABORT,'preference evidence rejected'); END;
CREATE TRIGGER consultation_preferences_update BEFORE UPDATE ON consultation_appointment_preferences BEGIN SELECT RAISE(ABORT,'preference evidence immutable'); END;
CREATE TRIGGER consultation_preferences_delete BEFORE DELETE ON consultation_appointment_preferences BEGIN SELECT RAISE(ABORT,'preference evidence immutable'); END;