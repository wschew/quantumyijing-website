-- v3.9 C5F
-- Add Processing state for exclusive WhatsApp marketing send claims.
-- Preview first. No Meta sending logic in this migration.

CREATE TABLE whatsapp_marketing_recipients_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  campaign_id INTEGER NOT NULL,
  enquiry_id INTEGER NOT NULL,

  contact_value TEXT NOT NULL,
  recipient_name TEXT NOT NULL DEFAULT '',

  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK(status IN (
      'Pending',
      'Processing',
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

INSERT INTO whatsapp_marketing_recipients_new (
  id,
  campaign_id,
  enquiry_id,
  contact_value,
  recipient_name,
  status,
  consent_status_at_selection,
  consent_checked_at,
  skip_reason,
  error_message,
  wa_message_id,
  sent_at,
  created_at,
  updated_at
)
SELECT
  id,
  campaign_id,
  enquiry_id,
  contact_value,
  recipient_name,
  status,
  consent_status_at_selection,
  consent_checked_at,
  skip_reason,
  error_message,
  wa_message_id,
  sent_at,
  created_at,
  updated_at
FROM whatsapp_marketing_recipients;

DROP TABLE whatsapp_marketing_recipients;

ALTER TABLE whatsapp_marketing_recipients_new
RENAME TO whatsapp_marketing_recipients;

CREATE INDEX idx_whatsapp_marketing_recipients_campaign
ON whatsapp_marketing_recipients(campaign_id, status);

CREATE INDEX idx_whatsapp_marketing_recipients_enquiry
ON whatsapp_marketing_recipients(enquiry_id);

CREATE INDEX idx_whatsapp_marketing_recipients_contact
ON whatsapp_marketing_recipients(contact_value);

CREATE UNIQUE INDEX idx_whatsapp_marketing_recipients_campaign_contact
ON whatsapp_marketing_recipients(campaign_id, contact_value);
