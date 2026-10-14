-- Synthetic Preview adapter only; no seed accounts or existing-table alterations.
CREATE TABLE consultation_preview_synthetic_customers (
 customer_id INTEGER NOT NULL PRIMARY KEY REFERENCES customers(id) ON DELETE RESTRICT,
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1))
);
CREATE TRIGGER consultation_preview_seed_check BEFORE INSERT ON consultation_preview_synthetic_customers BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND customer_reference GLOB 'SYNTHETIC-*') THEN RAISE(ABORT,'Synthetic identity required') END;
END;
CREATE TRIGGER consultation_preview_seed_replace BEFORE INSERT ON consultation_preview_synthetic_customers WHEN EXISTS(SELECT 1 FROM consultation_preview_synthetic_customers WHERE customer_id=NEW.customer_id) BEGIN SELECT RAISE(ABORT,'Synthetic identity collision'); END;
CREATE TABLE consultation_preview_assertions(id TEXT NOT NULL PRIMARY KEY, permitted INTEGER NOT NULL CHECK(permitted=1));
CREATE TABLE consultation_preview_outbox (
 challenge_id TEXT NOT NULL PRIMARY KEY REFERENCES consultation_account_challenges(id) ON DELETE RESTRICT,
 key_id TEXT NOT NULL CHECK(length(key_id) BETWEEN 1 AND 128),
 nonce BLOB NOT NULL CHECK(length(nonce)=12),
 ciphertext BLOB NOT NULL CHECK(length(ciphertext)>16),
 expires_at INTEGER NOT NULL CHECK(typeof(expires_at)='integer'),
 UNIQUE(key_id,nonce)
);
CREATE TRIGGER consultation_preview_outbox_replace BEFORE INSERT ON consultation_preview_outbox WHEN EXISTS(SELECT 1 FROM consultation_preview_outbox WHERE challenge_id=NEW.challenge_id OR (key_id=NEW.key_id AND nonce=NEW.nonce)) BEGIN SELECT RAISE(ABORT,'Outbox collision'); END;
CREATE TRIGGER consultation_preview_outbox_update BEFORE UPDATE ON consultation_preview_outbox BEGIN SELECT RAISE(ABORT,'Outbox immutable'); END;
CREATE TABLE consultation_preview_events (
 id TEXT NOT NULL PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('Bootstrap','OutboxRead')),
 actor_session TEXT NOT NULL REFERENCES consultation_auth_sessions(id),
 subject_id TEXT NOT NULL, occurred_at INTEGER NOT NULL
);
CREATE TRIGGER consultation_preview_events_replace BEFORE INSERT ON consultation_preview_events WHEN EXISTS(SELECT 1 FROM consultation_preview_events WHERE id=NEW.id) BEGIN SELECT RAISE(ABORT,'Preview evidence collision'); END;
CREATE TRIGGER consultation_preview_events_update BEFORE UPDATE ON consultation_preview_events BEGIN SELECT RAISE(ABORT,'Preview evidence immutable'); END;
CREATE TRIGGER consultation_preview_events_delete BEFORE DELETE ON consultation_preview_events BEGIN SELECT RAISE(ABORT,'Preview evidence immutable'); END;
