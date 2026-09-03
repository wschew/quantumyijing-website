PRAGMA foreign_keys=ON;

-- v3.3.16r — Affiliate refund / commission reversal framework
-- Run ONCE in Preview D1 before testing.

CREATE TABLE IF NOT EXISTS affiliate_commission_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id INTEGER NOT NULL,
  commission_id INTEGER NOT NULL,
  order_id INTEGER,
  adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('Refund','Reversal','Chargeback','Manual')),
  recovery_mode TEXT NOT NULL CHECK(recovery_mode IN ('PrePayout','CarryForward')),
  original_sale_amount REAL NOT NULL DEFAULT 0,
  refund_amount REAL NOT NULL DEFAULT 0,
  original_commission_amount REAL NOT NULL DEFAULT 0,
  adjustment_amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MYR',
  effective_date TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','Applied','Cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (affiliate_id) REFERENCES affiliates(id),
  FOREIGN KEY (commission_id) REFERENCES affiliate_commissions(id)
);

CREATE INDEX IF NOT EXISTS idx_aff_adj_affiliate_status
  ON affiliate_commission_adjustments(affiliate_id,recovery_mode,status);
CREATE INDEX IF NOT EXISTS idx_aff_adj_commission
  ON affiliate_commission_adjustments(commission_id,status);

CREATE TABLE IF NOT EXISTS affiliate_payout_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payout_id INTEGER NOT NULL,
  adjustment_id INTEGER NOT NULL,
  applied_amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(payout_id,adjustment_id),
  FOREIGN KEY (payout_id) REFERENCES affiliate_payouts(id) ON DELETE CASCADE,
  FOREIGN KEY (adjustment_id) REFERENCES affiliate_commission_adjustments(id)
);

CREATE INDEX IF NOT EXISTS idx_aff_payout_adj_payout
  ON affiliate_payout_adjustments(payout_id);
CREATE INDEX IF NOT EXISTS idx_aff_payout_adj_adjustment
  ON affiliate_payout_adjustments(adjustment_id);

CREATE TABLE IF NOT EXISTS affiliate_payout_cancellations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payout_id INTEGER NOT NULL,
  payout_reference TEXT NOT NULL DEFAULT '',
  affiliate_id INTEGER NOT NULL,
  payout_period TEXT NOT NULL DEFAULT '',
  previous_status TEXT NOT NULL DEFAULT '',
  gross_commission REAL NOT NULL DEFAULT 0,
  adjustment_total REAL NOT NULL DEFAULT 0,
  net_commission REAL NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  cancelled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Snapshot fields used by v3.3.16r. These ALTER statements are intentionally one-time.
ALTER TABLE affiliate_payouts ADD COLUMN gross_commission REAL NOT NULL DEFAULT 0;
ALTER TABLE affiliate_payouts ADD COLUMN adjustment_total REAL NOT NULL DEFAULT 0;

ALTER TABLE affiliate_payout_items ADD COLUMN original_commission_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE affiliate_payout_items ADD COLUMN pre_payout_adjustment REAL NOT NULL DEFAULT 0;
ALTER TABLE affiliate_payout_items ADD COLUMN net_commission_amount REAL NOT NULL DEFAULT 0;

-- Backfill old payout records so historical reporting remains correct.
UPDATE affiliate_payouts
SET gross_commission = total_commission
WHERE COALESCE(gross_commission,0)=0;

UPDATE affiliate_payout_items
SET original_commission_amount = COALESCE((SELECT commission_amount FROM affiliate_commissions ac WHERE ac.id=affiliate_payout_items.commission_id),0),
    net_commission_amount = COALESCE((SELECT commission_amount FROM affiliate_commissions ac WHERE ac.id=affiliate_payout_items.commission_id),0)
WHERE COALESCE(original_commission_amount,0)=0
  AND COALESCE(net_commission_amount,0)=0;
