-- ============================================================
-- Quantum YiJing v4.0 Phase E1+E2
-- POS / Inventory / Fulfilment foundation
--
-- ADDITIVE ONLY.
--
-- Existing financial tables remain canonical:
-- orders / order_items / payments / invoices / receipts
-- ============================================================


CREATE TABLE IF NOT EXISTS product_fulfilment_settings (
    product_id INTEGER PRIMARY KEY,

    fulfilment_required INTEGER NOT NULL DEFAULT 0
        CHECK(fulfilment_required IN (0,1)),

    inventory_tracked INTEGER NOT NULL DEFAULT 0
        CHECK(inventory_tracked IN (0,1)),

    default_method TEXT NOT NULL DEFAULT 'Pickup'
        CHECK(default_method IN (
            'Pickup',
            'Delivery',
            'Shipping'
        )),

    allow_pickup INTEGER NOT NULL DEFAULT 1
        CHECK(allow_pickup IN (0,1)),

    allow_delivery INTEGER NOT NULL DEFAULT 0
        CHECK(allow_delivery IN (0,1)),

    allow_shipping INTEGER NOT NULL DEFAULT 0
        CHECK(allow_shipping IN (0,1)),

    storage_location TEXT NOT NULL DEFAULT '',

    notes TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(product_id)
        REFERENCES products(id)
        ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS inventory_balances (
    product_id INTEGER PRIMARY KEY,

    stock_on_hand INTEGER NOT NULL DEFAULT 0
        CHECK(stock_on_hand >= 0),

    reorder_level INTEGER NOT NULL DEFAULT 0
        CHECK(reorder_level >= 0),

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(product_id)
        REFERENCES products(id)
        ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    product_id INTEGER NOT NULL,

    order_id INTEGER,
    order_item_id INTEGER,

    movement_type TEXT NOT NULL
        CHECK(movement_type IN (
            'Opening',
            'Receive',
            'POS Sale',
            'Adjustment',
            'Return'
        )),

    quantity_delta INTEGER NOT NULL,

    stock_after INTEGER NOT NULL,

    reference TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',

    created_by TEXT NOT NULL DEFAULT 'Admin',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(product_id)
        REFERENCES products(id)
        ON DELETE RESTRICT,

    FOREIGN KEY(order_id)
        REFERENCES orders(id)
        ON DELETE SET NULL,

    FOREIGN KEY(order_item_id)
        REFERENCES order_items(id)
        ON DELETE SET NULL
);


CREATE INDEX IF NOT EXISTS idx_inventory_movements_product
    ON inventory_movements(product_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_order
    ON inventory_movements(order_id);


CREATE TABLE IF NOT EXISTS order_fulfilments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    fulfilment_reference TEXT NOT NULL UNIQUE,

    order_id INTEGER NOT NULL UNIQUE,

    method TEXT NOT NULL
        CHECK(method IN (
            'Pickup',
            'Delivery',
            'Shipping'
        )),

    status TEXT NOT NULL DEFAULT 'Pending'
        CHECK(status IN (
            'Pending',
            'Preparing',
            'Ready',
            'Shipped',
            'Delivered',
            'Cancelled'
        )),

    recipient_name TEXT NOT NULL DEFAULT '',
    recipient_phone TEXT NOT NULL DEFAULT '',
    recipient_email TEXT NOT NULL DEFAULT '',

    address_line1 TEXT NOT NULL DEFAULT '',
    address_line2 TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    state_region TEXT NOT NULL DEFAULT '',
    postcode TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',

    courier TEXT NOT NULL DEFAULT '',
    tracking_number TEXT NOT NULL DEFAULT '',

    prepared_at TEXT NOT NULL DEFAULT '',
    ready_at TEXT NOT NULL DEFAULT '',
    shipped_at TEXT NOT NULL DEFAULT '',
    delivered_at TEXT NOT NULL DEFAULT '',
    cancelled_at TEXT NOT NULL DEFAULT '',

    notes TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(order_id)
        REFERENCES orders(id)
        ON DELETE CASCADE
);


CREATE INDEX IF NOT EXISTS idx_order_fulfilments_status
    ON order_fulfilments(status);

CREATE INDEX IF NOT EXISTS idx_order_fulfilments_tracking
    ON order_fulfilments(tracking_number);


CREATE TABLE IF NOT EXISTS fulfilment_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    fulfilment_id INTEGER NOT NULL,
    order_item_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,

    quantity INTEGER NOT NULL DEFAULT 1
        CHECK(quantity > 0),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(fulfilment_id, order_item_id),

    FOREIGN KEY(fulfilment_id)
        REFERENCES order_fulfilments(id)
        ON DELETE CASCADE,

    FOREIGN KEY(order_item_id)
        REFERENCES order_items(id)
        ON DELETE RESTRICT,

    FOREIGN KEY(product_id)
        REFERENCES products(id)
        ON DELETE RESTRICT
);


CREATE TABLE IF NOT EXISTS fulfilment_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    fulfilment_id INTEGER NOT NULL,

    event_type TEXT NOT NULL
        CHECK(event_type IN (
            'created',
            'preparing',
            'ready',
            'shipped',
            'delivered',
            'cancelled',
            'tracking_updated',
            'updated'
        )),

    from_status TEXT NOT NULL DEFAULT '',
    to_status TEXT NOT NULL DEFAULT '',

    source TEXT NOT NULL DEFAULT 'Admin',
    source_reference TEXT NOT NULL DEFAULT '',

    notes TEXT NOT NULL DEFAULT '',

    event_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(fulfilment_id)
        REFERENCES order_fulfilments(id)
        ON DELETE CASCADE
);


CREATE INDEX IF NOT EXISTS idx_fulfilment_events_fulfilment
    ON fulfilment_events(fulfilment_id);


CREATE TABLE IF NOT EXISTS pos_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    pos_reference TEXT NOT NULL UNIQUE,

    order_id INTEGER NOT NULL UNIQUE,

    status TEXT NOT NULL DEFAULT 'Completed'
        CHECK(status IN (
            'Completed',
            'Voided'
        )),

    location TEXT NOT NULL DEFAULT '',
    staff_name TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(order_id)
        REFERENCES orders(id)
        ON DELETE RESTRICT
);