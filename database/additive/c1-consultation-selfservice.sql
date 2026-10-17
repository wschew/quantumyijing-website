-- Stage A additive marker; original 15 migrations and guest-v1 schema stay intact.
CREATE TABLE consultation_selfservice_bookings (
 booking_id TEXT NOT NULL PRIMARY KEY REFERENCES consultation_bookings(id),
 offer_id TEXT NOT NULL UNIQUE REFERENCES consultation_offers(id),
 token_key_id TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TRIGGER consultation_selfservice_immutable BEFORE UPDATE ON consultation_selfservice_bookings BEGIN SELECT RAISE(ABORT,'self-service identity immutable'); END;
CREATE TRIGGER consultation_selfservice_no_delete BEFORE DELETE ON consultation_selfservice_bookings BEGIN SELECT RAISE(ABORT,'self-service history preserved'); END;
