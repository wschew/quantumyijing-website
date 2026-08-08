-- Quantum YiJing v2.9 — Sales & Commerce CRM
-- The core products, orders, order_items and payments tables were created by migrate-v2.7.sql.
-- v2.9 activates them in the Academy Operating System. These indexes are safe to run repeatedly.
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_channel ON products(sales_channel);
CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(sales_channel);
CREATE INDEX IF NOT EXISTS idx_orders_provider ON orders(payment_provider);
CREATE INDEX IF NOT EXISTS idx_orders_affiliate ON orders(affiliate_code);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
