-- Quantum YiJing Website
-- v3.9 Phase F2
-- Content Studio structured marketing metadata
--
-- PREVIEW FIRST.
-- Adds metadata only to the Phase-F ai_content_drafts table.
-- Does not modify enquiries, payments, affiliates, WhatsApp,
-- email automation, orders, accounting or lead-magnet tables.

ALTER TABLE ai_content_drafts
ADD COLUMN audience TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_content_drafts
ADD COLUMN objective TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_content_drafts
ADD COLUMN tone TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_content_drafts
ADD COLUMN platform TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_content_drafts
ADD COLUMN output_length TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_content_drafts
ADD COLUMN cta TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS
idx_ai_content_drafts_platform
ON ai_content_drafts(platform);

CREATE INDEX IF NOT EXISTS
idx_ai_content_drafts_objective
ON ai_content_drafts(objective);

CREATE INDEX IF NOT EXISTS
idx_ai_content_drafts_tone
ON ai_content_drafts(tone);