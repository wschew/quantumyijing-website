PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS course_whatsapp_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_email TEXT NOT NULL DEFAULT '',
  whatsapp_group_url TEXT NOT NULL DEFAULT '',
  email_status TEXT NOT NULL DEFAULT 'Pending'
    CHECK(email_status IN ('Pending','Sent','Failed')),
  sent_at TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE RESTRICT,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
  UNIQUE(product_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_course_whatsapp_inv_product
  ON course_whatsapp_invitations(product_id);

CREATE INDEX IF NOT EXISTS idx_course_whatsapp_inv_status
  ON course_whatsapp_invitations(email_status);
