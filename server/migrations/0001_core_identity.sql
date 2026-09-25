-- ============================================================
-- Phase 9 — Migration 0001: الهوية الأساسية (Core Identity)
-- الجداول (3): employees, users, employee_status_history
-- المرجع: ALSQAYA_PLAN §7.2/§7.3/§32 ونماذج src/core/models.
-- ملاحظات:
--   * العلاقة تخزَّن في جهة واحدة فقط (users.employee_id UNIQUE)
--     لضمان عدم تعارض الاتجاهين في النموذجين (Employee.userId و User.employeeId).
--   * employees.status = الحالة الراهنة، وemployee_status_history = التاريخ.
--   * لا حذف للموظف عند انتهاء الخدمة — يُنقل إلى حالة 'former' (§32).
-- ============================================================

-- migrate:up
CREATE TABLE employees (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name             text NOT NULL,
    title            text NOT NULL,
    department       text NOT NULL,
    badge_number     text UNIQUE,
    joined_date      date,
    category         text CHECK (category IN ('منتسب', 'باحث')),
    academic_degree  text,
    specialization   text,
    -- الحالة الراهنة (الخطة §7.3/§32): خاضع للخدمة أو موظف سابق.
    status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'former')),
    -- الهاتف والصورة وفق الخطة §7.2 (يتبلور استخدامهما في مراحل لاحقة).
    phone            text,
    photo            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username           text NOT NULL UNIQUE,
    display_name       text NOT NULL,
    role               text NOT NULL CHECK (role IN ('employee', 'archivist', 'director', 'admin')),
    -- ربط حساب المستخدم بالمنتسب: حساب واحد لكل منتسب (الخطة §22).
    employee_id        uuid UNIQUE REFERENCES employees(id),
    email              text,
    avatar             text,
    department         text,
    custom_permissions text[],
    is_active          boolean NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    last_login_at      timestamptz
);

CREATE TABLE employee_status_history (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id        uuid NOT NULL REFERENCES employees(id),
    status             text NOT NULL CHECK (status IN ('active', 'former')),
    -- سبب انتهاء الخدمة من القيم المعتمدة في الخطة §7.3 فقط،
    -- وإلزامه عند نقل الموظف إلى 'former' (§13: النقل بسبب انتهاء الخدمة).
    service_end_reason text CHECK (service_end_reason IN ('انتهت خدمته', 'تقاعد', 'انفصال', 'استقالة')),
    notes              text,
    changed_at         timestamptz NOT NULL DEFAULT now(),
    CHECK (status <> 'former' OR service_end_reason IS NOT NULL)
);

-- فهرس لاستعلام الموظف حساباته والعكس ضمن FK.
CREATE INDEX employees_status_idx ON employees (status);
CREATE INDEX employee_status_history_employee_id_idx ON employee_status_history (employee_id);

-- migrate:down
DROP TABLE employee_status_history;
DROP TABLE users;
DROP TABLE employees;
