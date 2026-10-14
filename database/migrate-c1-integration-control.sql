-- U3-A additive control only. No account, customer or resource provisioning.
CREATE TABLE consultation_migration_ledger (
 ordinal INTEGER NOT NULL PRIMARY KEY CHECK(typeof(ordinal)='integer' AND ordinal>0),
 path TEXT NOT NULL UNIQUE CHECK(length(path)>0),
 canonical_sha256 TEXT NOT NULL CHECK(length(canonical_sha256)=64 AND canonical_sha256 NOT GLOB '*[^a-f0-9]*'),
 applied_at INTEGER NOT NULL CHECK(typeof(applied_at)='integer' AND applied_at>0)
);
CREATE TRIGGER consultation_ledger_prefix BEFORE INSERT ON consultation_migration_ledger BEGIN
 SELECT CASE WHEN NEW.ordinal<>(SELECT COALESCE(MAX(ordinal),0)+1 FROM consultation_migration_ledger)
 OR EXISTS(SELECT 1 FROM consultation_migration_ledger WHERE ordinal=NEW.ordinal OR path=NEW.path)
 THEN RAISE(ABORT,'Migration ledger conflict') END;
END;
CREATE TRIGGER consultation_ledger_update BEFORE UPDATE ON consultation_migration_ledger BEGIN SELECT RAISE(ABORT,'Immutable migration ledger'); END;
CREATE TRIGGER consultation_ledger_delete BEFORE DELETE ON consultation_migration_ledger BEGIN SELECT RAISE(ABORT,'Immutable migration ledger'); END;
CREATE TABLE consultation_preview_environment (
 id INTEGER NOT NULL PRIMARY KEY CHECK(id=1),
 database_id TEXT NOT NULL CHECK(length(database_id)=36),
 origin TEXT NOT NULL,
 manifest_sha256 TEXT NOT NULL CHECK(length(manifest_sha256)=64 AND manifest_sha256 NOT GLOB '*[^a-f0-9]*'),
 synthetic_only INTEGER NOT NULL CHECK(synthetic_only=1),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1))
);
CREATE TRIGGER consultation_environment_replace BEFORE INSERT ON consultation_preview_environment WHEN EXISTS(SELECT 1 FROM consultation_preview_environment) BEGIN SELECT RAISE(ABORT,'Environment already provisioned'); END;
CREATE TRIGGER consultation_environment_identity BEFORE UPDATE ON consultation_preview_environment WHEN NEW.id<>OLD.id OR NEW.database_id<>OLD.database_id OR NEW.origin<>OLD.origin OR NEW.manifest_sha256<>OLD.manifest_sha256 OR NEW.synthetic_only<>OLD.synthetic_only BEGIN SELECT RAISE(ABORT,'Environment identity immutable'); END;
