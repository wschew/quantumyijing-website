-- Quantum YiJing® v3.5.0 — Marketing Automation Delivery Logs
--
-- Run on PREVIEW D1 before Production.
-- Safe to run more than once because the table and indexes use IF NOT EXISTS.
--
-- This migration reproduces the marketing_automation_logs structure tested
-- successfully with the YJ12-NURTURE sequence in Preview.
-- It does not modify enquiries, marketing_automations, CRM, commerce, orders,
-- payments, receipts, affiliate, coach payout or accounting tables.

CREATE TABLE IF NOT EXISTS marketing_automation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  automation_id INTEGER NOT NULL,
  enquiry_id INTEGER NOT NULL,
  sequence_code TEXT NOT NULL,
  step_no INTEGER NOT NULL,
  channel TEXT NOT NULL DEFAULT 'Email',
  template_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  sent_at TEXT NOT NULL DEFAULT '',
  provider_message_id TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_marketing_automation_logs_automation
  ON marketing_automation_logs (automation_id, step_no);

CREATE INDEX IF NOT EXISTS idx_marketing_automation_logs_status
  ON marketing_automation_logs (status);
