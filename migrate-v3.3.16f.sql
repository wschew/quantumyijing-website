
PRAGMA foreign_keys=ON;

-- Internal accounting product used only so affiliate_commissions.product_id
-- always points to a valid product. It is not a public product page.
INSERT INTO products(
  sku,slug,product_type,name_en,name_zh,description_en,description_zh,
  status,price,currency,sales_channel,payment_provider,external_purchase_url,
  starts_on,ends_on,time_en,time_zh,delivery_en,delivery_zh,instructor,
  early_bird_price,early_bird_end,hero_image_url
)
SELECT
  'GEN-AFF',
  'generic-affiliate-payment-internal',
  'other',
  'Generic Affiliate Payment',
  '通用联盟付款',
  'Internal accounting product for explicitly affiliate-attributed generic payments.',
  '用于明确联盟归因之通用付款的内部会计产品。',
  'Inactive',
  0,
  'MYR',
  'Website',
  'DOKU',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  NULL,
  '',
  ''
WHERE NOT EXISTS(
  SELECT 1 FROM products WHERE sku='GEN-AFF'
);

CREATE TABLE IF NOT EXISTS affiliate_accounting_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  generic_payment_commission_enabled INTEGER NOT NULL DEFAULT 1
    CHECK(generic_payment_commission_enabled IN (0,1)),
  generic_payment_commission_rate REAL NOT NULL DEFAULT 20
    CHECK(generic_payment_commission_rate >= 0 AND generic_payment_commission_rate <= 100),
  generic_payment_product_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT NOT NULL DEFAULT 'Admin',
  FOREIGN KEY (generic_payment_product_id) REFERENCES products(id) ON DELETE RESTRICT
);

INSERT INTO affiliate_accounting_settings(
  id,
  generic_payment_commission_enabled,
  generic_payment_commission_rate,
  generic_payment_product_id,
  updated_by
)
SELECT
  1,1,20,p.id,'Migration v3.3.16f'
FROM products p
WHERE p.sku='GEN-AFF'
ON CONFLICT(id) DO NOTHING;
