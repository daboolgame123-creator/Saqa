-- ============================================================
-- Phase 18 — Migration 0011: محرك قواعد الإجازات والزمنيات
-- المرجع: ALSQAYA_PLAN §7.9/§7.10/§7.11 · §14 · §15 · #34 (PHASE 18).
--
-- إضافة فقط فوق 0003 — لا يُعدَّل أي ترحيل مُطبَّق ولا تُعاد كتابة
-- أي بيانات قائمة، ولا يُحذف قيد CHECK قديم إلا ليستبدل بقيم الأنواع
-- المعتمدة في §14 (الطارئة/الحج/العمرة/الدراسية مستقلة).
--
-- 1) leave_balances:was تعريف هيكلي — صار يحمل الرصيد الحسابي:
--    annual_balance           الرصيد الاعتيادي (مرحّل + مستحق − مستخدم)
--    annual_service_days      أيام الخدمة المتراكمة المحسوبة آخر مرة
--    annual_earned_days       الأيام المستحقة المُcredited فعلاً
--    annual_remainder_days    باقي دورة العشرة (0..9) — محفوظ دائماً
--    annual_carryover_days    الرصيد المرحّل من السنة السابقة
--    annual_pending_days      استحقاق محجوز خلف سقف 180 — حالة صريحة
--                             لقاعدة لم تحسمها الخطة (§14.1/§56.1)
--    emergency_balance        رصيد الطارئ للسنة (يُصفَّر إلى 15 كل سنة)
--    emergency_remainder_minutes  الدقائق غير المحولة (ترحل للسنة التالية)
--    unpaid_days              أيام بدون راتب (بلا سقف — §14.10 غير محسوم)
--
-- 2) leave_ledger: become a real ledger:
--    year          سنة الرصيد المتأثرة (مشتقّة من occurred_on)
--    unit          وحدة القيمة: day | minute — وإلا التبس يوم بدقائق
--    reverses_ledger_id  ربط الحركة العكسية بأصلها (لا حذف ولا محو)
--    time_permission_id  مصدر حركة «تحويل زمنيات»
--
-- 3) leaves.type / leave_ledger.leave_type: استبدال قيد CHECK بقائمة
--    الأنواع المعتمدة في §14 مع إبقاء الأنواع القديمة (بيانات قائمة).
-- ============================================================

-- migrate:up
-- ── 1) أنواع الإجازة المعتمدة في §14 ──────────────────────────────
ALTER TABLE leaves DROP CONSTRAINT leaves_type_check;
ALTER TABLE leaves ADD CONSTRAINT leaves_type_check CHECK (
    type IN ('annual', 'sick', 'excuse', 'unpaid', 'maternity', 'transfer', 'other',
             'emergency', 'hajj', 'umrah', 'study')
);

ALTER TABLE leave_ledger DROP CONSTRAINT leave_ledger_leave_type_check;
ALTER TABLE leave_ledger ADD CONSTRAINT leave_ledger_leave_type_check CHECK (
    leave_type IS NULL OR leave_type IN (
        'annual', 'sick', 'excuse', 'unpaid', 'maternity', 'transfer', 'other',
        'emergency', 'hajj', 'umrah', 'study'
    )
);

