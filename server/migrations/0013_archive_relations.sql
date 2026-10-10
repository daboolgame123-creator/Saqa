-- ============================================================
-- Phase 20 — Migration 0013: الكتب المرتبطة (Related Books)
-- الجداول الجديدة (1): transaction_relations
-- المرجع: ALSQAYA_PLAN §36 (Related Books) و§8.1 («الكتاب المشار إليه»
-- في الوارد والصادر) و§32 (لا حذف فعلي) و§33 (Concurrency).
-- ملاحظات:
--   * **علاقة حقيقية بمفتاحين أجنبيين**: «كتاب A يشير إلى كتاب B» تعني
--     صفاً اتجاهياً من A إلى B — لا نص رابط ولا JSON بديل ولا اسم كتاب.
--     الجدول يخدم one-to-many وmany-to-many معاً: كتاب يشير إلى عدة،
--     ويُشار إليه من عدة، لأن الاتجاه محفوظ في اتجاه الصف نفسه.
--   * `relationship_type` **لم يُضف**: نصّ الخطة لا يحدد أنواعاً ولا
--     تسمية لعلاقة الكتب، والعقد adsorbed هنا TBD
--     (PHASE_20_REPORT.md §5) — لا قيمة مخترعة.
--   * `ON DELETE RESTRICT` على الطرفين اتساقاً مع Phase 16 (0009):
--     الأرشفة طوابع حالة على الصف، فلا يمحو خطأٌ واحد الروابط معاً.
--   * الحارسان أدناه **تكامل بيانات لا قاعدة أعمال مخترعة**:
--     (1) الكتاب لا يشير إلى نفسه: علاقة بلا معنى؛
--     (2) نفس الاتجاه مرّة واحدة فقط: التكرار إدخال واحد لا علاقتان.
--     أما «A يشير إلى B وB يشير إلى A» فمُتاح عمداً: العلاقة إحالة
--     أرشيفية لا شجرة تصنيف، والخريطة لم تطلب DAG (PHASE_20_REPORT.md §5).
--   * `created_by` بـ`SET NULL` كـ`audit_logs.actor_user_id`: بقاء صف
--     العلاقة (تاريخها) مضمون حتى لو حُذف الحساب.
--   * لا بيانات تجريبية هنا (البيانات الاختبارية في الاختبارات فقط).
-- ============================================================

-- migrate:up
CREATE TABLE transaction_relations (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- الطرف المُشير (A) — الكتاب الذي يفتح الإشارة.
    transaction_id         uuid NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
    -- الطرف المُشار إليه (B) — الكتاب المرجوع إليه في نصّ A.
    related_transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
    created_by             uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at             timestamptz NOT NULL DEFAULT now(),
    -- كتاب لا يشير إلى نفسه: علاقة لا معنى لها، فلا تُخزَّن أصلاً.
    CONSTRAINT transaction_relations_no_self_reference
        CHECK (transaction_id <> related_transaction_id),
    -- نفس الاتجاه مرّة واحدة: قيد فريد منطقي على الزوج نفسه.
    CONSTRAINT transaction_relations_unique_direction
        UNIQUE (transaction_id, related_transaction_id)
);

-- فهرس الطرف الثاني (المُشار إليه): قراءة «الكتب التي تشير إليه»
-- و«قائمة related_transaction_id» تبدأ منه. وطرفا الـFK مغطيان.
CREATE INDEX transaction_relations_related_transaction_id_idx
    ON transaction_relations (related_transaction_id);
CREATE INDEX transaction_relations_transaction_id_idx
    ON transaction_relations (transaction_id);

-- migrate:down
DROP TABLE transaction_relations;