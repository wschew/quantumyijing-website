-- Additive account-ownership step-up. No customer/profile backfill or seed credentials.
CREATE TABLE consultation_account_contacts (
 id TEXT NOT NULL PRIMARY KEY,
 customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 channel TEXT NOT NULL CHECK(channel IN ('email','whatsapp')),
 key_id TEXT NOT NULL, nonce BLOB NOT NULL CHECK(length(nonce)=12),
 ciphertext BLOB NOT NULL CHECK(length(ciphertext) BETWEEN 16 AND 16384),
 fingerprint_key_id TEXT NOT NULL, fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),
 evidence_reference TEXT NOT NULL CHECK(length(evidence_reference) BETWEEN 1 AND 128),
 reviewed_by TEXT NOT NULL REFERENCES consultation_auth_sessions(id) ON DELETE RESTRICT,
 reviewed_at INTEGER NOT NULL, revoked_at INTEGER CHECK(revoked_at IS NULL OR revoked_at>=reviewed_at),
 UNIQUE(key_id,nonce),
 FOREIGN KEY(key_id,nonce) REFERENCES consultation_contact_nonces(key_id,nonce) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX consultation_account_contact_active ON consultation_account_contacts(customer_id,channel) WHERE revoked_at IS NULL;
CREATE TABLE consultation_account_challenges (
 id TEXT NOT NULL PRIMARY KEY,
 customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 context_id TEXT NOT NULL REFERENCES consultation_customer_contexts(id) ON DELETE RESTRICT,
 context_version INTEGER NOT NULL CHECK(context_version>=1),
 contact_id TEXT NOT NULL REFERENCES consultation_account_contacts(id) ON DELETE RESTRICT,
 digest_key_id TEXT NOT NULL, digest TEXT NOT NULL CHECK(length(digest)=64),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+600000),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 consumed_at INTEGER CHECK(consumed_at IS NULL OR (consumed_at>=created_at AND consumed_at<expires_at))
);
CREATE TABLE consultation_account_stepups (
 id TEXT NOT NULL PRIMARY KEY,
 customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 context_id TEXT NOT NULL REFERENCES consultation_customer_contexts(id) ON DELETE RESTRICT,
 context_version INTEGER NOT NULL,
 contact_id TEXT NOT NULL REFERENCES consultation_account_contacts(id) ON DELETE RESTRICT,
 challenge_id TEXT NOT NULL UNIQUE REFERENCES consultation_account_challenges(id) ON DELETE RESTRICT,
 verified_at INTEGER NOT NULL, expires_at INTEGER NOT NULL CHECK(expires_at>verified_at AND expires_at<=verified_at+600000)
);
CREATE TABLE consultation_account_events (
 id TEXT NOT NULL PRIMARY KEY,
 event TEXT NOT NULL CHECK(event IN ('ContactReviewed','ContactRevoked','ChallengeIssued','ChallengeRejected','StepupVerified')),
 customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('Customer','QY')),
 actor_reference TEXT NOT NULL, occurred_at INTEGER NOT NULL
);
CREATE TRIGGER consultation_account_contact_insert BEFORE INSERT ON consultation_account_contacts
 WHEN EXISTS(SELECT 1 FROM consultation_account_contacts WHERE id=NEW.id OR (key_id=NEW.key_id AND nonce=NEW.nonce) OR (customer_id=NEW.customer_id AND channel=NEW.channel AND revoked_at IS NULL))
 OR NEW.revoked_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM customers WHERE id=NEW.customer_id AND status='Active')
 BEGIN SELECT RAISE(ABORT,'account contact rejected'); END;
CREATE TRIGGER consultation_account_contact_update BEFORE UPDATE ON consultation_account_contacts
 WHEN NEW.id IS NOT OLD.id OR NEW.customer_id IS NOT OLD.customer_id OR NEW.channel IS NOT OLD.channel
 OR NEW.key_id IS NOT OLD.key_id OR NEW.nonce IS NOT OLD.nonce OR NEW.ciphertext IS NOT OLD.ciphertext
 OR NEW.fingerprint IS NOT OLD.fingerprint OR NEW.fingerprint_key_id IS NOT OLD.fingerprint_key_id
 OR NEW.evidence_reference IS NOT OLD.evidence_reference OR NEW.reviewed_by IS NOT OLD.reviewed_by OR NEW.reviewed_at IS NOT OLD.reviewed_at
 OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
 BEGIN SELECT RAISE(ABORT,'account contact immutable'); END;
