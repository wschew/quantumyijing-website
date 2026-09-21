-- Quantum YiJing v3.8 - WhatsApp Automation
--
-- Run on PREVIEW D1 before Production.
-- Safe to run more than once because tables and indexes use IF NOT EXISTS.
--
-- This migration creates an independent WhatsApp automation state and
-- delivery log. It does not modify the existing email marketing automation,
-- enquiries, CRM, commerce, orders, payments, receipts, affiliate,
-- coach payout, or accounting tables.

CREATE TABLE IF NOT EXISTS whatsapp_automations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enquiry_id INTEGER NOT NULL,
  sequence_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active'
    CHECK(status IN ('Active','Completed','Stopped','Failed')),
  current_step INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  next_send_at TEXT NOT NULL DEFAULT '',
  last_send_at TEXT NOT NULL DEFAULT '',
  stop_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(enquiry_id, sequence_code),

  FOREIGN KEY(enquiry_id)
    REFERENCES enquiries(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_automations_due
  ON whatsapp_automations (status, next_send_at);

CREATE INDEX IF NOT EXISTS idx_whatsapp_automations_enquiry
  ON whatsapp_automations (enquiry_id);


CREATE TABLE IF NOT EXISTS whatsapp_automation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  automation_id INTEGER NOT NULL,
  enquiry_id INTEGER NOT NULL,
  sequence_code TEXT NOT NULL,
  step_no INTEGER NOT NULL,
  template_code TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK(status IN ('Pending','Sent','Failed')),
  sent_at TEXT NOT NULL DEFAULT '',
  wa_message_id TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(automation_id, step_no),

  FOREIGN KEY(automation_id)
    REFERENCES whatsapp_automations(id)
    ON DELETE CASCADE,

  FOREIGN KEY(enquiry_id)
    REFERENCES enquiries(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_automation_logs_automation
  ON whatsapp_automation_logs (automation_id, step_no);

CREATE INDEX IF NOT EXISTS idx_whatsapp_automation_logs_status
  ON whatsapp_automation_logs (status);