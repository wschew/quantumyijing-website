-- Quantum YiJing v3.6.0 - Resend email engagement events
--
-- Run on PREVIEW D1 before Production.
-- Safe to run more than once.
-- This adds a separate event table and does not modify the stable
-- marketing automation, payment, affiliate, coach payout, or accounting tables.

CREATE TABLE IF NOT EXISTS marketing_email_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_event_id TEXT NOT NULL UNIQUE,
  provider_message_id TEXT NOT NULL,
  automation_log_id INTEGER,
  enquiry_id INTEGER,
  automation_id INTEGER,
  sequence_code TEXT NOT NULL DEFAULT '',
  step_no INTEGER,
  template_code TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL,
  event_at TEXT NOT NULL,
  recipient_email TEXT NOT NULL DEFAULT '',
  clicked_url TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_marketing_email_events_message
  ON marketing_email_events (provider_message_id);

CREATE INDEX IF NOT EXISTS idx_marketing_email_events_log
  ON marketing_email_events (automation_log_id, event_type);

CREATE INDEX IF NOT EXISTS idx_marketing_email_events_enquiry
  ON marketing_email_events (enquiry_id, event_at);

CREATE INDEX IF NOT EXISTS idx_marketing_email_events_type
  ON marketing_email_events (event_type, event_at);
