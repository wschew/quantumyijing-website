-- Quantum YiJing v3.9 - WhatsApp Marketing Campaign Manager
--
-- PREVIEW FIRST.
-- Do not run on Production until the v3.9 campaign system has been
-- fully tested and explicitly approved.
--
-- This migration creates an independent WhatsApp marketing campaign
-- subsystem.
--
-- It does NOT modify:
--   campaigns
--   enquiries
--   marketing_consents
--   marketing_consent_events
--   whatsapp_automations
--   whatsapp_automation_logs
--   whatsapp_messages
--   email marketing automation
--   commerce / orders / payments / accounting / affiliate tables


CREATE TABLE IF NOT EXISTS whatsapp_marketing_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  campaign_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'Draft'
    CHECK(status IN (
      'Draft',
      'Ready',
      'Sending',
      'Completed',
      'Paused',
      'Cancelled',
      'Failed'
    )),

  language TEXT NOT NULL DEFAULT 'en'
    CHECK(language IN ('en','zh-CN')),

  template_name TEXT NOT NULL DEFAULT '',
  template_language TEXT NOT NULL DEFAULT '',

  audience_filters TEXT NOT NULL DEFAULT '{}',

  scheduled_at TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL DEFAULT '',

  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_marketing_campaigns_status
  ON whatsapp_marketing_campaigns(status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_marketing_campaigns_schedule
  ON whatsapp_marketing_campaigns(status, scheduled_at);



CREATE TABLE IF NOT EXISTS whatsapp_marketing_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  campaign_id INTEGER NOT NULL,
  enquiry_id INTEGER NOT NULL,

  contact_value TEXT NOT NULL,
  recipient_name TEXT NOT NULL DEFAULT '',

  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK(status IN (
      'Pending',
      'Sent',
      'Skipped',
      'Failed'
    )),

  consent_status_at_selection TEXT NOT NULL DEFAULT '',
  consent_checked_at TEXT NOT NULL DEFAULT '',

  skip_reason TEXT NOT NULL DEFAULT '',
  error_message TEXT NOT NULL DEFAULT '',

  wa_message_id TEXT NOT NULL DEFAULT '',
  sent_at TEXT NOT NULL DEFAULT '',

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(campaign_id, enquiry_id),

  FOREIGN KEY(campaign_id)
    REFERENCES whatsapp_marketing_campaigns(id)
    ON DELETE CASCADE,

  FOREIGN KEY(enquiry_id)
    REFERENCES enquiries(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_marketing_recipients_campaign
  ON whatsapp_marketing_recipients(campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_whatsapp_marketing_recipients_enquiry
  ON whatsapp_marketing_recipients(enquiry_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_marketing_recipients_contact
  ON whatsapp_marketing_recipients(contact_value);