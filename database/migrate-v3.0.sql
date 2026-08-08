-- Quantum YiJing® v3.0 — Automated Product & Sales Funnel
-- FOR A CLEAN v2.9 DATABASE ONLY.
-- Run ONCE only if the v3.0 product columns do not already exist.
-- If PRAGMA table_info(products) already shows starts_on through hero_image_url,
-- DO NOT run this migration again.

ALTER TABLE products ADD COLUMN starts_on TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN ends_on TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN time_en TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN time_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN delivery_en TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN delivery_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN instructor TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN early_bird_price REAL;
ALTER TABLE products ADD COLUMN early_bird_end TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN hero_image_url TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_products_slug_status ON products(slug,status);

-- First live v3.0 pilot: YJ12 — Yijing: Science of Prediction
INSERT OR IGNORE INTO products (
  sku,slug,product_type,name_en,name_zh,description_en,description_zh,status,price,currency,
  sales_channel,payment_provider,external_purchase_url,senangpay_enabled,affiliate_enabled,
  starts_on,ends_on,time_en,time_zh,delivery_en,delivery_zh,instructor,early_bird_price,early_bird_end,hero_image_url
) VALUES (
  'YJ12','yj12-yijing-science-of-prediction','course',
  'YJ12 Yijing: Science of Prediction','YJ12 易经预测科学',
  'A live two-day Zoom programme exploring Yijing divination as a structured science of prediction, taught by Master Chew Wai Soon.',
  '两天线上课程，以系统化方式学习易经预测，由 Master Chew Wai Soon 主讲。',
  'Active',1800,'MYR','Website','SenangPay','',0,1,
  '2026-09-26','2026-09-27','10:00 AM – 5:00 PM','上午10时 – 下午5时',
  'Live via Zoom','Zoom 线上直播','Master Chew Wai Soon',1400,'2026-08-31',
  '/images/yj12-yijing-science-of-prediction.png'
);

SELECT id,sku,slug,name_en,status,price,early_bird_price,early_bird_end
FROM products WHERE sku='YJ12';
