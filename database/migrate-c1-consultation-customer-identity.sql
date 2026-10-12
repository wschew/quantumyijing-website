-- C1-C2A-3A: local-only context state; no contact records, accounts or public routes.
CREATE TABLE consultation_customer_contexts (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128 AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
 portal_session_id INTEGER NOT NULL UNIQUE CHECK(typeof(portal_session_id)='integer' AND portal_session_id>0) REFERENCES academy_portal_sessions(id) ON DELETE RESTRICT,
 customer_id INTEGER NOT NULL CHECK(typeof(customer_id)='integer' AND customer_id>0) REFERENCES customers(id) ON DELETE RESTRICT,
 token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64 AND token_hash NOT GLOB '*[^a-f0-9]*'),
 csrf_hash TEXT NOT NULL CHECK(length(csrf_hash)=64 AND csrf_hash NOT GLOB '*[^a-f0-9]*'),
 version INTEGER NOT NULL CHECK(typeof(version)='integer' AND version>=1),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer'),
 issued_at INTEGER NOT NULL CHECK(typeof(issued_at)='integer' AND issued_at>=created_at),
 expires_at INTEGER NOT NULL CHECK(typeof(expires_at)='integer' AND expires_at>issued_at AND expires_at<=issued_at+1800000),
 revoked_at INTEGER CHECK(revoked_at IS NULL OR (typeof(revoked_at)='integer' AND revoked_at>=issued_at))
);
CREATE INDEX idx_consultation_context_expiry ON consultation_customer_contexts(expires_at,revoked_at);
CREATE TABLE consultation_customer_context_events (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128 AND id NOT GLOB '*[^A-Za-z0-9_-]*'),
 context_id TEXT NOT NULL REFERENCES consultation_customer_contexts(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL CHECK(typeof(version)='integer' AND version>=1),
 event TEXT NOT NULL CHECK(event IN ('Established','Rotated','Revoked')),
 occurred_at INTEGER NOT NULL CHECK(typeof(occurred_at)='integer'),
 UNIQUE(context_id,version)
);
CREATE TRIGGER consultation_context_insert BEFORE INSERT ON consultation_customer_contexts
 WHEN EXISTS(SELECT 1 FROM consultation_customer_contexts WHERE id=NEW.id OR portal_session_id=NEW.portal_session_id OR token_hash=NEW.token_hash)
 OR NEW.version<>1 OR NEW.revoked_at IS NOT NULL OR NEW.issued_at>(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
 OR NOT EXISTS(SELECT 1 FROM academy_portal_sessions p JOIN customers c ON c.id=p.customer_id
  WHERE p.id=NEW.portal_session_id AND p.customer_id=NEW.customer_id AND c.status='Active'
  AND COALESCE(p.revoked_at,'')='' AND (CAST(strftime('%s',p.expires_at) AS INTEGER)*1000+CAST(substr(strftime('%f',p.expires_at),4,3) AS INTEGER))>(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
  AND NEW.expires_at<=(CAST(strftime('%s',p.expires_at) AS INTEGER)*1000+CAST(substr(strftime('%f',p.expires_at),4,3) AS INTEGER)))
 BEGIN SELECT RAISE(ABORT,'customer context insert rejected'); END;
CREATE TRIGGER consultation_context_update BEFORE UPDATE ON consultation_customer_contexts
 WHEN NEW.id IS NOT OLD.id OR NEW.portal_session_id IS NOT OLD.portal_session_id OR NEW.customer_id IS NOT OLD.customer_id
 OR NEW.created_at IS NOT OLD.created_at OR NEW.version<>OLD.version+1 OR NEW.issued_at<OLD.issued_at OR NEW.issued_at>(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
 OR NOT (
  (NEW.token_hash IS NOT OLD.token_hash AND NEW.csrf_hash IS NOT OLD.csrf_hash AND NEW.revoked_at IS NULL
   AND NEW.issued_at>=COALESCE(OLD.revoked_at,OLD.issued_at))
  OR (NEW.token_hash IS OLD.token_hash AND NEW.csrf_hash IS OLD.csrf_hash AND OLD.revoked_at IS NULL
   AND NEW.revoked_at IS NOT NULL AND NEW.issued_at=OLD.issued_at AND NEW.expires_at=OLD.expires_at)
 )
 OR NOT EXISTS(SELECT 1 FROM academy_portal_sessions p JOIN customers c ON c.id=p.customer_id
  WHERE p.id=NEW.portal_session_id AND p.customer_id=NEW.customer_id AND c.status='Active'
  AND COALESCE(p.revoked_at,'')='' AND (CAST(strftime('%s',p.expires_at) AS INTEGER)*1000+CAST(substr(strftime('%f',p.expires_at),4,3) AS INTEGER))>(CAST(strftime('%s','now') AS INTEGER)*1000+CAST(substr(strftime('%f','now'),4,3) AS INTEGER))
  AND (NEW.revoked_at IS NOT NULL OR NEW.expires_at<=(CAST(strftime('%s',p.expires_at) AS INTEGER)*1000+CAST(substr(strftime('%f',p.expires_at),4,3) AS INTEGER))))
 BEGIN SELECT RAISE(ABORT,'customer context update rejected'); END;
CREATE TRIGGER consultation_context_event_insert BEFORE INSERT ON consultation_customer_context_events
 WHEN NEW.context_id IS NULL
 OR EXISTS(SELECT 1 FROM consultation_customer_context_events WHERE id=NEW.id OR (context_id=NEW.context_id AND version=NEW.version))
 OR NOT EXISTS(SELECT 1 FROM consultation_customer_contexts x WHERE x.id=NEW.context_id AND x.version=NEW.version
  AND ((NEW.event='Revoked' AND x.revoked_at IS NOT NULL) OR (NEW.event IN ('Established','Rotated') AND x.revoked_at IS NULL)))
 BEGIN SELECT RAISE(ABORT,'customer context authorization failed'); END;
CREATE TRIGGER consultation_context_event_no_update BEFORE UPDATE ON consultation_customer_context_events
 BEGIN SELECT RAISE(ABORT,'customer context evidence immutable'); END;
CREATE TRIGGER consultation_context_event_no_delete BEFORE DELETE ON consultation_customer_context_events
 BEGIN SELECT RAISE(ABORT,'customer context evidence immutable'); END;
