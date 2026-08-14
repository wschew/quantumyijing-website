ALTER TABLE products ADD COLUMN affiliate_public_path TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_products_affiliate_eligible ON products(affiliate_enabled,status);
SELECT id,sku,slug,name_en,product_type,status,affiliate_enabled,commission_type,commission_value,affiliate_public_path FROM products ORDER BY id;
