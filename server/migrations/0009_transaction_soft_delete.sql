-- ============================================================
-- Phase 16 — Migration 0009: Soft Delete للكتب + تقييد الحذف الفعلي
-- المرجع: ALSQAYA_PLAN §32 (Soft Delete + Data Integrity) و§13 (الموظفون
-- السابقون) و§9.3 و§30.
-- ملاحظات:
--   * إضافة أعمدة فقط على `transactions`: لا إعادة بناء ولا حذف بيانات.
--     `deleted_at IS NULL` = كتاب نشط؛ والقيم الثلاث تُصفَّر معاً بالاستعادة.
--   * `deleted_by` يمرّ بـ`SET NULL` كـ`audit_logs.actor_user_id`: بقاء الصف
--     (تاريخ الأرشفة) مضمون حتى لو حُذف الحساب.
--   * تقييد الحذف الفعلي: القيود التي كانت `ON DELETE CASCADE` نحو
--     `transactions` تصبح `RESTRICT`. السبب: الحذف الناعم صار مسار النظام
--     الإداري الوحيد، فالحذف الفعلي لم يعد عملية نظام — ومنفذُه خطأ
--     تشغيلي أو مخطط خارج النطاق. `RESTRICT` يمنع أن يمحو خطأ واحد
--     الروابط والمرفقات وسجلات الإتاحة وسجل الاطلاع معاً.
--     أما `view_logs` فمقيَّد بـRESTRICT منذ Phase 9، وهنا يكتمل التقييد.
--   * القيود من `employees` (CASCADE) لا تُمسّ: تغييرها خارج نطاق الكتب.
--   * `delete_reason` بلا قائمة معتمدة في الخطة («سبب الحذف عند الحاجة»)،
--     فهو نص حر اختياري يخضع لفحص النص في طبقة التحقق.
-- ============================================================

-- migrate:up
ALTER TABLE transactions
    ADD COLUMN deleted_at    timestamptz,
    ADD COLUMN deleted_by    uuid REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN delete_reason text,
    -- سبب الحذف لا معنى له إلا مع كتاب مؤرشف: يمنع سبباً يتيم على كتاب نشط.
    ADD CONSTRAINT transactions_delete_reason_requires_archive
        CHECK (delete_reason IS NULL OR deleted_at IS NOT NULL);

-- القوائم النشطة (الاستعلام الافتراضي) مرتّبة بتاريخ الكتاب — الفهرس الجزئي
-- يخدمها مباشرة ويقصر التكلفة على الكتب النشطة.
CREATE INDEX transactions_active_idx
    ON transactions (document_date DESC)
    WHERE deleted_at IS NULL;

-- قائمة المؤرشفة (سجل إداري): الأحدث أرشفة أولاً.
CREATE INDEX transactions_archived_idx
    ON transactions (deleted_at DESC)
    WHERE deleted_at IS NOT NULL;

-- تقييد الحذف الفعلي: كل جدول يعتمد على كتاب لا يُحذف محذوفاً.
ALTER TABLE transaction_employees
    DROP CONSTRAINT transaction_employees_transaction_id_fkey,
    ADD CONSTRAINT transaction_employees_transaction_id_fkey
        FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT;

ALTER TABLE attachments
    DROP CONSTRAINT attachments_transaction_id_fkey,
    ADD CONSTRAINT attachments_transaction_id_fkey
        FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT;

ALTER TABLE transaction_availability
    DROP CONSTRAINT transaction_availability_transaction_id_fkey,
    ADD CONSTRAINT transaction_availability_transaction_id_fkey
        FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT;

-- migrate:down
ALTER TABLE transaction_availability
    DROP CONSTRAINT transaction_availability_transaction_id_fkey,
    ADD CONSTRAINT transaction_availability_transaction_id_fkey
        FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE;

ALTER TABLE attachments
    DROP CONSTRAINT attachments_transaction_id_fkey,
    ADD CONSTRAINT attachments_transaction_id_fkey
        FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE;

ALTER TABLE transaction_employees
    DROP CONSTRAINT transaction_employees_transaction_id_fkey,
    ADD CONSTRAINT transaction_employees_transaction_id_fkey
        FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE;

DROP INDEX transactions_archived_idx;
DROP INDEX transactions_active_idx;

ALTER TABLE transactions
    DROP CONSTRAINT transactions_delete_reason_requires_archive,
    DROP COLUMN delete_reason,
    DROP COLUMN deleted_by,
    DROP COLUMN deleted_at;