-- ── 2) الرصيد الحسابي ─────────────────────────────────────────────
ALTER TABLE leave_balances
    ADD COLUMN annual_balance numeric NOT NULL DEFAULT 0
        CHECK (annual_balance >= 0),
    ADD COLUMN annual_service_days integer NOT NULL DEFAULT 0
        CHECK (annual_service_days >= 0),
    ADD COLUMN annual_earned_days numeric NOT NULL DEFAULT 0
        CHECK (annual_earned_days >= 0),
    ADD COLUMN annual_remainder_days integer NOT NULL DEFAULT 0
        CHECK (annual_remainder_days >= 0 AND annual_remainder_days <= 9),
    ADD COLUMN annual_carryover_days numeric NOT NULL DEFAULT 0
        CHECK (annual_carryover_days >= 0),
    -- سقف 180 (§14.1): الاستحقاق الذي يتجاوزه لا يُقرَّر له سلوك تلقائي،
    -- فيُحفظ هنا كحالة صريحة بدل حذفه أو تجاوز السقف بصمت.
    ADD COLUMN annual_pending_days numeric NOT NULL DEFAULT 0
        CHECK (annual_pending_days >= 0),
    ADD COLUMN emergency_balance numeric NOT NULL DEFAULT 0
        CHECK (emergency_balance >= 0),
    ADD COLUMN emergency_remainder_minutes integer NOT NULL DEFAULT 0
        CHECK (emergency_remainder_minutes >= 0),
    ADD COLUMN unpaid_days numeric NOT NULL DEFAULT 0
        CHECK (unpaid_days >= 0);

-- ── 3) الـLedger: وحدات، وسنة، ورابط العكس، ومصدر الزمنية ──────────
ALTER TABLE leave_ledger
    ADD COLUMN unit text NOT NULL DEFAULT 'day'
        CHECK (unit IN ('day', 'minute')),
    ADD COLUMN reverses_ledger_id uuid REFERENCES leave_ledger (id),
    ADD COLUMN time_permission_id uuid REFERENCES time_permissions (id),
    -- `date_part` immutable(date) هو ما يسمح بعمود مولَّد؛ `::text` غير
    -- مضمون الثبات عبر إصدارات PostgreSQL فلا يُبنى عليه عمود مولَّد.
    ADD COLUMN year integer GENERATED ALWAYS AS (date_part('year', occurred_on)) STORED;

ALTER TABLE leave_ledger
    ADD CONSTRAINT leave_ledger_year_range CHECK (year BETWEEN 1000 AND 9999);
ALTER TABLE leave_ledger
    ADD CONSTRAINT leave_ledger_no_self_reversal CHECK (reverses_ledger_id IS DISTINCT FROM id);

CREATE INDEX leave_ledger_reverses_ledger_id_idx ON leave_ledger (reverses_ledger_id);
CREATE INDEX leave_ledger_time_permission_id_idx ON leave_ledger (time_permission_id);
CREATE INDEX leave_ledger_year_idx ON leave_ledger (employee_id, year, created_at);

-- migrate:down
DROP INDEX leave_ledger_year_idx;
DROP INDEX leave_ledger_time_permission_id_idx;
DROP INDEX leave_ledger_reverses_ledger_id_idx;

ALTER TABLE leave_ledger
    DROP CONSTRAINT leave_ledger_no_self_reversal,
    DROP CONSTRAINT leave_ledger_year_range,
    DROP COLUMN year,
    DROP COLUMN time_permission_id,
    DROP COLUMN reverses_ledger_id,
    DROP COLUMN unit;

ALTER TABLE leave_balances
    DROP COLUMN unpaid_days,
    DROP COLUMN emergency_remainder_minutes,
    DROP COLUMN emergency_balance,
    DROP COLUMN annual_pending_days,
    DROP COLUMN annual_carryover_days,
    DROP COLUMN annual_remainder_days,
    DROP COLUMN annual_earned_days,
    DROP COLUMN annual_service_days,
    DROP COLUMN annual_balance;

ALTER TABLE leave_ledger DROP CONSTRAINT leave_ledger_leave_type_check;
ALTER TABLE leave_ledger ADD CONSTRAINT leave_ledger_leave_type_check CHECK (
    leave_type IN ('annual', 'sick', 'excuse', 'unpaid', 'maternity', 'transfer', 'other')
);

ALTER TABLE leaves DROP CONSTRAINT leaves_type_check;
ALTER TABLE leaves ADD CONSTRAINT leaves_type_check CHECK (
    type IN ('annual', 'sick', 'excuse', 'unpaid', 'maternity', 'transfer', 'other')
);