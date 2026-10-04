-- ============================================================
-- Quantum YiJing v4.0
-- Phase B2 — Subscription Foundation
--
-- ADDITIVE MIGRATION ONLY.
--
-- Does NOT alter:
--   customers
--   memberships
--   membership_events
--   products
--   orders
--   order_items
--   payments
--   affiliate/accounting tables
--
-- Financial truth remains:
--   products -> orders -> order_items -> payments
--
-- Membership remains the access entitlement.
-- Subscription represents renewal/billing lifecycle only.
-- ============================================================


-- ------------------------------------------------------------
-- 1. SUBSCRIPTION PLANS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS subscription_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    plan_reference TEXT NOT NULL UNIQUE,
    product_id INTEGER NOT NULL,

    plan_code TEXT NOT NULL UNIQUE,

    status TEXT NOT NULL DEFAULT 'Draft'
        CHECK(status IN (
            'Draft',
            'Active',
            'Inactive',
            'Archived'
        )),

    billing_interval_unit TEXT NOT NULL DEFAULT 'Year'
        CHECK(billing_interval_unit IN (
            'Day',
            'Month',
            'Year'
        )),

    billing_interval_count INTEGER NOT NULL DEFAULT 1
        CHECK(billing_interval_count > 0),

    membership_duration_unit TEXT NOT NULL DEFAULT 'Year'
        CHECK(membership_duration_unit IN (
            'Day',
            'Month',
            'Year'
        )),

    membership_duration_count INTEGER NOT NULL DEFAULT 1
        CHECK(membership_duration_count > 0),

    grace_period_days INTEGER NOT NULL DEFAULT 0
        CHECK(grace_period_days >= 0),

    renewal_mode TEXT NOT NULL DEFAULT 'Manual'
        CHECK(renewal_mode IN (
            'Manual',
            'Automatic'
        )),

    notes TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(product_id)
        REFERENCES products(id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_product
    ON subscription_plans(product_id);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_status
    ON subscription_plans(status);


-- ------------------------------------------------------------
-- 2. CUSTOMER SUBSCRIPTIONS
--
-- A subscription is NOT the membership itself.
--
-- Membership = access entitlement.
-- Subscription = recurring/renewal lifecycle.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    subscription_reference TEXT NOT NULL UNIQUE,

    customer_id INTEGER NOT NULL,
    plan_id INTEGER NOT NULL,
    membership_id INTEGER NOT NULL,

    status TEXT NOT NULL DEFAULT 'Pending'
        CHECK(status IN (
            'Pending',
            'Active',
            'PastDue',
            'Paused',
            'Cancelled',
            'Expired'
        )),

    current_period_start TEXT NOT NULL DEFAULT '',
    current_period_end TEXT NOT NULL DEFAULT '',

    next_renewal_at TEXT NOT NULL DEFAULT '',
    grace_ends_at TEXT NOT NULL DEFAULT '',

    auto_renew INTEGER NOT NULL DEFAULT 0
        CHECK(auto_renew IN (0,1)),

    cancel_at_period_end INTEGER NOT NULL DEFAULT 0
        CHECK(cancel_at_period_end IN (0,1)),

    cancelled_at TEXT NOT NULL DEFAULT '',
    paused_at TEXT NOT NULL DEFAULT '',
    expired_at TEXT NOT NULL DEFAULT '',

    source TEXT NOT NULL DEFAULT 'Admin',
    notes TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(customer_id)
        REFERENCES customers(id)
        ON DELETE RESTRICT,

    FOREIGN KEY(plan_id)
        REFERENCES subscription_plans(id)
        ON DELETE RESTRICT,

    FOREIGN KEY(membership_id)
        REFERENCES memberships(id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_customer
    ON subscriptions(customer_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_plan
    ON subscriptions(plan_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_membership
    ON subscriptions(membership_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status
    ON subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_next_renewal
    ON subscriptions(next_renewal_at);

CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_status
    ON subscriptions(customer_id, status);


-- ------------------------------------------------------------
-- 3. SUBSCRIPTION <-> ORDER LINK
--
-- orders/payments remain the financial source of truth.
--
-- This table only records which commercial order corresponds
-- to which subscription period.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS subscription_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    subscription_id INTEGER NOT NULL,
    order_id INTEGER NOT NULL UNIQUE,

    order_type TEXT NOT NULL
        CHECK(order_type IN (
            'Initial',
            'Renewal',
            'Adjustment'
        )),

    period_start TEXT NOT NULL DEFAULT '',
    period_end TEXT NOT NULL DEFAULT '',

    linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    notes TEXT NOT NULL DEFAULT '',

    UNIQUE(subscription_id, order_id),

    FOREIGN KEY(subscription_id)
        REFERENCES subscriptions(id)
        ON DELETE CASCADE,

    FOREIGN KEY(order_id)
        REFERENCES orders(id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_subscription_orders_subscription
    ON subscription_orders(subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscription_orders_type
    ON subscription_orders(order_type);


-- ------------------------------------------------------------
-- 4. SUBSCRIPTION EVENT AUDIT
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS subscription_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    subscription_id INTEGER NOT NULL,

    event_type TEXT NOT NULL
        CHECK(event_type IN (
            'created',
            'activated',
            'renewal_due',
            'renewal_order_created',
            'renewed',
            'payment_failed',
            'past_due',
            'grace_started',
            'grace_ended',
            'paused',
            'resumed',
            'cancel_scheduled',
            'cancelled',
            'expired',
            'updated'
        )),

    from_status TEXT NOT NULL DEFAULT '',
    to_status TEXT NOT NULL DEFAULT '',

    source TEXT NOT NULL DEFAULT 'Admin',
    source_reference TEXT NOT NULL DEFAULT '',

    notes TEXT NOT NULL DEFAULT '',

    event_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(subscription_id)
        REFERENCES subscriptions(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_subscription
    ON subscription_events(subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscription_events_type
    ON subscription_events(event_type);

CREATE INDEX IF NOT EXISTS idx_subscription_events_date
    ON subscription_events(event_at);