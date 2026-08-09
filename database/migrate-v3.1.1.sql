-- Quantum YiJing v3.1.1
-- Pricing snapshot + international display-currency foundation
-- Run ONCE only after v3.1.

ALTER TABLE order_items ADD COLUMN list_unit_price REAL NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN final_unit_price REAL NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN pricing_rule TEXT NOT NULL DEFAULT '';

ALTER TABLE orders ADD COLUMN display_currency TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN display_exchange_rate REAL NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN display_amount REAL NOT NULL DEFAULT 0;

UPDATE order_items
SET
  list_unit_price = CASE WHEN list_unit_price = 0 THEN unit_price ELSE list_unit_price END,
  final_unit_price = CASE WHEN final_unit_price = 0 THEN unit_price ELSE final_unit_price END
WHERE list_unit_price = 0 OR final_unit_price = 0;

CREATE INDEX IF NOT EXISTS idx_orders_display_currency ON orders(display_currency);

SELECT id, order_id, quantity, unit_price, list_unit_price,
       discount_amount, final_unit_price, pricing_rule
FROM order_items
ORDER BY id DESC
LIMIT 10;
