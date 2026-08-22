
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS affiliate_payout_email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payout_id INTEGER NOT NULL,
  recipient_type TEXT NOT NULL CHECK(recipient_type IN ('Affiliate','Accounting')),
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('Sent','Failed')),
  provider_message_id TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payout_id) REFERENCES affiliate_payouts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_affiliate_payout_email_log_payout
  ON affiliate_payout_email_log(payout_id);

CREATE INDEX IF NOT EXISTS idx_affiliate_payout_email_log_type
  ON affiliate_payout_email_log(recipient_type,status);
