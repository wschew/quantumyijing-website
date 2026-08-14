-- Quantum YiJing® v3.3.3
-- Affiliate Portal Authentication Foundation
-- Run ONCE on PREVIEW D1 first.

ALTER TABLE affiliates ADD COLUMN portal_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE affiliates ADD COLUMN portal_activated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliates ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliates ADD COLUMN password_salt TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliates ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 210000;
ALTER TABLE affiliates ADD COLUMN last_login_at TEXT NOT NULL DEFAULT '';
ALTER TABLE affiliates ADD COLUMN last_password_changed_at TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS affiliate_activation_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (affiliate_id) REFERENCES affiliates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_affiliate_activation_affiliate
  ON affiliate_activation_tokens(affiliate_id);

CREATE INDEX IF NOT EXISTS idx_affiliate_activation_expiry
  ON affiliate_activation_tokens(expires_at);

CREATE TABLE IF NOT EXISTS affiliate_password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (affiliate_id) REFERENCES affiliates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_affiliate_reset_affiliate
  ON affiliate_password_reset_tokens(affiliate_id);

CREATE INDEX IF NOT EXISTS idx_affiliate_reset_expiry
  ON affiliate_password_reset_tokens(expires_at);

CREATE TABLE IF NOT EXISTS affiliate_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (affiliate_id) REFERENCES affiliates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_affiliate_sessions_affiliate
  ON affiliate_sessions(affiliate_id);

CREATE INDEX IF NOT EXISTS idx_affiliate_sessions_expiry
  ON affiliate_sessions(expires_at);

SELECT name FROM sqlite_master
WHERE type='table'
AND name IN (
  'affiliate_activation_tokens',
  'affiliate_password_reset_tokens',
  'affiliate_sessions'
)
ORDER BY name;
