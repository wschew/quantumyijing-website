-- ============================================================
-- Quantum YiJing v4.0
-- Phase F1+F2 — Academy Portal Foundation
--
-- Additive only.
-- Authentication principal = canonical customers.id
-- No modification to A/B/C/D/E tables.
-- ============================================================


CREATE TABLE IF NOT EXISTS academy_portal_magic_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    customer_id INTEGER NOT NULL,

    email TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,

    expires_at TEXT NOT NULL,
    used_at TEXT NOT NULL DEFAULT '',

    requested_ip_hash TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(customer_id)
        REFERENCES customers(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_portal_magic_customer
    ON academy_portal_magic_links(customer_id);

CREATE INDEX IF NOT EXISTS idx_portal_magic_email
    ON academy_portal_magic_links(email);

CREATE INDEX IF NOT EXISTS idx_portal_magic_expires
    ON academy_portal_magic_links(expires_at);



CREATE TABLE IF NOT EXISTS academy_portal_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    customer_id INTEGER NOT NULL,

    token_hash TEXT NOT NULL UNIQUE,

    expires_at TEXT NOT NULL,

    last_seen_at TEXT NOT NULL DEFAULT '',
    revoked_at TEXT NOT NULL DEFAULT '',

    user_agent TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(customer_id)
        REFERENCES customers(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_portal_sessions_customer
    ON academy_portal_sessions(customer_id);

CREATE INDEX IF NOT EXISTS idx_portal_sessions_expires
    ON academy_portal_sessions(expires_at);



CREATE TABLE IF NOT EXISTS academy_portal_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    customer_id INTEGER,

    event_type TEXT NOT NULL
        CHECK(event_type IN(
            'magic_link_requested',
            'login_success',
            'logout',
            'session_expired',
            'session_revoked'
        )),

    source TEXT NOT NULL DEFAULT 'Academy Portal',

    details TEXT NOT NULL DEFAULT '',

    event_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(customer_id)
        REFERENCES customers(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_portal_events_customer
    ON academy_portal_events(customer_id);

CREATE INDEX IF NOT EXISTS idx_portal_events_type
    ON academy_portal_events(event_type);

CREATE INDEX IF NOT EXISTS idx_portal_events_date
    ON academy_portal_events(event_at);