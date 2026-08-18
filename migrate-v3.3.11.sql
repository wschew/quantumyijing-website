PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS affiliate_payout_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payout_id INTEGER NOT NULL,
  commission_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payout_id) REFERENCES affiliate_payouts(id) ON DELETE CASCADE,
  FOREIGN KEY (commission_id) REFERENCES affiliate_commissions(id) ON DELETE RESTRICT,
  UNIQUE (payout_id, commission_id),
  UNIQUE (commission_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_payout_items_payout
  ON affiliate_payout_items(payout_id);

CREATE INDEX IF NOT EXISTS idx_affiliate_payout_items_commission
  ON affiliate_payout_items(commission_id);
