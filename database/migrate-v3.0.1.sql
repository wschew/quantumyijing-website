-- Quantum YiJing v3.0.1
-- Run ONCE only.

ALTER TABLE products ADD COLUMN long_description_en TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN long_description_zh TEXT NOT NULL DEFAULT '';

UPDATE products
SET
  long_description_en = 'YJ12 Yijing: Science of Prediction is a structured two-day programme designed to introduce participants to the principles, logic, and practical methodology of Yijing divination.

Rather than treating prediction as mere intuition or fortune-telling, the course explores how the Yijing can be understood as a systematic framework for analysing change, timing, relationships, and the development of events.

Under the guidance of Master Chew Wai Soon, participants will learn how a Yijing prediction is constructed, interpreted, and applied to real-life questions. Through explanations and practical examples, the course develops a more disciplined approach to reading the hexagrams and understanding the dynamic relationships behind a prediction.

The programme is suitable for beginners who want a structured foundation in Yijing prediction, as well as existing practitioners who wish to strengthen their analytical approach.',
  long_description_zh = 'YJ12《易经预测科学》是一门为期两天的系统课程，带领学员从易经的基本原理、逻辑结构与实际应用，学习如何运用易经进行预测与分析。

本课程不把易经预测单纯视为直觉或“算命”，而是从一个更系统化的角度，探讨如何通过易经理解变化、时机、关系以及事情发展的趋势。

在 Master Chew Wai Soon 的指导下，学员将学习一个易经预测如何建立、分析与解读，并通过实际案例，逐步掌握卦象背后的变化规律与判断思维。

课程适合希望系统学习易经预测的初学者，也适合已经接触易经、希望进一步提升分析能力与预测思维的学习者。',
  updated_at = CURRENT_TIMESTAMP
WHERE sku = 'YJ12';

SELECT sku, long_description_en, long_description_zh
FROM products
WHERE sku = 'YJ12';
