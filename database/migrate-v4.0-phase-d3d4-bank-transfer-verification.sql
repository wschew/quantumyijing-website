-- Quantum YiJing v4.0 Phase D3+D4
-- Bank-transfer verification execution guard.
-- Additive only.

CREATE TABLE IF NOT EXISTS bank_transfer_verification_executions (
    bank_transfer_submission_id INTEGER PRIMARY KEY,

    payment_id INTEGER UNIQUE,

    execution_status TEXT NOT NULL DEFAULT 'Processing'
        CHECK(execution_status IN (
            'Processing',
            'Completed'
        )),

    verified_by TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT NOT NULL DEFAULT '',

    FOREIGN KEY(bank_transfer_submission_id)
        REFERENCES bank_transfer_submissions(id)
        ON DELETE CASCADE,

    FOREIGN KEY(payment_id)
        REFERENCES payments(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bank_transfer_verification_payment
    ON bank_transfer_verification_executions(payment_id);