-- ============================================================
-- Quantum YiJing v4.0
-- Phase A1 — Customer + Membership Foundation
--
-- Additive migration only.
-- Does NOT alter:
--   enquiries
--   students
--   products
--   orders
--   payments
--   affiliate/accounting tables
--
-- Financial truth remains in orders/payments.
-- ============================================================


-- ------------------------------------------------------------
-- 1. CANONICAL CUSTOMER
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    customer_reference TEXT NOT NULL UNIQUE,

    display_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'en',

    status TEXT NOT NULL DEFAULT 'Active'
        CHECK(status IN (
            'Active',
            'Inactive',
            'Archived'
        )),

    created_source TEXT NOT NULL DEFAULT 'Admin',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_email
    ON customers(email);

CREATE INDEX IF NOT EXISTS idx_customers_phone
    ON customers(phone);

CREATE INDEX IF NOT EXISTS idx_customers_status
    ON customers(status);



-- ------------------------------------------------------------
-- 2. CUSTOMER IDENTIFIERS
--
-- Canonical normalized identifiers used for identity matching.
--
-- Examples:
-- email : john@example.com
-- phone : 60123456789
--
-- One normalized identity can belong to only one customer.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customer_identifiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    customer_id INTEGER NOT NULL,

    identifier_type TEXT NOT NULL
        CHECK(identifier_type IN (
            'email',
            'phone',
            'external'
        )),

    normalized_value TEXT NOT NULL,

    display_value TEXT NOT NULL DEFAULT '',

    is_primary INTEGER NOT NULL DEFAULT 0
        CHECK(is_primary IN (0,1)),

    verified_at TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(identifier_type, normalized_value),

    FOREIGN KEY(customer_id)
        REFERENCES customers(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_identifiers_customer
    ON customer_identifiers(customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_identifiers_lookup
    ON customer_identifiers(identifier_type, normalized_value);



-- ------------------------------------------------------------
-- 3. CRM / ENQUIRY LINK
--
-- One customer may have many enquiries over time.
-- Each enquiry may belong to at most one canonical customer.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customer_enquiry_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    customer_id INTEGER NOT NULL,
    enquiry_id INTEGER NOT NULL UNIQUE,

    link_type TEXT NOT NULL DEFAULT 'related'
        CHECK(link_type IN (
            'primary',
            'related',
            'historical'
        )),

    link_source TEXT NOT NULL DEFAULT 'Admin',

    linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    notes TEXT NOT NULL DEFAULT '',

    UNIQUE(customer_id, enquiry_id),

    FOREIGN KEY(customer_id)
        REFERENCES customers(id)
        ON DELETE CASCADE,

    FOREIGN KEY(enquiry_id)
        REFERENCES enquiries(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_enquiry_customer
    ON customer_enquiry_links(customer_id);



-- ------------------------------------------------------------
-- 4. MEMBERSHIP
--
-- Membership lifecycle only.
--
-- Payment/accounting truth remains in:
-- products -> orders -> payments
--
-- source_order_id identifies the originating commercial order
-- where one exists.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    membership_reference TEXT NOT NULL UNIQUE,

    customer_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,

    source_order_id INTEGER,

    status TEXT NOT NULL DEFAULT 'Pending'
        CHECK(status IN (
            'Pending',
            'Active',
            'Paused',
            'Expired',
            'Cancelled',
            'Refunded'
        )),

    starts_at TEXT NOT NULL DEFAULT '',
    ends_at TEXT NOT NULL DEFAULT '',

    activated_at TEXT NOT NULL DEFAULT '',
    paused_at TEXT NOT NULL DEFAULT '',
    cancelled_at TEXT NOT NULL DEFAULT '',
    expired_at TEXT NOT NULL DEFAULT '',

    source TEXT NOT NULL DEFAULT 'Admin',

    notes TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(customer_id)
        REFERENCES customers(id)
        ON DELETE RESTRICT,

    FOREIGN KEY(product_id)
        REFERENCES products(id)
        ON DELETE RESTRICT,

    FOREIGN KEY(source_order_id)
        REFERENCES orders(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_memberships_customer
    ON memberships(customer_id);

CREATE INDEX IF NOT EXISTS idx_memberships_product
    ON memberships(product_id);

CREATE INDEX IF NOT EXISTS idx_memberships_order
    ON memberships(source_order_id);

CREATE INDEX IF NOT EXISTS idx_memberships_status
    ON memberships(status);

CREATE INDEX IF NOT EXISTS idx_memberships_customer_status
    ON memberships(customer_id, status);



-- ------------------------------------------------------------
-- 5. MEMBERSHIP EVENT AUDIT
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS membership_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    membership_id INTEGER NOT NULL,

    event_type TEXT NOT NULL
        CHECK(event_type IN (
            'created',
            'activated',
            'paused',
            'resumed',
            'renewed',
            'expired',
            'cancelled',
            'refunded',
            'updated'
        )),

    from_status TEXT NOT NULL DEFAULT '',
    to_status TEXT NOT NULL DEFAULT '',

    source TEXT NOT NULL DEFAULT 'Admin',
    source_reference TEXT NOT NULL DEFAULT '',

    notes TEXT NOT NULL DEFAULT '',

    event_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(membership_id)
        REFERENCES memberships(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_membership_events_membership
    ON membership_events(membership_id);

CREATE INDEX IF NOT EXISTS idx_membership_events_type
    ON membership_events(event_type);

CREATE INDEX IF NOT EXISTS idx_membership_events_date
    ON membership_events(event_at);