CREATE TRIGGER consultation_account_contact_delete BEFORE DELETE ON consultation_account_contacts BEGIN SELECT RAISE(ABORT,'account contact immutable'); END;
CREATE TRIGGER consultation_account_challenge_insert BEFORE INSERT ON consultation_account_challenges
 WHEN EXISTS(SELECT 1 FROM consultation_account_challenges WHERE id=NEW.id) OR NEW.attempts<>0 OR NEW.consumed_at IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM consultation_account_contacts a JOIN consultation_customer_contexts x ON x.id=NEW.context_id
 WHERE a.id=NEW.contact_id AND a.customer_id=NEW.customer_id AND a.revoked_at IS NULL AND x.customer_id=NEW.customer_id
 AND x.version=NEW.context_version AND x.revoked_at IS NULL AND NEW.expires_at<=x.expires_at)
 BEGIN SELECT RAISE(ABORT,'account challenge rejected'); END;
CREATE TRIGGER consultation_account_challenge_update BEFORE UPDATE ON consultation_account_challenges
 WHEN NEW.id IS NOT OLD.id OR NEW.customer_id IS NOT OLD.customer_id OR NEW.context_id IS NOT OLD.context_id OR NEW.context_version IS NOT OLD.context_version
 OR NEW.contact_id IS NOT OLD.contact_id OR NEW.digest IS NOT OLD.digest OR NEW.digest_key_id IS NOT OLD.digest_key_id
 OR NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at OR OLD.consumed_at IS NOT NULL
 OR OLD.attempts>=5 OR NEW.attempts<>OLD.attempts+1
 BEGIN SELECT RAISE(ABORT,'account challenge immutable'); END;
CREATE TRIGGER consultation_account_challenge_delete BEFORE DELETE ON consultation_account_challenges BEGIN SELECT RAISE(ABORT,'account challenge immutable'); END;
CREATE TRIGGER consultation_account_stepup_insert BEFORE INSERT ON consultation_account_stepups
 WHEN EXISTS(SELECT 1 FROM consultation_account_stepups WHERE id=NEW.id OR challenge_id=NEW.challenge_id)
 OR NOT EXISTS(SELECT 1 FROM consultation_account_challenges h JOIN consultation_account_contacts a ON a.id=h.contact_id
 JOIN consultation_customer_contexts x ON x.id=h.context_id
 WHERE h.id=NEW.challenge_id AND h.customer_id=NEW.customer_id AND h.context_id=NEW.context_id AND h.context_version=NEW.context_version
 AND h.contact_id=NEW.contact_id AND h.consumed_at=NEW.verified_at AND a.revoked_at IS NULL AND x.version=NEW.context_version
 AND x.revoked_at IS NULL AND NEW.expires_at<=x.expires_at)
 BEGIN SELECT RAISE(ABORT,'account stepup rejected'); END;
CREATE TRIGGER consultation_account_stepup_update BEFORE UPDATE ON consultation_account_stepups BEGIN SELECT RAISE(ABORT,'account proof immutable'); END;
CREATE TRIGGER consultation_account_stepup_delete BEFORE DELETE ON consultation_account_stepups BEGIN SELECT RAISE(ABORT,'account proof immutable'); END;
CREATE TRIGGER consultation_account_event_insert BEFORE INSERT ON consultation_account_events
 WHEN EXISTS(SELECT 1 FROM consultation_account_events WHERE id=NEW.id)
 BEGIN SELECT RAISE(ABORT,'account audit rejected'); END;
CREATE TRIGGER consultation_account_event_update BEFORE UPDATE ON consultation_account_events BEGIN SELECT RAISE(ABORT,'account audit immutable'); END;
CREATE TRIGGER consultation_account_event_delete BEFORE DELETE ON consultation_account_events BEGIN SELECT RAISE(ABORT,'account audit immutable'); END;
