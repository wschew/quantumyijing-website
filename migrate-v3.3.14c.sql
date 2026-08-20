PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS generic_payment_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL UNIQUE,
  gateway_notice_status TEXT NOT NULL DEFAULT 'Pending' CHECK(gateway_notice_status IN ('Pending','Sent','Failed')),
  gateway_notice_sent_at TEXT NOT NULL DEFAULT '',
  gateway_notice_error TEXT NOT NULL DEFAULT '',
  admin_verification_status TEXT NOT NULL DEFAULT 'Pending' CHECK(admin_verification_status IN ('Pending','Verified','Rejected')),
  admin_verified_at TEXT NOT NULL DEFAULT '',
  admin_verified_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);
