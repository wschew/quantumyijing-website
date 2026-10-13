-- Consultation-only local contact verification. No existing table is changed.
CREATE TABLE consultation_contact_control (
 customer_id INTEGER NOT NULL PRIMARY KEY REFERENCES customers(id) ON DELETE RESTRICT,
 request_window INTEGER NOT NULL, requests INTEGER NOT NULL CHECK(typeof(requests)='integer' AND requests BETWEEN 0 AND 3),
 verify_window INTEGER NOT NULL, attempts INTEGER NOT NULL CHECK(typeof(attempts)='integer' AND attempts BETWEEN 0 AND 10)
);
CREATE TABLE consultation_contact_nonces (
 key_id TEXT NOT NULL CHECK(length(key_id) BETWEEN 1 AND 128 AND key_id NOT GLOB '*[^A-Za-z0-9_-]*'), nonce BLOB NOT NULL CHECK(typeof(nonce)='blob' AND length(nonce)=12),
 PRIMARY KEY(key_id,nonce)
);
CREATE TABLE consultation_contact_challenges (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128 AND id NOT GLOB '*[^A-Za-z0-9_-]*'), customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 context_id TEXT NOT NULL REFERENCES consultation_customer_contexts(id) ON DELETE RESTRICT,
 context_version INTEGER NOT NULL CHECK(typeof(context_version)='integer' AND context_version>=1), channel TEXT NOT NULL CHECK(channel IN ('email','whatsapp')),
 purpose TEXT NOT NULL DEFAULT 'report_delivery' CHECK(purpose='report_delivery'),
 key_id TEXT NOT NULL CHECK(length(key_id) BETWEEN 1 AND 128 AND key_id NOT GLOB '*[^A-Za-z0-9_-]*'), fingerprint_key_id TEXT NOT NULL CHECK(length(fingerprint_key_id) BETWEEN 1 AND 128 AND fingerprint_key_id NOT GLOB '*[^A-Za-z0-9_-]*'), fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64 AND fingerprint NOT GLOB '*[^a-f0-9]*'),
 challenge_key_id TEXT NOT NULL CHECK(length(challenge_key_id) BETWEEN 1 AND 128 AND challenge_key_id NOT GLOB '*[^A-Za-z0-9_-]*'), challenge_hash TEXT NOT NULL CHECK(length(challenge_hash)=64 AND challenge_hash NOT GLOB '*[^a-f0-9]*'),
 nonce BLOB NOT NULL CHECK(typeof(nonce)='blob' AND length(nonce)=12), ciphertext BLOB NOT NULL CHECK(typeof(ciphertext)='blob' AND length(ciphertext) BETWEEN 16 AND 2048),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(typeof(revision)='integer' AND revision>=1), state TEXT NOT NULL CHECK(state IN ('PendingDelivery','Delivered','Verified','Locked','Cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(typeof(attempts)='integer' AND attempts BETWEEN 0 AND 5),
 requested_at INTEGER NOT NULL, expires_at INTEGER NOT NULL CHECK(expires_at>requested_at AND expires_at<=requested_at+600000),
 delivered_at INTEGER, verified_at INTEGER, superseded_by TEXT,
 CHECK((state IN ('Delivered','Verified','Locked') AND delivered_at IS NOT NULL) OR state IN ('PendingDelivery','Cancelled')),
 CHECK((state='Verified' AND verified_at IS NOT NULL) OR (state<>'Verified' AND verified_at IS NULL)),
 CHECK((state='Cancelled' AND superseded_by IS NOT NULL) OR (state<>'Cancelled' AND superseded_by IS NULL)),
 FOREIGN KEY(key_id,nonce) REFERENCES consultation_contact_nonces(key_id,nonce) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX idx_consultation_contact_pending ON consultation_contact_challenges(customer_id,channel) WHERE state IN ('PendingDelivery','Delivered');
CREATE INDEX idx_consultation_contact_context ON consultation_contact_challenges(context_id,context_version,expires_at);
CREATE TABLE consultation_verified_contacts (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128 AND id NOT GLOB '*[^A-Za-z0-9_-]*'), challenge_id TEXT NOT NULL UNIQUE REFERENCES consultation_contact_challenges(id) ON DELETE RESTRICT,
 customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 context_id TEXT NOT NULL REFERENCES consultation_customer_contexts(id) ON DELETE RESTRICT,
 context_version INTEGER NOT NULL CHECK(typeof(context_version)='integer' AND context_version>=1), channel TEXT NOT NULL CHECK(channel IN ('email','whatsapp')),
 key_id TEXT NOT NULL CHECK(length(key_id) BETWEEN 1 AND 128 AND key_id NOT GLOB '*[^A-Za-z0-9_-]*'), fingerprint_key_id TEXT NOT NULL CHECK(length(fingerprint_key_id) BETWEEN 1 AND 128 AND fingerprint_key_id NOT GLOB '*[^A-Za-z0-9_-]*'), fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64 AND fingerprint NOT GLOB '*[^a-f0-9]*'),
 challenge_key_id TEXT NOT NULL CHECK(length(challenge_key_id) BETWEEN 1 AND 128 AND challenge_key_id NOT GLOB '*[^A-Za-z0-9_-]*'), challenge_hash TEXT NOT NULL CHECK(length(challenge_hash)=64 AND challenge_hash NOT GLOB '*[^a-f0-9]*'),
 nonce BLOB NOT NULL CHECK(typeof(nonce)='blob' AND length(nonce)=12), ciphertext BLOB NOT NULL CHECK(typeof(ciphertext)='blob' AND length(ciphertext) BETWEEN 16 AND 2048),
 verified_at INTEGER NOT NULL, expires_at INTEGER NOT NULL CHECK(expires_at>verified_at), revoked_at INTEGER,
 FOREIGN KEY(key_id,nonce) REFERENCES consultation_contact_nonces(key_id,nonce) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX idx_consultation_contact_verified ON consultation_verified_contacts(customer_id,channel) WHERE revoked_at IS NULL;
CREATE TABLE consultation_contact_events (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128 AND id NOT GLOB '*[^A-Za-z0-9_-]*'), customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 context_id TEXT NOT NULL REFERENCES consultation_customer_contexts(id) ON DELETE RESTRICT,
 challenge_id TEXT REFERENCES consultation_contact_challenges(id) ON DELETE RESTRICT,
 event TEXT NOT NULL CHECK(event IN ('RequestReserved','Requested','Superseded','VerificationReserved','Verified','Failed','InstructionsViewed','Delivered')),
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('Customer','QY')), actor_reference TEXT NOT NULL, occurred_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_consultation_contact_instruction_audit ON consultation_contact_events(challenge_id,actor_reference) WHERE event='InstructionsViewed';
CREATE TRIGGER consultation_contact_challenge_insert BEFORE INSERT ON consultation_contact_challenges
 WHEN EXISTS(SELECT 1 FROM consultation_contact_challenges WHERE id=NEW.id)
 OR NEW.state<>'PendingDelivery' OR NEW.revision<>1 OR NEW.attempts<>0 OR NEW.delivered_at IS NOT NULL OR NEW.verified_at IS NOT NULL OR NEW.superseded_by IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM consultation_customer_contexts x WHERE x.id=NEW.context_id AND x.customer_id=NEW.customer_id AND x.version=NEW.context_version AND x.revoked_at IS NULL AND NEW.expires_at<=x.expires_at)
 BEGIN SELECT RAISE(ABORT,'contact challenge insert rejected'); END;
