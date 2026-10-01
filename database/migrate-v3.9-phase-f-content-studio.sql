-- Quantum YiJing v3.9 Phase F
-- AI Content Studio Foundation
-- Preview first
--
-- IMPORTANT:
-- This migration creates isolated Phase F tables only.
-- It does not modify existing payment, accounting, affiliate,
-- email automation, WhatsApp, CRM, campaign, or lead-magnet tables.

CREATE TABLE IF NOT EXISTS ai_content_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    content_type TEXT NOT NULL,
    language TEXT NOT NULL,

    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',

    source_type TEXT NOT NULL DEFAULT 'manual',
    source_reference TEXT NOT NULL DEFAULT '',

    prompt TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'approved', 'archived')),

    created_by TEXT NOT NULL DEFAULT 'admin',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_ai_content_drafts_status
ON ai_content_drafts(status);

CREATE INDEX IF NOT EXISTS idx_ai_content_drafts_type
ON ai_content_drafts(content_type);

CREATE INDEX IF NOT EXISTS idx_ai_content_drafts_language
ON ai_content_drafts(language);


CREATE TABLE IF NOT EXISTS ai_content_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    content_draft_id INTEGER NOT NULL,

    event_type TEXT NOT NULL
        CHECK (
            event_type IN (
                'created',
                'generated',
                'regenerated',
                'edited',
                'approved',
                'archived'
            )
        ),

    notes TEXT NOT NULL DEFAULT '',

    event_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (content_draft_id)
        REFERENCES ai_content_drafts(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_content_events_draft
ON ai_content_events(content_draft_id);

CREATE INDEX IF NOT EXISTS idx_ai_content_events_type
ON ai_content_events(event_type);
