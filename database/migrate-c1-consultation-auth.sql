-- C1-C2A-1 local-only authentication foundation. No default account or password.
CREATE TABLE consultation_auth_account (
 id INTEGER CHECK(id IS NULL OR typeof(id)='integer') NOT NULL PRIMARY KEY CHECK(id=1),
 username TEXT NOT NULL UNIQUE CHECK(length(username) BETWEEN 3 AND 64 AND username=lower(username) AND username NOT GLOB '*[^a-z0-9_-]*'),
 enabled INTEGER CHECK(enabled IS NULL OR typeof(enabled)='integer') NOT NULL CHECK(enabled IN (0,1)),
 password_algorithm TEXT NOT NULL CHECK(password_algorithm='PBKDF2-SHA256'),
 password_iterations INTEGER CHECK(password_iterations IS NULL OR typeof(password_iterations)='integer') NOT NULL CHECK(password_iterations=600000),
 password_salt TEXT NOT NULL CHECK(length(password_salt)=64 AND password_salt NOT GLOB '*[^a-f0-9]*'),
 password_hash TEXT NOT NULL CHECK(length(password_hash)=64 AND password_hash NOT GLOB '*[^a-f0-9]*'),
 password_version INTEGER CHECK(password_version IS NULL OR typeof(password_version)='integer') NOT NULL CHECK(password_version>=1),
 created_at INTEGER NOT NULL CHECK(typeof(created_at)='integer')
);
CREATE TABLE consultation_auth_control (
 id INTEGER CHECK(id IS NULL OR typeof(id)='integer') NOT NULL PRIMARY KEY CHECK(id=1),
 attempts INTEGER CHECK(attempts IS NULL OR typeof(attempts)='integer') NOT NULL CHECK(attempts BETWEEN 0 AND 5),
 window_started_at INTEGER CHECK(window_started_at IS NULL OR typeof(window_started_at)='integer') NOT NULL,
 failure_count INTEGER NOT NULL DEFAULT 0 CHECK(typeof(failure_count)='integer' AND failure_count BETWEEN 0 AND 1000000000),
 last_failed_at INTEGER CHECK(last_failed_at IS NULL OR typeof(last_failed_at)='integer'),
 locked_until INTEGER CHECK(locked_until IS NULL OR typeof(locked_until)='integer') NOT NULL
);
INSERT INTO consultation_auth_control (id,attempts,window_started_at,locked_until) VALUES(1,0,0,0);
CREATE TABLE consultation_auth_sessions (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(id)>0),
 account_id INTEGER CHECK(account_id IS NULL OR typeof(account_id)='integer') NOT NULL REFERENCES consultation_auth_account(id) ON DELETE RESTRICT CHECK(account_id=1),
 token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64 AND token_hash NOT GLOB '*[^a-f0-9]*'),
 csrf_hash TEXT NOT NULL CHECK(length(csrf_hash)=64 AND csrf_hash NOT GLOB '*[^a-f0-9]*'),
 password_version INTEGER CHECK(password_version IS NULL OR typeof(password_version)='integer') NOT NULL CHECK(password_version>=1),
 created_at INTEGER CHECK(created_at IS NULL OR typeof(created_at)='integer') NOT NULL,
 expires_at INTEGER CHECK(expires_at IS NULL OR typeof(expires_at)='integer') NOT NULL CHECK(expires_at>created_at AND expires_at<=created_at+28800000),
 revoked_at INTEGER CHECK(revoked_at IS NULL OR typeof(revoked_at)='integer')
);
CREATE TABLE consultation_auth_audit (
 id TEXT NOT NULL PRIMARY KEY CHECK(length(id)>0),
 account_id INTEGER CHECK(account_id IS NULL OR typeof(account_id)='integer') REFERENCES consultation_auth_account(id) ON DELETE RESTRICT,
 session_id TEXT REFERENCES consultation_auth_sessions(id) ON DELETE RESTRICT,
 event TEXT NOT NULL CHECK(event IN ('provisioned','login_failed','rate_limited','login_success','logout','revoke_all','credential_rotated')),
 occurred_at INTEGER CHECK(occurred_at IS NULL OR typeof(occurred_at)='integer') NOT NULL,
 CHECK(event<>'login_success' OR (account_id IS NOT NULL AND session_id IS NOT NULL))
);
CREATE INDEX idx_consultation_auth_session_expiry ON consultation_auth_sessions(account_id,expires_at,revoked_at);
CREATE TRIGGER consultation_auth_audit_no_update BEFORE UPDATE ON consultation_auth_audit
 BEGIN SELECT RAISE(ABORT,'authentication audit immutable'); END;
CREATE TRIGGER consultation_auth_audit_no_delete BEFORE DELETE ON consultation_auth_audit
 BEGIN SELECT RAISE(ABORT,'authentication audit immutable'); END;
CREATE TRIGGER consultation_auth_password_version_guard BEFORE UPDATE ON consultation_auth_account
 WHEN NEW.password_version<OLD.password_version OR
 ((NEW.password_hash IS NOT OLD.password_hash OR NEW.password_salt IS NOT OLD.password_salt OR
   NEW.password_algorithm IS NOT OLD.password_algorithm OR NEW.password_iterations IS NOT OLD.password_iterations)
  AND NEW.password_version<>OLD.password_version+1)
 BEGIN SELECT RAISE(ABORT,'credential version must advance'); END;
CREATE TRIGGER consultation_auth_session_immutable BEFORE UPDATE ON consultation_auth_sessions
 WHEN NEW.id IS NOT OLD.id OR NEW.account_id IS NOT OLD.account_id OR NEW.token_hash IS NOT OLD.token_hash OR
 NEW.csrf_hash IS NOT OLD.csrf_hash OR NEW.password_version IS NOT OLD.password_version OR
 NEW.created_at IS NOT OLD.created_at OR NEW.expires_at IS NOT OLD.expires_at OR
 (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NOT OLD.revoked_at)
 BEGIN SELECT RAISE(ABORT,'session identity and revocation immutable'); END;
CREATE TRIGGER consultation_auth_mutation_gate BEFORE INSERT ON consultation_auth_audit
 WHEN NEW.event IN ('login_success','logout','revoke_all') AND (NEW.account_id IS NULL OR NEW.session_id IS NULL)
 BEGIN SELECT RAISE(ABORT,'consultation authorization failed'); END;
