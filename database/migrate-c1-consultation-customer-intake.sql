-- Local-only C1-C2A-2 Step 1. Independent intake drafts; no booking/payment/PDF integration.
CREATE TABLE consultation_customer_intakes (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128 AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
 customer_id INTEGER NOT NULL CHECK(typeof(customer_id)='integer' AND customer_id>0) REFERENCES customers(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL CHECK(typeof(revision)='integer' AND revision>=1),
 payload_version INTEGER NOT NULL CHECK(typeof(payload_version)='integer' AND payload_version>=1),
 schema_version INTEGER NOT NULL CHECK(schema_version=1),
 key_id TEXT NOT NULL CHECK(length(key_id)>0),
 nonce BLOB NOT NULL CHECK(typeof(nonce)='blob' AND length(nonce)=12),
 ciphertext BLOB NOT NULL CHECK(typeof(ciphertext)='blob' AND length(ciphertext) BETWEEN 16 AND 16384),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer'), updated_at INTEGER NOT NULL CHECK(typeof(updated_at)='integer' AND updated_at>=created_at),
 retention_basis TEXT NOT NULL DEFAULT 'Pending' CHECK(retention_basis IN ('Pending','Completed','FinalExpired','FinalDeclined','FinalCancelled')),
 retention_until INTEGER, completed_at INTEGER, terminal_at INTEGER,
 lawful_hold INTEGER NOT NULL DEFAULT 0 CHECK(lawful_hold IN (0,1)), hold_reference TEXT,
 CHECK((retention_basis='Pending' AND retention_until IS NULL AND completed_at IS NULL AND terminal_at IS NULL) OR (retention_basis='Completed' AND retention_until IS NOT NULL AND completed_at IS NOT NULL AND terminal_at IS NULL AND retention_until>completed_at) OR (retention_basis IN ('FinalExpired','FinalDeclined','FinalCancelled') AND retention_until IS NOT NULL AND terminal_at IS NOT NULL AND completed_at IS NULL AND retention_until>terminal_at)),
 CHECK(lawful_hold=0 OR (hold_reference IS NOT NULL AND length(hold_reference)>0)),
 UNIQUE(id,customer_id), UNIQUE(key_id,nonce)
);
CREATE TABLE consultation_intake_consents (
 id TEXT NOT NULL PRIMARY KEY,
 intake_id TEXT NOT NULL, customer_id INTEGER NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose IN ('consultation_privacy','future_calculations','marketing')),
 sequence INTEGER NOT NULL CHECK(typeof(sequence)='integer' AND sequence>=1),
 policy_version TEXT NOT NULL CHECK(length(policy_version)>0),
 policy_hash TEXT NOT NULL CHECK(length(policy_hash)=64 AND policy_hash NOT GLOB '*[^a-f0-9]*'),
 state TEXT NOT NULL CHECK(state IN ('Granted','Declined','Withdrawn')),
 occurred_at INTEGER NOT NULL CHECK(typeof(occurred_at)='integer'),
 FOREIGN KEY(intake_id,customer_id) REFERENCES consultation_customer_intakes(id,customer_id) ON DELETE RESTRICT,
 UNIQUE(intake_id,purpose,sequence)
);
CREATE TABLE consultation_intake_commands (
 customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
 command_id TEXT NOT NULL, intake_id TEXT NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('Submit','Withdraw','DeletionReview','Metadata')),
 fingerprint_key_id TEXT NOT NULL, fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64 AND fingerprint NOT GLOB '*[^a-f0-9]*'),
 result_revision INTEGER NOT NULL CHECK(result_revision>=1), occurred_at INTEGER NOT NULL CHECK(typeof(occurred_at)='integer'),
 PRIMARY KEY(customer_id,command_id),
 FOREIGN KEY(intake_id,customer_id) REFERENCES consultation_customer_intakes(id,customer_id) ON DELETE RESTRICT
);
CREATE TABLE consultation_intake_reviews (
 id TEXT NOT NULL PRIMARY KEY, intake_id TEXT NOT NULL, customer_id INTEGER NOT NULL,
 reason TEXT NOT NULL CHECK(reason IN ('PrivacyWithdrawal','DeletionRequest','RetentionApproaching')),
 state TEXT NOT NULL DEFAULT 'Pending' CHECK(state IN ('Pending','Held','Reviewed')),
 requested_at INTEGER NOT NULL CHECK(typeof(requested_at)='integer'),
 FOREIGN KEY(intake_id,customer_id) REFERENCES consultation_customer_intakes(id,customer_id) ON DELETE RESTRICT
);
CREATE TABLE consultation_intake_access_audit (
 id TEXT NOT NULL PRIMARY KEY, intake_id TEXT NOT NULL, customer_id INTEGER NOT NULL,
 event TEXT NOT NULL CHECK(event IN ('Submitted','ConsentWithdrawn','DeletionRequested','CustomerRead','QYRead')),
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('Customer','QY')),
 actor_reference TEXT NOT NULL, occurred_at INTEGER NOT NULL CHECK(typeof(occurred_at)='integer'),
 FOREIGN KEY(intake_id,customer_id) REFERENCES consultation_customer_intakes(id,customer_id) ON DELETE RESTRICT
);
CREATE INDEX idx_consultation_intake_customer ON consultation_customer_intakes(customer_id);
CREATE INDEX idx_consultation_intake_retention_review ON consultation_customer_intakes(retention_until,lawful_hold);
CREATE INDEX idx_consultation_intake_consent_latest ON consultation_intake_consents(intake_id,purpose,sequence DESC);
CREATE TRIGGER consultation_customer_intake_identity BEFORE UPDATE ON consultation_customer_intakes
 WHEN NEW.id IS NOT OLD.id OR NEW.customer_id IS NOT OLD.customer_id OR NEW.created_at IS NOT OLD.created_at OR NEW.updated_at<OLD.updated_at OR NEW.revision<>OLD.revision+1
 OR NEW.payload_version <> OLD.payload_version + CASE WHEN NEW.key_id IS NOT OLD.key_id OR NEW.nonce IS NOT OLD.nonce OR NEW.ciphertext IS NOT OLD.ciphertext OR NEW.schema_version IS NOT OLD.schema_version THEN 1 ELSE 0 END
 BEGIN SELECT RAISE(ABORT,'intake identity/version conflict'); END;