CREATE TRIGGER consultation_contact_challenge_update BEFORE UPDATE ON consultation_contact_challenges
 WHEN NEW.id IS NOT OLD.id OR NEW.customer_id IS NOT OLD.customer_id OR NEW.context_id IS NOT OLD.context_id OR NEW.context_version IS NOT OLD.context_version
 OR NEW.channel IS NOT OLD.channel OR NEW.purpose IS NOT OLD.purpose OR NEW.key_id IS NOT OLD.key_id OR NEW.fingerprint_key_id IS NOT OLD.fingerprint_key_id
 OR NEW.fingerprint IS NOT OLD.fingerprint OR NEW.challenge_key_id IS NOT OLD.challenge_key_id OR NEW.challenge_hash IS NOT OLD.challenge_hash
 OR NEW.nonce IS NOT OLD.nonce OR NEW.ciphertext IS NOT OLD.ciphertext OR NEW.requested_at IS NOT OLD.requested_at OR NEW.expires_at IS NOT OLD.expires_at
 OR NEW.revision<>OLD.revision+1 OR OLD.state IN ('Verified','Locked','Cancelled')
 OR NOT ((OLD.state='PendingDelivery' AND NEW.state IN ('Delivered','Cancelled') AND NEW.attempts=OLD.attempts)
 OR (OLD.state='Delivered' AND NEW.state='Cancelled' AND NEW.attempts=OLD.attempts)
 OR (OLD.state='Delivered' AND NEW.attempts=OLD.attempts+1 AND ((NEW.state='Delivered' AND NEW.attempts<5) OR NEW.state='Verified' OR (NEW.state='Locked' AND NEW.attempts=5))))
 OR (OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS NOT OLD.delivered_at)
 BEGIN SELECT RAISE(ABORT,'contact challenge transition rejected'); END;
