-- Disposable synthetic prototype only, never a C1 migration.
CREATE TABLE account(id INTEGER PRIMARY KEY CHECK(id=1),epoch INTEGER NOT NULL,handle TEXT NOT NULL,bootstrap_hash TEXT NOT NULL,closed INTEGER NOT NULL DEFAULT 0,key_epoch INTEGER NOT NULL DEFAULT 1);
CREATE TABLE credential(id TEXT PRIMARY KEY,key TEXT NOT NULL UNIQUE,count INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,key_epoch INTEGER NOT NULL DEFAULT 1);
CREATE TABLE challenge(hash TEXT PRIMARY KEY,kind TEXT NOT NULL,expires INTEGER NOT NULL,epoch INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0,authority TEXT,bootstrap INTEGER NOT NULL);
CREATE TABLE session(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL,epoch INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);
CREATE TABLE atomic_guard(ok INTEGER NOT NULL CHECK(ok=1));

-- Auth-security retention is independent of business-record retention.
CREATE INDEX credential_active ON credential(key_epoch,revoked);
CREATE INDEX challenge_expiry ON challenge(expires,hash);
CREATE INDEX session_expiry ON session(expires,hash);
CREATE TABLE security_event(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,kind TEXT NOT NULL,epoch INTEGER NOT NULL,hold INTEGER NOT NULL DEFAULT 0,subject TEXT);
CREATE INDEX security_event_retention ON security_event(hold,at);
-- Fixed scopes only: no attacker-controlled source-key cardinality.
CREATE TABLE rate_bucket(scope TEXT PRIMARY KEY,window INTEGER NOT NULL,hits INTEGER NOT NULL);
-- B4B-1 prototype-only additions. Never apply to existing owner evidence DBs.
CREATE TABLE security_state(id INTEGER PRIMARY KEY CHECK(id=1),mode TEXT NOT NULL CHECK(mode IN ('ACTIVE','SUSPENDED','QUARANTINED')));
INSERT INTO security_state VALUES(1,'ACTIVE');
CREATE TABLE credential_custody(id TEXT PRIMARY KEY REFERENCES credential(id),group_id TEXT NOT NULL);
CREATE TABLE session_binding(hash TEXT PRIMARY KEY REFERENCES session(hash) ON DELETE CASCADE,csrf_hash TEXT NOT NULL,credential_id TEXT NOT NULL REFERENCES credential(id));
