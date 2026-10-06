CREATE TABLE IF NOT EXISTS customer_profile_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  customer_id INTEGER NOT NULL,

  event_type TEXT NOT NULL DEFAULT 'profile_updated'
    CHECK (
      event_type IN (
        'profile_updated',
        'status_changed',
        'identity_changed'
      )
    ),

  field_name TEXT NOT NULL DEFAULT '',

  old_value TEXT NOT NULL DEFAULT '',
  new_value TEXT NOT NULL DEFAULT '',

  source TEXT NOT NULL DEFAULT 'Admin',
  source_reference TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',

  event_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_profile_events_customer
ON customer_profile_events (
  customer_id,
  id DESC
);

CREATE INDEX IF NOT EXISTS idx_customer_profile_events_event_type
ON customer_profile_events (
  event_type,
  id DESC
);