CREATE TRIGGER consultation_intake_command_gate BEFORE INSERT ON consultation_intake_commands
 WHEN NEW.result_revision IS NULL
 BEGIN SELECT RAISE(ABORT,'consultation intake conflict'); END;
CREATE TRIGGER consultation_intake_consent_no_update BEFORE UPDATE ON consultation_intake_consents
 BEGIN SELECT RAISE(ABORT,'consent evidence immutable'); END;
CREATE TRIGGER consultation_intake_consent_no_delete BEFORE DELETE ON consultation_intake_consents
 BEGIN SELECT RAISE(ABORT,'consent evidence immutable'); END;
CREATE TRIGGER consultation_intake_command_no_update BEFORE UPDATE ON consultation_intake_commands
 BEGIN SELECT RAISE(ABORT,'command evidence immutable'); END;
CREATE TRIGGER consultation_intake_command_no_delete BEFORE DELETE ON consultation_intake_commands
 BEGIN SELECT RAISE(ABORT,'command evidence immutable'); END;
CREATE TRIGGER consultation_intake_access_no_update BEFORE UPDATE ON consultation_intake_access_audit
 BEGIN SELECT RAISE(ABORT,'intake audit immutable'); END;
CREATE TRIGGER consultation_intake_access_no_delete BEFORE DELETE ON consultation_intake_access_audit
 BEGIN SELECT RAISE(ABORT,'intake audit immutable'); END;
-- BEFORE INSERT runs before REPLACE deletes any conflicting row, even with recursive_triggers=0.
CREATE TRIGGER consultation_consent_append BEFORE INSERT ON consultation_intake_consents
 WHEN EXISTS(SELECT 1 FROM consultation_intake_consents WHERE id=NEW.id OR (intake_id=NEW.intake_id AND purpose=NEW.purpose AND sequence=NEW.sequence))
 OR NEW.sequence <> COALESCE((SELECT MAX(sequence)+1 FROM consultation_intake_consents WHERE intake_id=NEW.intake_id AND purpose=NEW.purpose),1)
 OR NEW.occurred_at < COALESCE((SELECT occurred_at FROM consultation_intake_consents WHERE intake_id=NEW.intake_id AND purpose=NEW.purpose ORDER BY sequence DESC LIMIT 1),NEW.occurred_at)
 OR (NEW.state='Withdrawn' AND COALESCE((SELECT state FROM consultation_intake_consents WHERE intake_id=NEW.intake_id AND purpose=NEW.purpose ORDER BY sequence DESC LIMIT 1),'') <> 'Granted')
 BEGIN SELECT RAISE(ABORT,'consent append rejected'); END;
CREATE TRIGGER consultation_command_append BEFORE INSERT ON consultation_intake_commands
 WHEN EXISTS(SELECT 1 FROM consultation_intake_commands WHERE customer_id=NEW.customer_id AND command_id=NEW.command_id)
 OR NOT EXISTS(SELECT 1 FROM consultation_customer_intakes WHERE id=NEW.intake_id AND customer_id=NEW.customer_id AND revision=NEW.result_revision)
 BEGIN SELECT RAISE(ABORT,'command append rejected'); END;
CREATE TRIGGER consultation_access_append BEFORE INSERT ON consultation_intake_access_audit
 WHEN EXISTS(SELECT 1 FROM consultation_intake_access_audit WHERE id=NEW.id)
 BEGIN SELECT RAISE(ABORT,'audit append rejected'); END;
CREATE TRIGGER consultation_intake_no_replace BEFORE INSERT ON consultation_customer_intakes
 WHEN EXISTS(SELECT 1 FROM consultation_customer_intakes WHERE id=NEW.id OR (key_id=NEW.key_id AND nonce=NEW.nonce))
 BEGIN SELECT RAISE(ABORT,'intake replacement rejected'); END;
