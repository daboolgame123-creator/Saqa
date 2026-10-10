-- ============================================================
-- Phase 13 — Migration 0006: إتاحة الكتب وعلاقتها بالمنتسب
-- الجداول الجديدة (1): transaction_availability
-- المرجع: ALSQAYA_PLAN §9 (الإتاحة والأعمام) و§12 (Access Scope) و§29 (Phase 13).
-- ملاحظات:
--   * عمود `transactions.visibility` (jsonb) موجود منذ Phase 9/10 ولم يُغيَّر
--     هنا: نطاق الرؤية يُكتب فيه كتابع لقيم §12 الأربع، وهذه المرحلة تقرؤه
--     وتفرضه ولا تعيد تعريفه.
--   * الإتاحة **علاقة مستقلة** عن الربط (`transaction_employees` / BR-05):
--     §29 يميّز صريحاً بين «مرتبط» و«متاح» (`linked employee but not available`)،
--     و§9.4 تسند الإتاحة الجماعية إلى المرتبطين — فالربط وحده لا يمنح رؤية.
--   * السحب لا يحذف السجل: `revoked_at` يُملأ عند السحب (§9.3: «سحب الإتاحة
--     لا يحذف الكتاب» و«لا يحذف سجل الاطلاع السابق»)، فيبقى التاريخ محفوظاً.
--   * إتاحة سارية واحدة لكل (كتاب، منتسب): فهرس فريد **جزئي** على الصفوف غير
--     المسحوبة، فيصح إعادة المنح بعد السحب بسجل جديد بلا فقد تاريخ.
--   * لا بيانات تجريبية هنا (البيانات الاختبارية في الاختبارات فقط).
-- ============================================================

-- migrate:up
CREATE TABLE transaction_availability (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    employee_id    uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    granted_at     timestamptz NOT NULL DEFAULT now(),
    revoked_at     timestamptz,
    -- السحب لا يسبق المنح (سلامة الخط الزمني داخل السجل نفسه).
    CONSTRAINT transaction_availability_revoke_after_grant
        CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

-- الإتاحة السارية هي الصف الذي `revoked_at IS NULL`، والفهرس يمنع تكرارها
-- لنفس (الكتاب، المنتسب) دون أن يمنع سجلاً تاريخياً بعد السحب.
CREATE UNIQUE INDEX transaction_availability_active_unique
    ON transaction_availability (transaction_id, employee_id)
    WHERE revoked_at IS NULL;

-- قراءة سجل إتاحة كتاب كامل (فحص الإدارة §29) وقراءة إتاحات منتسب.
CREATE INDEX transaction_availability_transaction_id_idx ON transaction_availability (transaction_id);
CREATE INDEX transaction_availability_employee_id_idx ON transaction_availability (employee_id);

-- migrate:down
DROP TABLE transaction_availability;
