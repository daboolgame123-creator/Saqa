-- ============================================================
-- Phase 15 — Migration 0008: قيد الحالة المنطقية لسجل الاطلاع
-- المرجع: ALSQAYA_PLAN §9.1/§9.2 و§31 (View/Acknowledgement Logs).
-- لماذا: «اطلعت» إجراء صريح idempotent — تكرار الطلب لا ينشئ حالة
--   اطلاع رسمية مكررة لنفس (الكتاب، المستخدم). القيد يفرض ذلك في
--   القاعدة نفسها لا في الواجهة ولا في منطق الطلب وحده.
-- ملاحظات:
--   * قيد إضافي فقط — لا تغيير على جدول ولا عمود ولا بيانات قائمة.
--   * UNIQUE(transaction_id, user_id): صفر NULLs تتعارض (لا يمسّ
--     أي صف قائم)، وسجلاتنا تُكتب دائماً بـuser_id من الجلسة.
--   * لا يُحذف سجل الاطلاع — القيد يمنع الازدواج لا البقاء (§9.2).
-- ============================================================

-- migrate:up
ALTER TABLE view_logs
    ADD CONSTRAINT view_logs_transaction_user_key
    UNIQUE (transaction_id, user_id);

-- migrate:down
ALTER TABLE view_logs
    DROP CONSTRAINT view_logs_transaction_user_key;
