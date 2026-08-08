-- OPTIONAL v3.0 enhancement.
-- Only run if PRAGMA table_info(enquiry_attribution) confirms that
-- product_id and product_slug DO NOT already exist.
-- The v3.0 code works without these columns and falls back to v2.9 attribution fields.

ALTER TABLE enquiry_attribution ADD COLUMN product_id INTEGER;
ALTER TABLE enquiry_attribution ADD COLUMN product_slug TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_attribution_product_slug ON enquiry_attribution(product_slug);
