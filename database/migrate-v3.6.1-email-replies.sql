-- Quantum YiJing v3.6.1 - Resend inbound email replies
--
-- Run on PREVIEW D1 before deploying the v3.6.1 code.
-- Safe to run more than once.
-- This adds a separate reply table and does not modify payment, affiliate,
-- coach payout, receipt, order, or accounting tables.

CREATE TABLE IF NOT EXISTS marketing_email_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  webhook_event_id TEXT NOT NULL UNIQUE,
  resend_email_id TEXT NOT NULL UNIQUE,
  message_id TEXT NOT NULL DEFAULT '',
  automation_id INTEGER,
  automation_log_id INTEGER,
  enquiry_id INTEGER,
  from_email TEXT NOT NULL DEFAULT '',
  to_email TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  text_body TEXT NOT NULL DEFAULT '',
  html_body TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Unread',
  payload_json TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_marketing_email_replies_enquiry
  ON marketing_email_replies (enquiry_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_email_replies_automation
  ON marketing_email_replies (automation_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_email_replies_status
  ON marketing_email_replies (status, received_at DESC);
