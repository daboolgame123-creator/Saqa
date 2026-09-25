-- ============================================================
-- Phase 9 — Migration 0002: المعاملات (Transactions)
-- الجداول (3): transactions, transaction_employees, attachments
-- المرجع: نماذج transaction.ts / transactionEmployee.ts و ALSQAYA_PLAN §7.6/§7.7.
-- ملاحظات:
--   * document_date = تاريخ الكتاب، مستقل عن created_at (استراتيجية التواريخ)
--     وmonth مشتق منه للتصفية الشهرية (ليس تصنيفاً مستقلاً).
--   * employee_name محفوظ للتوافق التراجعي فقط؛ الرابط الفعلي عبر
--     transaction_employees (employeeId وليس الاسم — القاعدة 7).
--   * المرفقات: بيانات وصفية فقط (لا بايتات ولا Base64) — تخزين الملفات Phase 14.
-- ============================================================

-- migrate:up
CREATE TABLE transactions (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number               text NOT NULL,
    sequence             text NOT NULL,
    document_date        date NOT NULL,
    month                text NOT NULL CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),
    direction            text NOT NULL CHECK (direction IN ('صادر', 'وارد', 'داخلي')),
    category             text NOT NULL CHECK (category IN ('إدارية', 'مالية', 'منتسبين', 'الأساتذة', 'أخرى')),
    sub_type             text NOT NULL,
    entity               text NOT NULL,
    subject              text NOT NULL,
    addressed_to         text,
    content              text,
    employee_name        text,
    visibility           jsonb,
    target_scope         text CHECK (target_scope IN ('all', 'specific', 'department', 'none')),
    priority             text CHECK (priority IN ('عادي', 'هام', 'عاجل', 'عاجل جداً', 'سري')),
    director_directive   jsonb,
    reminder             jsonb,
    -- حالة BR-03: قيد المراجعة، مكتمل (قابلة للتوسع لاحقاً عبر migration جديد).
    status               text NOT NULL DEFAULT 'قيد المراجعة' CHECK (status IN ('قيد المراجعة', 'مكتمل')),
    notes                text,
    is_read              boolean,
    read_at              timestamptz,
    is_daily_situation   boolean NOT NULL DEFAULT false,
    daily_situation_data jsonb,
    specific_details     jsonb,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    -- تاريخ الاستيراد من الأرشيف — منفصل عن تاريخ الكتاب وإنشاء السجل.
    imported_at          timestamptz
);

-- تصفية شهرية (month) وترتيب/بحث بالتاريخ (document_date).
CREATE INDEX transactions_month_idx ON transactions (month);
CREATE INDEX transactions_document_date_idx ON transactions (document_date);

CREATE TABLE transaction_employees (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id   uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    employee_id      uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    -- أدوار BR-05 المعتمدة: subject / recipient / assigned / beneficiary.
    relationship_type text CHECK (relationship_type IN ('subject', 'recipient', 'assigned', 'beneficiary')),
    notes            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    -- منع تكرار المنتسب نفسه بنفس الدور في الكتاب الواحد (رابط منطقي فريد).
    UNIQUE (transaction_id, employee_id, relationship_type)
);

-- فهرس FK المفتاح الثاني (transaction_id يغطيه فهرس UNIQUE أعلاه بادئته).
CREATE INDEX transaction_employees_employee_id_idx ON transaction_employees (employee_id);

CREATE TABLE attachments (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id   uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    name             text NOT NULL,
    type             text NOT NULL,
    -- اسم الملف الأصلي كما رُفع (يظل ثابتاً لو تغير الاسم المعروض لاحقاً).
    original_filename text NOT NULL,
    -- MIME ويبقى NULL للمرفقات المستوردة قبل اكتمال Phase 14.
    mime_type        text,
    -- الحجم وتواريخ الرفع تُحفظ كما في النموذج (نصوص عرض)؛
    -- التحليل إلى قيم رقمية/تواريخ موحدة عند Phase 14.
    file_size        text NOT NULL,
    upload_date      text NOT NULL,
    content_hash     text,
    storage_key      text,
    -- حالات OCR تُملأ في Phase 17 دون قيود قيم مخترعة الآن.
    ocr_state        text,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX attachments_transaction_id_idx ON attachments (transaction_id);

-- migrate:down
DROP TABLE attachments;
DROP TABLE transaction_employees;
DROP TABLE transactions;
