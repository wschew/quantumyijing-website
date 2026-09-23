-- Quantum YiJing v3.9
-- Phase A - Marketing Consent & Opt-Out Foundation
--
-- PREVIEW FIRST.
--
-- This migration creates an independent marketing-consent subsystem.
-- It does NOT modify existing enquiries, CRM, campaigns, email automation,
-- WhatsApp automation/inbox, commerce, orders, payments, receipts,
-- affiliate, coach payout, or accounting tables.
--
-- Consent is channel-specific.
-- Absence of a consent record means marketing permission has NOT been proven
-- and the contact must not be treated as marketing-eligible.


CREATE TABLE IF NOT EXISTS marketing_consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  channel TEXT NOT NULL
    CHECK(channel IN ('whatsapp', 'email')),

  contact_value TEXT NOT NULL,

  status TEXT NOT NULL
    CHECK(status IN ('opted_in', 'opted_out')),

  enquiry_id INTEGER,

  consent_source TEXT NOT NULL DEFAULT '',
  consent_text_version TEXT NOT NULL DEFAULT '',

  consented_at TEXT NOT NULL DEFAULT '',
  opted_out_at TEXT NOT NULL DEFAULT '',

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(channel, contact_value),

  FOREIGN KEY(enquiry_id)
    REFERENCES enquiries(id)
    ON DELETE SET NULL
);


CREATE INDEX IF NOT EXISTS idx_marketing_consents_status
  ON marketing_consents (channel, status);

CREATE INDEX IF NOT EXISTS idx_marketing_consents_enquiry
  ON marketing_consents (enquiry_id);


CREATE TABLE IF NOT EXISTS marketing_consent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  marketing_consent_id INTEGER NOT NULL,

  enquiry_id INTEGER,

  channel TEXT NOT NULL
    CHECK(channel IN ('whatsapp', 'email')),

  contact_value TEXT NOT NULL,

  event_type TEXT NOT NULL
    CHECK(event_type IN (
      'opt_in',
      'opt_out',
      'admin_update',
      'import'
    )),

  source TEXT NOT NULL DEFAULT '',

  consent_text_version TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(marketing_consent_id)
    REFERENCES marketing_consents(id)
    ON DELETE CASCADE,

  FOREIGN KEY(enquiry_id)
    REFERENCES enquiries(id)
    ON DELETE SET NULL
);


CREATE INDEX IF NOT EXISTS idx_marketing_consent_events_consent
  ON marketing_consent_events (marketing_consent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_marketing_consent_events_contact
  ON marketing_consent_events (channel, contact_value, created_at);

CREATE INDEX IF NOT EXISTS idx_marketing_consent_events_enquiry
  ON marketing_consent_events (enquiry_id);