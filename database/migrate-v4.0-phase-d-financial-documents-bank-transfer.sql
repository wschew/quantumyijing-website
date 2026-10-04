-- ============================================================
-- Quantum YiJing v4.0 Phase D1+D2
-- Financial document + bank-transfer foundation
--
-- ADDITIVE ONLY.
--
-- Existing tables intentionally NOT modified:
--   orders
--   order_items
--   payments
--   receipts
--   payment_verification_events
--
-- Existing receipts remains the canonical receipt header table.
-- ============================================================


CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    invoice_number TEXT NOT NULL UNIQUE,

    order_id INTEGER NOT NULL,

    version_no INTEGER NOT NULL DEFAULT 1,

    customer_name TEXT NOT NULL DEFAULT '',
    customer_email TEXT NOT NULL DEFAULT '',
    customer_phone TEXT NOT NULL DEFAULT '',

    currency TEXT NOT NULL DEFAULT 'MYR',

    subtotal REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,

    verified_paid_at_issue REAL NOT NULL DEFAULT 0,
    balance_due_at_issue REAL NOT NULL DEFAULT 0,

    invoice_status TEXT NOT NULL DEFAULT 'Issued'
        CHECK(invoice_status IN (
            'Draft',
            'Issued',
            'Partially Paid',
            'Paid',
            'Void'
        )),

    issue_date TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL DEFAULT '',

    sales_channel TEXT NOT NULL DEFAULT '',
    payment_provider TEXT NOT NULL DEFAULT '',

    notes TEXT NOT NULL DEFAULT '',

    created_source TEXT NOT NULL DEFAULT 'Admin',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(order_id, version_no),

    FOREIGN KEY(order_id)
        REFERENCES orders(id)
        ON DELETE RESTRICT
);


CREATE INDEX IF NOT EXISTS idx_invoices_order
    ON invoices(order_id);

CREATE INDEX IF NOT EXISTS idx_invoices_status
    ON invoices(invoice_status);

CREATE INDEX IF NOT EXISTS idx_invoices_customer_email
    ON invoices(customer_email);


CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    invoice_id INTEGER NOT NULL,

    order_item_id INTEGER,
    product_id INTEGER,

    description TEXT NOT NULL DEFAULT '',

    quantity INTEGER NOT NULL DEFAULT 1,

    list_unit_price REAL NOT NULL DEFAULT 0,
    discount_amount REAL NOT NULL DEFAULT 0,
    final_unit_price REAL NOT NULL DEFAULT 0,
    line_total REAL NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(invoice_id)
        REFERENCES invoices(id)
        ON DELETE CASCADE,

    FOREIGN KEY(order_item_id)
        REFERENCES order_items(id)
        ON DELETE SET NULL,

    FOREIGN KEY(product_id)
        REFERENCES products(id)
        ON DELETE SET NULL
);


CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice
    ON invoice_items(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_items_product
    ON invoice_items(product_id);


-- Existing receipts table is intentionally reused.
-- This child table preserves the commercial item snapshot
-- associated with a receipt without changing receipts itself.
CREATE TABLE IF NOT EXISTS receipt_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    receipt_id INTEGER NOT NULL,

    order_item_id INTEGER,
    product_id INTEGER,

    description TEXT NOT NULL DEFAULT '',

    quantity INTEGER NOT NULL DEFAULT 1,

    unit_price REAL NOT NULL DEFAULT 0,
    line_total REAL NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(receipt_id)
        REFERENCES receipts(id)
        ON DELETE CASCADE,

    FOREIGN KEY(order_item_id)
        REFERENCES order_items(id)
        ON DELETE SET NULL,

    FOREIGN KEY(product_id)
        REFERENCES products(id)
        ON DELETE SET NULL
);


CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt
    ON receipt_items(receipt_id);


CREATE TABLE IF NOT EXISTS bank_transfer_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    submission_reference TEXT NOT NULL UNIQUE,

    order_id INTEGER NOT NULL,
    invoice_id INTEGER,

    payment_id INTEGER,

    amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'MYR',

    transfer_date TEXT NOT NULL DEFAULT '',

    sender_name TEXT NOT NULL DEFAULT '',
    sender_bank TEXT NOT NULL DEFAULT '',
    sender_account_last4 TEXT NOT NULL DEFAULT '',

    transfer_reference TEXT NOT NULL DEFAULT '',

    evidence_file_name TEXT NOT NULL DEFAULT '',
    evidence_content_type TEXT NOT NULL DEFAULT '',
    evidence_location TEXT NOT NULL DEFAULT '',

    status TEXT NOT NULL DEFAULT 'Submitted'
        CHECK(status IN (
            'Submitted',
            'Under Review',
            'Verified',
            'Rejected',
            'Cancelled'
        )),

    submitted_by TEXT NOT NULL DEFAULT 'Admin',
    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    reviewed_by TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT NOT NULL DEFAULT '',

    rejection_reason TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(order_id)
        REFERENCES orders(id)
        ON DELETE RESTRICT,

    FOREIGN KEY(invoice_id)
        REFERENCES invoices(id)
        ON DELETE SET NULL,

    FOREIGN KEY(payment_id)
        REFERENCES payments(id)
        ON DELETE SET NULL
);


CREATE INDEX IF NOT EXISTS idx_bank_transfer_order
    ON bank_transfer_submissions(order_id);

CREATE INDEX IF NOT EXISTS idx_bank_transfer_invoice
    ON bank_transfer_submissions(invoice_id);

CREATE INDEX IF NOT EXISTS idx_bank_transfer_status
    ON bank_transfer_submissions(status);

CREATE INDEX IF NOT EXISTS idx_bank_transfer_reference
    ON bank_transfer_submissions(transfer_reference);


CREATE TABLE IF NOT EXISTS bank_transfer_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    bank_transfer_submission_id INTEGER NOT NULL,

    event_type TEXT NOT NULL
        CHECK(event_type IN (
            'created',
            'submitted',
            'review_started',
            'verified',
            'rejected',
            'cancelled',
            'updated'
        )),

    from_status TEXT NOT NULL DEFAULT '',
    to_status TEXT NOT NULL DEFAULT '',

    source TEXT NOT NULL DEFAULT 'Admin',
    source_reference TEXT NOT NULL DEFAULT '',

    notes TEXT NOT NULL DEFAULT '',

    event_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(bank_transfer_submission_id)
        REFERENCES bank_transfer_submissions(id)
        ON DELETE CASCADE
);


CREATE INDEX IF NOT EXISTS idx_bank_transfer_events_submission
    ON bank_transfer_events(bank_transfer_submission_id);

CREATE INDEX IF NOT EXISTS idx_bank_transfer_events_type
    ON bank_transfer_events(event_type);