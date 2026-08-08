-- Safe content-only correction for the CURRENT database used during v3.0 setup.
-- Does not alter schema and does not create duplicate products.
UPDATE products
SET name_zh='YJ12 易经预测科学',
    description_en='A live two-day Zoom programme exploring Yijing divination as a structured science of prediction, taught by Master Chew Wai Soon.',
    description_zh='两天线上课程，以系统化方式学习易经预测，由 Master Chew Wai Soon 主讲。',
    updated_at=CURRENT_TIMESTAMP
WHERE sku='YJ12';

SELECT sku,name_en,name_zh,description_zh FROM products WHERE sku='YJ12';
