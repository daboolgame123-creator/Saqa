-- ============================================================
-- Phase 17 — Migration 0010: نسخة الكتاب للتزامن التفاؤلي
-- المرجع: ALSQAYA_PLAN §33 (Concurrency Control).
-- ملاحظات:
--   * إضافة عمود واحد على `transactions` فقط: لا جدول جديد ولا إعادة
--     بناء ولا مساس بأي بيانات قائمة — الصفوف الحالية تأخذ النسخة 1.
--   * `version` تزداد 1 عند كل كتابة ناجحة على الصف (تحديث/أرشفة/
--     استعادة)، وهي أساس optimistic locking: الكتابة تتم فقط إن كانت
--     النسخة المقروءة هي النسخة الحالية، فلا تُكتب نسخة قديمة فوق
--     أحدث بصمت (§33).
--   * قيد CHECK يمنع نسخة غير موجبة (لا قيمة مخترعة سالبة ولا صفر).
--   * `deleted_at` لا يُمسّ: قيود Phase 16 (0009) تبقى سارية، والنسخة
--     لا تتجاوز حالة الأرشفة إطلاقاً — شرط النسخة يُركَّب مع
--     `deleted_at` في الاستعلام نفسه.
-- ============================================================

-- migrate:up
ALTER TABLE transactions
    ADD COLUMN version integer NOT NULL DEFAULT 1,
    ADD CONSTRAINT transactions_version_positive CHECK (version >= 1);

-- migrate:down
ALTER TABLE transactions
    DROP CONSTRAINT transactions_version_positive,
    DROP COLUMN version;