-- ============================================================
-- Phase 14 — Migration 0007: التخزين المركزي للمرفقات (Attachment metadata)
-- الأعمدة الجديدة على جدول `attachments` القائم (لا جداول جديدة).
-- المرجع: ALSQAYA_PLAN §7.7 (Attachment كيان metadata مستقل) و§30 (Phase 14).
--
-- ملاحظات (مهمة — هذه إضافة فقط، بلا تدمير):
--   * `attachments` أُنشئت في Phase 9/10 ببيانات وصفية فقط (بلا بايتات وبلا
--     Base64). هنا يُكمل سجل الـmetadata الذي تشترطه §30: الحجم الحقيقي،
--     تاريخ الإنشاء، وحالة السلامة. الصفوف القائمة تبقى صالحة: الأعمدة
--     الجديدة nullable، ولا يُعاد كتابة أي صف قديم.
--   * `file_size` و`upload_date` (نص عرض) **لا تُحذف ولا تُكتب فوقها**:
--     قيمهما القائمة نصوص عرض («1.2 MB») لا أرقام، وتحويلها إلى أرقام يعني
--     كتابة فوق بيانات قائمة — وهو ترحيل تدميري. لذلك الأعمدة الجديدة
--     `size_bytes` و`created_date` هي المصدر الرقمي الجديد، وتبقى
--     `file_size`/`upload_date` متاحة للعرض المتوافق.
--   * `ocr_state` يبقى بلا قيم: §30 تذكر وجود حقل OCR status فقط، والقيم
--     منصوص عليها في Phase 17، فلا تُخترع هنا.
--   * `storage_key` هو مسار التخزين المركزي الجديد. لا يُشتق من اسم الملف
--     الأصلي (القاعدة 5/§30): يُشتق من stable ID، ويبقى الاسم الأصلي محفوظاً
--     في `original_filename` كما هو.
--   * لا بايتات ولا Base64 في أي عمود: الملف المادي على القرص خارج PostgreSQL
--     (§30 «التخزين» وRule 5).
--   * لا بيانات تجريبية هنا.
-- ============================================================

-- migrate:up

-- الحجم الحقيقي بالبايت (§30 metadata · size). NULL للصفوف القديمة التي
-- لم تُقَس بعد، وهي ليست صفراً: الصفر ملف فارغ، وNULL «غير مقيس».
ALTER TABLE attachments ADD COLUMN size_bytes bigint;

-- تاريخ إنشاء المرفق (§30 metadata · created date) كنوع تاريخ نظيف،
-- مستقل عن `created_at` (ختم نظام timestamptz يُملأ عند INSERT).
ALTER TABLE attachments ADD COLUMN created_date date;

-- حالة سلامة الملف (§30 metadata · integrity state).
-- القيم المستخدمة في Phase 14 مشتقّة من متطلبات الاختبارات (§30) وحدها:
--   'verified' — قُرئ الملف بعد الحفظ وتطابق hash المحسوب مع المحفوظ.
--   'corrupted' — الملف على القرص لا يطابق hash المحفوظ (تلف أو استبدال).
--   'missing'   — storage_key موجود في القاعدة والملف غير موجود على القرص.
-- أي قيمة أخرى تبقى NULL (= لم تُفحص بعد). لا قيم مخترعة خارج هذه.
ALTER TABLE attachments ADD COLUMN integrity_state text;

-- قيد القيم: يمنع قيمة خارج المعنى أعلاه، ويسمح بـNULL (لم يُفحص).
ALTER TABLE attachments ADD CONSTRAINT attachments_integrity_state_check
    CHECK (integrity_state IS NULL OR integrity_state IN ('verified', 'corrupted', 'missing'));

-- مفتاح التخزين فريد: لا ملفان يتشاركان مفتاحاً واحداً، ولكل مرفق مفتاح
-- مستقل عن اسمه الأصلي. الفهرس يخدم أيضاً البحث بالمفتاح عند التحميل.
CREATE UNIQUE INDEX attachments_storage_key_unique ON attachments (storage_key);

-- قراءة مرفقات كتاب واحد (فهرس معرّف الكتاب يخدمه) وتحميل بالـid.
-- الفهرس `attachments_transaction_id_idx` من Phase 9 يخدم هذا الاستعلام،
-- فلا يُكرر هنا.

-- migrate:down
DROP INDEX attachments_storage_key_unique;
ALTER TABLE attachments DROP CONSTRAINT attachments_integrity_state_check;
ALTER TABLE attachments DROP COLUMN integrity_state;
ALTER TABLE attachments DROP COLUMN created_date;
ALTER TABLE attachments DROP COLUMN size_bytes;
