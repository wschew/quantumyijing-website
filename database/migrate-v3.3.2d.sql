-- Quantum YiJing® v3.3.2d
-- Affiliate Analytics Foundation
-- Run ONCE after v3.3.2b/c database state.
-- Apply to PREVIEW D1 first.

CREATE TABLE IF NOT EXISTS affiliate_page_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL,
  visited_at TEXT NOT NULL,
  visited_date TEXT NOT NULL,
  visited_month TEXT NOT NULL,
  landing_page TEXT NOT NULL DEFAULT '/affiliate',
  referrer TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_affiliate_visits_month
  ON affiliate_page_visits(visited_month);

CREATE INDEX IF NOT EXISTS idx_affiliate_visits_visitor_month
  ON affiliate_page_visits(visitor_id, visited_month);

CREATE INDEX IF NOT EXISTS idx_affiliate_visits_source
  ON affiliate_page_visits(utm_source, visited_month);

SELECT name
FROM sqlite_master
WHERE type='table' AND name='affiliate_page_visits';
