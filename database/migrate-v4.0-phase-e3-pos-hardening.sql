-- Quantum YiJing v4.0 Phase E3
-- POS execution/idempotency hardening.
-- Additive only.

CREATE TABLE IF NOT EXISTS pos_sale_executions (
    request_key TEXT PRIMARY KEY,

    request_fingerprint TEXT NOT NULL,

    execution_status TEXT NOT NULL DEFAULT 'Processing'
        CHECK(execution_status IN (
            'Processing',
            'Completed',
            'Failed'
        )),

    order_id INTEGER,
    payment_id INTEGER,
    invoice_id INTEGER,
    receipt_id INTEGER,
    fulfilment_id INTEGER,

    error_message TEXT NOT NULL DEFAULT '',

    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(order_id)
        REFERENCES orders(id)
        ON DELETE SET NULL,

    FOREIGN KEY(payment_id)
        REFERENCES payments(id)
        ON DELETE SET NULL,

    FOREIGN KEY(invoice_id)
        REFERENCES invoices(id)
        ON DELETE SET NULL,

    FOREIGN KEY(receipt_id)
        REFERENCES receipts(id)
        ON DELETE SET NULL,

    FOREIGN KEY(fulfilment_id)
        REFERENCES order_fulfilments(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pos_sale_executions_status
    ON pos_sale_executions(execution_status);

CREATE INDEX IF NOT EXISTS idx_pos_sale_executions_order
    ON pos_sale_executions(order_id);