-- Quantum YiJing v2.8 — Marketing CRM
-- Run ONCE after migrate-v2.7.sql.
-- Adds UTM term support used by paid-search campaigns.

ALTER TABLE enquiry_attribution ADD COLUMN utm_term TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_attribution_utm_source ON enquiry_attribution(utm_source);
CREATE INDEX IF NOT EXISTS idx_attribution_utm_campaign ON enquiry_attribution(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_attribution_landing ON enquiry_attribution(landing_page);