CREATE TRIGGER consultation_contact_proof_insert BEFORE INSERT ON consultation_verified_contacts
 WHEN EXISTS(SELECT 1 FROM consultation_verified_contacts WHERE id=NEW.id OR challenge_id=NEW.challenge_id OR (customer_id=NEW.customer_id AND channel=NEW.channel AND revoked_at IS NULL))
 OR NEW.revoked_at IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM consultation_contact_challenges h JOIN consultation_customer_contexts x ON x.id=h.context_id
  WHERE h.id=NEW.challenge_id AND h.state='Verified' AND h.customer_id=NEW.customer_id AND h.context_id=NEW.context_id AND h.context_version=NEW.context_version
  AND h.channel=NEW.channel AND h.fingerprint=NEW.fingerprint AND h.fingerprint_key_id=NEW.fingerprint_key_id AND h.challenge_hash=NEW.challenge_hash AND h.challenge_key_id=NEW.challenge_key_id
  AND x.version=NEW.context_version AND x.revoked_at IS NULL AND NEW.expires_at<=x.expires_at AND h.verified_at=NEW.verified_at)
 BEGIN SELECT RAISE(ABORT,'contact proof insert rejected'); END;
CREATE TRIGGER consultation_contact_proof_update BEFORE UPDATE ON consultation_verified_contacts
 WHEN NEW.id IS NOT OLD.id OR NEW.challenge_id IS NOT OLD.challenge_id OR NEW.customer_id IS NOT OLD.customer_id OR NEW.context_id IS NOT OLD.context_id OR NEW.context_version IS NOT OLD.context_version
 OR NEW.channel IS NOT OLD.channel OR NEW.key_id IS NOT OLD.key_id OR NEW.fingerprint_key_id IS NOT OLD.fingerprint_key_id OR NEW.fingerprint IS NOT OLD.fingerprint
 OR NEW.challenge_key_id IS NOT OLD.challenge_key_id OR NEW.challenge_hash IS NOT OLD.challenge_hash OR NEW.nonce IS NOT OLD.nonce OR NEW.ciphertext IS NOT OLD.ciphertext
 OR NEW.verified_at IS NOT OLD.verified_at OR NEW.expires_at IS NOT OLD.expires_at OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR NEW.revoked_at<OLD.verified_at
 BEGIN SELECT RAISE(ABORT,'contact proof immutable'); END;
CREATE TRIGGER consultation_contact_event_insert BEFORE INSERT ON consultation_contact_events
 WHEN NEW.id IS NULL OR EXISTS(SELECT 1 FROM consultation_contact_events WHERE id=NEW.id OR (event='InstructionsViewed' AND NEW.event='InstructionsViewed' AND challenge_id=NEW.challenge_id AND actor_reference=NEW.actor_reference))
 OR NOT EXISTS(SELECT 1 FROM consultation_customer_contexts WHERE id=NEW.context_id AND customer_id=NEW.customer_id)
 OR (NEW.challenge_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM consultation_contact_challenges WHERE id=NEW.challenge_id AND customer_id=NEW.customer_id))
 BEGIN SELECT RAISE(ABORT,'contact authorization or quota failed'); END;
CREATE TRIGGER consultation_contact_event_no_update BEFORE UPDATE ON consultation_contact_events BEGIN SELECT RAISE(ABORT,'contact evidence immutable'); END;
CREATE TRIGGER consultation_contact_event_no_delete BEFORE DELETE ON consultation_contact_events BEGIN SELECT RAISE(ABORT,'contact evidence immutable'); END;
CREATE TRIGGER consultation_contact_nonce_insert BEFORE INSERT ON consultation_contact_nonces
 WHEN EXISTS(SELECT 1 FROM consultation_contact_nonces WHERE key_id=NEW.key_id AND nonce=NEW.nonce)
 BEGIN SELECT RAISE(ABORT,'contact nonce reuse rejected'); END;
CREATE TRIGGER consultation_contact_nonce_no_update BEFORE UPDATE ON consultation_contact_nonces BEGIN SELECT RAISE(ABORT,'contact nonce immutable'); END;
CREATE TRIGGER consultation_contact_nonce_no_delete BEFORE DELETE ON consultation_contact_nonces BEGIN SELECT RAISE(ABORT,'contact nonce immutable'); END;
