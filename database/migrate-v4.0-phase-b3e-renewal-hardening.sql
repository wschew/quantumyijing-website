-- ============================================================
-- Quantum YiJing v4.0
-- Phase B3E — Subscription Renewal Hardening
--
-- Additive only.
-- Preview first.
--
-- Financial truth remains in orders/payments.
--
-- One verified renewal order may extend membership exactly once.
-- ============================================================

CREATE TABLE IF NOT EXISTS subscription_renewal_executions (
    order_id INTEGER PRIMARY KEY,

    subscription_id INTEGER NOT NULL,
    membership_id INTEGER NOT NULL,

    order_reference TEXT NOT NULL DEFAULT '',

    previous_membership_end TEXT NOT NULL DEFAULT '',
    period_start TEXT NOT NULL DEFAULT '',
    new_membership_end TEXT NOT NULL DEFAULT '',

    completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(order_id)
        REFERENCES orders(id)
        ON DELETE RESTRICT,

    FOREIGN KEY(subscription_id)
        REFERENCES subscriptions(id)
        ON DELETE RESTRICT,

    FOREIGN KEY(membership_id)
        REFERENCES memberships(id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_subscription_renewal_execution_subscription
    ON subscription_renewal_executions(subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscription_renewal_execution_membership
    ON subscription_renewal_executions(membership_id);