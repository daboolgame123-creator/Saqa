-- ============================================================
-- Phase 19 — Migration 0012: الطلبات وسير الموافقة (Requests + Workflow)
-- المرجع: ALSQAYA_PLAN §7.12 · §18 · #35 (PHASE 19).
--
-- إضافة فقط فوق 0004 — لا يُعدَّل أي ترحيل مُطبَّق ولا تُعاد كتابة أي
-- بيانات قائمة، ولا يُحذف صف طلب واحد.
--
-- 1) requests.kind: الأنواع الأولية التي نصّت عليها §35 صراحةً:
--    طلبات عامة (general) · أجهزة/معدات (equipment) · إجازة (leave) ·
--    زمنية (time_permission). الأنواع القائمة (leave/time_permission)
--    باقية فلا يُفقد سجل قائم.
-- 2) requests.status: الحالات السبع في §35 — draft · submitted ·
--    under_review · clarification_requested · approved · rejected ·
--    cancelled. القيم القائمة كانت خمساً (بلا draft وunder_review).
--    ملاحظة: `under_review` حالة معتمدة في النص لكن **لا عملية معتمدة
--    تُنتجها** (قرار غير محسوم — موثّق في PHASE_19_REPORT.md)؛ تُقبل
--    في القيد ليطابق عقد الحالة، ولا يُخترع لها مسار.
-- 3) requests.version: قفل تفاؤلي (Phase 17 · §33) — المنطق نفسه
--    المطبَّق على transactions في 0010.
-- 4) request_status_history: تاريخ التغييرات الذي يطلبه §18 صراحةً
--    («تاريخ التغييرات») — سجل لكل انتقال حالة، لا يُحذف (§15/§32).
--    `action` قيمها من عمليات §35 نفسها، و`from_status` فارغ في صف
--    الإنشاء (لا حالة سابقة).
-- ============================================================

-- migrate:up
-- ── 1) أنواع الطلبات المعتمدة في §35 ────────────────────────────
ALTER TABLE requests DROP CONSTRAINT requests_kind_check;
ALTER TABLE requests ADD CONSTRAINT requests_kind_check CHECK (
    kind IN ('general', 'equipment', 'leave', 'time_permission')
);

-- ── 2) حالات الطلب المعتمدة في §35 ─────────────────────────────
ALTER TABLE requests DROP CONSTRAINT requests_status_check;
ALTER TABLE requests ADD CONSTRAINT requests_status_check CHECK (
    status IN ('draft', 'submitted', 'under_review', 'clarification_requested',
               'approved', 'rejected', 'cancelled')
);

-- ── 3) نسخة القفل التفاؤلي (Phase 17 · §33) ─────────────────────
ALTER TABLE requests
    ADD COLUMN version integer NOT NULL DEFAULT 1,
    ADD CONSTRAINT requests_version_positive CHECK (version >= 1);

-- ── 4) تاريخ تغييرات حالة الطلب (§18) ───────────────────────────
-- `action` قيمها عمليات §35 نفسها، و`from_status` فارغ في صف الإنشاء
-- (لا حالة سابقة).
-- `ON DELETE RESTRICT` على الطلب: تاريخ الحالة لا يُمحى بمحو الطلب.
CREATE TABLE request_status_history (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id         uuid NOT NULL REFERENCES requests(id) ON DELETE RESTRICT,
    from_status        text CHECK (from_status IS NULL OR from_status IN (
                           'draft', 'submitted', 'under_review', 'clarification_requested',
                           'approved', 'rejected', 'cancelled')),
    to_status          text NOT NULL CHECK (to_status IN (
                           'draft', 'submitted', 'under_review', 'clarification_requested',
                           'approved', 'rejected', 'cancelled')),
    action             text NOT NULL CHECK (action IN (
                           'create', 'submit', 'approve', 'reject',
                           'request_clarification', 'employee_reply', 'cancel')),
    -- الفاعل من هوية الجلسة (Phase 15): يبقى محفوظاً حتى لو حُذف
    -- الحساب أو حُذف المنتسب (SET NULL) — نفس سياسة audit_logs.
    actor_user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
    actor_employee_id  uuid REFERENCES employees(id) ON DELETE SET NULL,
    comment            text,
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX request_status_history_request_idx
    ON request_status_history (request_id, created_at, id);

-- migrate:down
DROP INDEX request_status_history_request_idx;
DROP TABLE request_status_history;

ALTER TABLE requests
    DROP CONSTRAINT requests_version_positive,
    DROP COLUMN version;

ALTER TABLE requests DROP CONSTRAINT requests_kind_check;
ALTER TABLE requests ADD CONSTRAINT requests_kind_check CHECK (kind IN ('leave', 'time_permission'));

ALTER TABLE requests DROP CONSTRAINT requests_status_check;
ALTER TABLE requests ADD CONSTRAINT requests_status_check CHECK (
    status IN ('submitted', 'clarification_requested', 'approved', 'rejected', 'cancelled')
);