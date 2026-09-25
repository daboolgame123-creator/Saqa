-- ============================================================
-- Phase 9 — Migration 0004: العمليات والسجلات (Operations & Logs)
-- الجداول (6): daily_situations, requests, notifications, reminders,
--               audit_logs, view_logs
-- المرجع: نماذج dailySituation/request و ALSQAYA_PLAN §7.13-§7.16 و§9/§20/§21/§31.
-- ملاحظات:
--   * الروابط متعددة الأنماط (kind+id في النموذج) تُخزَّن كأعمدة FK منفصلة
--     لكل هدف مع يقظة ألا يتجاوز رابطاً واحداً — لضمان تكامل مرجعي حقيقي.
--   * audit_logs/view_logs تحضير لبنية Phase 15 — لا سياسات ولا سلوك هنا.
--   * لا بيانات تجريبية داخل الـSQL (البيانات الاختبارية في الاختبارات فقط).
-- ============================================================

-- migrate:up
CREATE TABLE daily_situations (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id                uuid NOT NULL REFERENCES employees(id),
    date                       date NOT NULL,
    -- الأقسام الستة المعتمدة للاستمارة الرسمية (قيم النموذج البرمجية).
    category                   text NOT NULL CHECK (category IN (
                                   'permanent_leaves', 'permanent_time_permissions',
                                   'permanent_shift_changes', 'temporary_leaves',
                                   'temporary_time_permissions', 'temporary_shift_changes')),
    time_or_duration           text,
    reason                     text,
    notes                      text,
    -- رابط اختياري واحد كحد أقصى إلى سجل إداري ذي صلة (أنواع النموذج الخمسة).
    related_transaction_id     uuid REFERENCES transactions(id),
    related_leave_id           uuid REFERENCES leaves(id),
    related_time_permission_id uuid REFERENCES time_permissions(id),
    related_assignment_id      uuid REFERENCES assignments(id),
    related_course_id          uuid REFERENCES courses(id),
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now(),
    CHECK ((CASE WHEN related_transaction_id     IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN related_leave_id           IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN related_time_permission_id IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN related_assignment_id      IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN related_course_id          IS NOT NULL THEN 1 ELSE 0 END) <= 1)
);

CREATE INDEX daily_situations_employee_id_idx ON daily_situations (employee_id);
CREATE INDEX daily_situations_date_idx ON daily_situations (date);

CREATE TABLE requests (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id              uuid NOT NULL REFERENCES employees(id),
    kind                     text NOT NULL CHECK (kind IN ('leave', 'time_permission')),
    -- حمولة مميّزة بالنوع (discriminated union) كما في النموذج.
    payload                  jsonb NOT NULL,
    status                   text NOT NULL CHECK (status IN (
                                 'submitted', 'clarification_requested',
                                 'approved', 'rejected', 'cancelled')),
    clarification            jsonb,
    director_decision        jsonb,
    notes                    text,
    -- السجل الناتج بعد الاعتماد (linkedRecordId في النموذج) — هدف واحد كحد أقصى.
    linked_leave_id          uuid REFERENCES leaves(id),
    linked_time_permission_id uuid REFERENCES time_permissions(id),
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    CHECK ((CASE WHEN linked_leave_id           IS NOT NULL THEN 1 ELSE 0 END +
            CASE WHEN linked_time_permission_id IS NOT NULL THEN 1 ELSE 0 END) <= 1)
);

CREATE INDEX requests_employee_id_idx ON requests (employee_id);
CREATE INDEX requests_status_idx ON requests (status);

CREATE TABLE notifications (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- أنواع الاستخدام الأساسية في الخطة §20 (6 قيم).
    kind       text NOT NULL CHECK (kind IN (
                   'book_available', 'new_broadcast', 'important_change',
                   'new_request', 'request_update', 'due_reminder')),
    -- سياق الحدث (مرجع الكتاب/الرسالة/الطلب...) — تفاصيل العرض تُبنى في Phase 20.
    payload    jsonb,
    is_new     boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    read_at    timestamptz
);

CREATE INDEX notifications_user_id_idx ON notifications (user_id);

CREATE TABLE reminders (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    enabled     boolean NOT NULL DEFAULT true,
    remind_on   date NOT NULL,
    remind_at   time NOT NULL,
    note        text NOT NULL,
    -- الحالة (تنفيذ/انتهاء) عند الحاجة — قيمها تُعتمد في Phase 21 (§21).
    status      text,
    -- مرجع السجل المتابع (§7.14) — أهدافه غير مثبتة بعد فلا FK الآن.
    related_kind text,
    related_id   uuid,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reminders_remind_on_idx ON reminders (remind_on);

-- سجل التدقيق (Phase 15 تحضيراً): من/متى/ماذا/القيم السابقة واللاحقة (§7.15 و§31).
-- لا يُحذف بـ CASCADE — بقاء الصف مضمون عند حذف المستخدم/المنتسب (SET NULL
-- لأطراف الفاعل مع بقاء القيمة السابقة داخل old_values jsonb).
CREATE TABLE audit_logs (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- أحداث §31 المعتمدة (12 فعلاً: الإنشاء/التعديل/الأرشفة/الحذف/تغيير الحالة
    -- تغيير الصلاحية/الدخول/الخروج/أحداث OTP/وصول ملف حساس/كشف سر مدير/نسخ احتياطي).
    event_kind        text NOT NULL CHECK (event_kind IN (
                          'create', 'update', 'archive', 'delete', 'status_change',
                          'permission_change', 'login', 'logout', 'otp_event',
                          'sensitive_file_access', 'admin_secret_reveal', 'backup_restore')),
    actor_user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
    actor_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
    -- الكيان المتأثر — طبيعة متعددة (kind+id) فلا FK؛ القيم الكاملة في jsonb.
    entity_kind       text,
    entity_id         uuid,
    old_values        jsonb,
    new_values        jsonb,
    occurred_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_occurred_at_idx ON audit_logs (occurred_at);
CREATE INDEX audit_logs_event_kind_idx ON audit_logs (event_kind);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_kind, entity_id);
CREATE INDEX audit_logs_actor_user_id_idx ON audit_logs (actor_user_id);

-- سجل الاطلاع الرسمي (§9.1/§9.2 و§7.16) — تحضير Phase 15:
-- لا يُحذف سجل الاطلاع ولا الكتاب المفهرس عليه في الاستخدام العادي (RESTRICT).
CREATE TABLE view_logs (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id   uuid NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
    -- المستخدم/المنتسب — أحدهما على الأقل مطلوب (§9.2: يُسجل من أطّلع).
    user_id          uuid REFERENCES users(id) ON DELETE SET NULL,
    employee_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
    viewed_at        timestamptz NOT NULL DEFAULT now(),
    -- ختم التأكيد الرسمي لزر «اطلعت» (§9.1) — سلوكه يُفعَّل في Phase 15.
    acknowledged_at  timestamptz,
    -- بيانات الجلسة عند الحاجة (§9.2) — نص اختياري غير منظَّم الآن.
    session_ref      text,
    CHECK (user_id IS NOT NULL OR employee_id IS NOT NULL)
);

CREATE INDEX view_logs_transaction_id_idx ON view_logs (transaction_id);
CREATE INDEX view_logs_user_id_idx ON view_logs (user_id);
CREATE INDEX view_logs_viewed_at_idx ON view_logs (viewed_at);

-- migrate:down
DROP TABLE view_logs;
DROP TABLE audit_logs;
DROP TABLE reminders;
DROP TABLE notifications;
DROP TABLE requests;
DROP TABLE daily_situations;
