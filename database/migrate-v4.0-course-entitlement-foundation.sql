-- Quantum YiJing v4.0 Phase C1
-- Digital Course Entitlement Foundation
--
-- Principles:
--   customers = canonical identity
--   students = optional CRM / academic identity
--   products = course offering
--   orders / payments = financial truth
--   course_entitlements = actual digital-course access authority
--
-- This migration is additive only.
-- It does not modify students, products, orders, payments,
-- memberships, subscriptions, affiliate, accounting,
-- email automation, or WhatsApp tables.

CREATE TABLE IF NOT EXISTS course_entitlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    entitlement_reference TEXT NOT NULL UNIQUE,

    customer_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,

    student_id INTEGER,

    source_order_id INTEGER,
    source_membership_id INTEGER,

    status TEXT NOT NULL DEFAULT 'Pending'
        CHECK (
            status IN (
                'Pending',
                'Active',
                'Paused',
                'Expired',
                'Revoked'
            )
        ),

    access_scope TEXT NOT NULL DEFAULT 'FullCourse'
        CHECK (
            access_scope IN (
                'FullCourse'
            )
        ),

    starts_at TEXT NOT NULL DEFAULT '',
    ends_at TEXT NOT NULL DEFAULT '',

    granted_at TEXT NOT NULL DEFAULT '',
    paused_at TEXT NOT NULL DEFAULT '',
    revoked_at TEXT NOT NULL DEFAULT '',
    expired_at TEXT NOT NULL DEFAULT '',

    source_type TEXT NOT NULL DEFAULT 'Admin'
        CHECK (
            source_type IN (
                'Order',
                'Membership',
                'Admin',
                'Complimentary',
                'Migration'
            )
        ),

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

    FOREIGN KEY(student_id)
        REFERENCES students(id)
        ON DELETE SET NULL,

    FOREIGN KEY(source_order_id)
        REFERENCES orders(id)
        ON DELETE RESTRICT,

    FOREIGN KEY(source_membership_id)
        REFERENCES memberships(id)
        ON DELETE RESTRICT
);


CREATE TABLE IF NOT EXISTS course_entitlement_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    course_entitlement_id INTEGER NOT NULL,

    event_type TEXT NOT NULL
        CHECK (
            event_type IN (
                'created',
                'activated',
                'paused',
                'resumed',
                'expired',
                'revoked',
                'student_linked',
                'student_unlinked',
                'updated'
            )
        ),

    source TEXT NOT NULL DEFAULT 'Admin',
    source_reference TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',

    event_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(course_entitlement_id)
        REFERENCES course_entitlements(id)
        ON DELETE CASCADE
);


CREATE INDEX IF NOT EXISTS
    idx_course_entitlements_customer
ON course_entitlements(customer_id);


CREATE INDEX IF NOT EXISTS
    idx_course_entitlements_customer_status
ON course_entitlements(customer_id,status);


CREATE INDEX IF NOT EXISTS
    idx_course_entitlements_product
ON course_entitlements(product_id);


CREATE INDEX IF NOT EXISTS
    idx_course_entitlements_product_status
ON course_entitlements(product_id,status);


CREATE INDEX IF NOT EXISTS
    idx_course_entitlements_student
ON course_entitlements(student_id);


CREATE INDEX IF NOT EXISTS
    idx_course_entitlements_source_order
ON course_entitlements(source_order_id);


CREATE INDEX IF NOT EXISTS
    idx_course_entitlements_source_membership
ON course_entitlements(source_membership_id);


CREATE INDEX IF NOT EXISTS
    idx_course_entitlement_events_entitlement
ON course_entitlement_events(course_entitlement_id);


CREATE INDEX IF NOT EXISTS
    idx_course_entitlement_events_time
ON course_entitlement_events(course_entitlement_id,event_at);