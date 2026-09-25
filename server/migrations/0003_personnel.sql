-- ============================================================
-- Phase 9 — Migration 0003: شؤون المنتسبين (Personnel)
-- الجداول (6): leaves, leave_balances, leave_ledger,
--               time_permissions, assignments, courses
-- المرجع: نماذج employeeLeave/employeeTimePermission/employeeAssignment/
--         employeeCourse و ALSQAYA_PLAN §7.9-§7.12 و§14/§15.
-- ملاحظات:
--   * leave_balances الهيكل التعريفي فقط — لا حقول حسابية قبل اعتماد BR-09.
--   * leave_ledger يدعم حركات الرصيد (§15) دون تنفيذ قواعدها (Phase 18).
--   * الربط بالكتاب (transaction_id) اختياري أحادي الاتجاه — لا حقول عكسية.
-- ============================================================

-- migrate:up
CREATE TABLE leaves (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id    uuid NOT NULL REFERENCES employees(id),
    -- الأنواع البرمجية الثابتة في النموذج (7 قيم).
    type           text NOT NULL CHECK (type IN ('annual', 'sick', 'excuse', 'unpaid', 'maternity', 'transfer', 'other')),
    start_date     date NOT NULL,
    end_date       date NOT NULL,
    days           integer CHECK (days IS NULL OR days >= 0),
    is_paid        boolean NOT NULL DEFAULT true,
    status         text NOT NULL CHECK (status IN ('registered', 'pending_approval', 'approved', 'cancelled')),
    transaction_id uuid REFERENCES transactions(id),
    notes          text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date)
);

CREATE INDEX leaves_employee_id_idx ON leaves (employee_id);
CREATE INDEX leaves_transaction_id_idx ON leaves (transaction_id);
CREATE INDEX leaves_start_date_idx ON leaves (start_date);

-- رصيد الإجازة: تعريف فقط (BR-09 غير معتمد) — سجل واحد لكل منتسب/سنة.
CREATE TABLE leave_balances (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL REFERENCES employees(id),
    year        text NOT NULL CHECK (year ~ '^[0-9]{4}$'),
    notes       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (employee_id, year)
);

-- سجل حركات الرصيد (الخطة §15): التاريخ/العملية/النوع/القيمة/الرصيد بعدها.
-- قواعد احتساب الرصيد تُنفَّذ لاحقاً (Phase 18) — هنا التخزين المنظم فقط.
CREATE TABLE leave_ledger (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id   uuid NOT NULL REFERENCES employees(id),
    -- الحركة المشتقة من سجل إجازة محدد (اختياري للاستحقاق ونقطة البداية).
    leave_id      uuid REFERENCES leaves(id),
    -- الحركات المعتمدة في §15 وتعليمات المرحلة: استحقاق، خصم، إلغاء، عكس،
    -- تحويل زمنيات، تصحيح إداري موثق، نقطة بداية افتتاحية.
    movement_type text NOT NULL CHECK (movement_type IN (
        'accrual', 'deduction', 'cancellation', 'reversal',
        'time_conversion', 'adjustment', 'opening_balance'
    )),
    leave_type    text CHECK (leave_type IN ('annual', 'sick', 'excuse', 'unpaid', 'maternity', 'transfer', 'other')),
    -- القيمة والوحدة (يوم/ساعة) تُحددهما قواعد Phase 18 — العمود يحمل الرقم كما يأتي.
    amount        numeric NOT NULL,
    balance_after numeric NOT NULL,
    occurred_on   date NOT NULL,
    notes         text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leave_ledger_employee_id_idx ON leave_ledger (employee_id);
CREATE INDEX leave_ledger_leave_id_idx ON leave_ledger (leave_id);
CREATE TABLE time_permissions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id      uuid NOT NULL REFERENCES employees(id),
    date             date NOT NULL,
    time_out         time NOT NULL,
    time_in          time,
    -- المدة بالدقائق (§14.3) تُحفظ اختيارياً عند تسليمها؛
    -- لا يشتقها قاعدة البيانات (النموذج يشتقها عرضياً من timeOut/timeIn).
    duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
    reason           text,
    status           text NOT NULL CHECK (status IN ('registered', 'approved', 'cancelled')),
    transaction_id   uuid REFERENCES transactions(id),
    notes            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX time_permissions_employee_id_idx ON time_permissions (employee_id);
CREATE INDEX time_permissions_transaction_id_idx ON time_permissions (transaction_id);
CREATE INDEX time_permissions_date_idx ON time_permissions (date);

CREATE TABLE assignments (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id    uuid NOT NULL REFERENCES employees(id),
    type           text NOT NULL CHECK (type IN ('task_assignment', 'delegation', 'shift_change', 'roster_transfer', 'other')),
    entity         text NOT NULL,
    place          text,
    start_date     date NOT NULL,
    end_date       date NOT NULL,
    purpose        text,
    status         text NOT NULL CHECK (status IN ('registered', 'in_progress', 'completed', 'cancelled')),
    transaction_id uuid REFERENCES transactions(id),
    notes          text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CHECK (end_date >= start_date)
);

CREATE INDEX assignments_employee_id_idx ON assignments (employee_id);
CREATE INDEX assignments_transaction_id_idx ON assignments (transaction_id);

CREATE TABLE courses (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id          uuid NOT NULL REFERENCES employees(id),
    name                 text NOT NULL,
    organizer            text NOT NULL,
    place                text,
    start_date           date,
    end_date             date,
    participation_type   text NOT NULL CHECK (participation_type IN ('participant', 'trainee', 'lecturer', 'coordinator', 'other')),
    participation_status text NOT NULL CHECK (participation_status IN ('registered', 'in_progress', 'completed', 'withdrew', 'cancelled')),
    transaction_id       uuid REFERENCES transactions(id),
    certificate_ref      text,
    notes                text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX courses_employee_id_idx ON courses (employee_id);
CREATE INDEX courses_transaction_id_idx ON courses (transaction_id);

-- migrate:down
DROP TABLE courses;
DROP TABLE assignments;
DROP TABLE time_permissions;
DROP TABLE leave_ledger;
DROP TABLE leave_balances;
DROP TABLE leaves;
