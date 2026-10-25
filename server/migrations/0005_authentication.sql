-- ============================================================
-- Phase 11 — Migration 0005: المصادقة والحسابات والجلسات
-- الجداول الجديدة (3): auth_sessions, auth_otp_codes, auth_otp_rate_limits
-- الأعمدة المضافة على users: حالة الحساب (§11.3) والسر المشفّر (§11.8)
-- ومحاولات الدخول والتجميد (§11.4).
-- المرجع: ALSQAYA_PLAN §11 و§27 (Phase 11).
-- ملاحظات:
--   * حالة الحساب المعتمدة هي users.status بالقيم الأربع في §11.3
--     (غير مفعّل/نشط/مجمّد/محظور). عمود users.is_active موروث من
--     Phase 9 ولا يقرأه أي كود في المشروع، ولم يُحذف تفادياً لتغيير
--     مخطط مُطبَّق — Phase 11 لا يعتمد عليه ولا يُحدّثه.
--   * السر يُخزَّن مشفّراً فقط (AES-256-GCM) لأن §11.8 تجيز لمسؤولي
--     السقاية رؤية الرمز الحالي. مفتاح التشفير يبقى خارج القاعدة
--     (متغير بيئة AUTH_SECRET_KEY) ولا يُخزَّن في أي جدول.
--   * رموز الجلسات والأرقام السرية (OTP) تُخزَّن مُجزّأةً بـSHA-256
--     لا نصاً صريحاً؛ والسر وحده قابل للفك لأنه مشفّر لا مجزّأ.
--   * الجلسات المتزامنة مسموحة (§11.9): لا قيد تفرد على user_id.
--   * لا بيانات تجريبية داخل الـSQL (البيانات الاختبارية في الاختبارات فقط).
-- ============================================================

-- migrate:up

-- ── حالة الحساب وبيانات السر على users ───────────────────────────────
-- لا تغيير على الأعمدة الموروثة: لا يُحذف عمود ولا يُعاد تسمية عمود.
ALTER TABLE users
    ADD COLUMN status               text NOT NULL DEFAULT 'inactive'
        CHECK (status IN ('inactive', 'active', 'frozen', 'blocked')),
    ADD COLUMN secret_ciphertext    text,
    ADD COLUMN secret_iv            text,
    ADD COLUMN secret_auth_tag      text,
    ADD COLUMN secret_key_id        text,
    ADD COLUMN must_change_secret   boolean NOT NULL DEFAULT false,
    ADD COLUMN failed_login_attempts integer NOT NULL DEFAULT 0,
    ADD COLUMN frozen_until         timestamptz,
    ADD COLUMN activated_at         timestamptz;

-- حساب نشط يجب أن يحمل سراً مشفّراً، وحساب بلا سر لا يكون نشطاً.
ALTER TABLE users
    ADD CONSTRAINT users_active_requires_secret
    CHECK (status <> 'active' OR secret_ciphertext IS NOT NULL);

ALTER TABLE users
    ADD CONSTRAINT users_secret_fields_together
    CHECK ((secret_ciphertext IS NULL) = (secret_iv IS NULL)
       AND (secret_ciphertext IS NULL) = (secret_auth_tag IS NULL));

-- التجميد المؤقت (§11.4) له تاريخ انتهاء؛ الحظر (§11.3) لا تاريخ له.
ALTER TABLE users
    ADD CONSTRAINT users_frozen_has_expiry
    CHECK (status <> 'frozen' OR frozen_until IS NOT NULL);

CREATE INDEX users_status_idx ON users (status);

-- ── الجلسات (§11.9) ──────────────────────────────────────────────────
-- token_hash هو تجزئة SHA-256 للرمز المرسل للعميل؛ الرمز نفسه لا يُخزَّن.
-- last_activity_at هو مؤقّت الخمول (30 دقيقة) ويعيد ضبطه بكل نشاط.
CREATE TABLE auth_sessions (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash       text NOT NULL UNIQUE,
    created_at       timestamptz NOT NULL DEFAULT now(),
    last_activity_at timestamptz NOT NULL DEFAULT now(),
    revoked_at       timestamptz,
    revoke_reason    text
);

-- الجلسات المتزامنة عبر أجهزة متعددة مسموحة، فلا قيد تفرد على user_id.
CREATE INDEX auth_sessions_user_id_idx ON auth_sessions (user_id);
CREATE INDEX auth_sessions_last_activity_idx ON auth_sessions (last_activity_at);

-- ── الأرقام السرية OTP (§11.5) ────────────────────────────────────────
-- user_id يقبل NULL: طلب OTP يجب ألا يكشف وجود الحساب من عدمه،
-- فسجل الطلب يُنشأ حتى حين لا يوجد حساب مطابق.
-- phone هو الهدف الفعلي المرسل إليه الرمز (مصدر عدّ حد الطلبات §11.5).
CREATE TABLE auth_otp_codes (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- هدف الرمز. `user_id` يقبل NULL: طلب OTP يجب ألا يكشف وجود الحساب
    -- من عدمه، فسجل الطلب يُنشأ حتى حين لا يوجد حساب مطابق (تسجيل جديد).
    -- `employee_id` يحمل الموظف المطابق لرقم الباج + الهاتف وقت الطلب،
    -- فيبقى التحقق لاحقاً غير ملتبس عند تشارك أكثر من موظف في الهاتف.
    user_id       uuid REFERENCES users(id) ON DELETE CASCADE,
    employee_id   uuid REFERENCES employees(id) ON DELETE CASCADE,
    phone         text NOT NULL,
    purpose       text NOT NULL CHECK (purpose IN ('registration', 'recovery')),
    code_hash     text NOT NULL,
    attempts      integer NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    expires_at    timestamptz NOT NULL,
    consumed_at   timestamptz,
    invalidated_at timestamptz
);

-- يُستخدم لعدّ طلبات OTP داخل نافذة 15 دقيقة ولبحث أحدث رمز للهاتف.
CREATE INDEX auth_otp_phone_created_idx ON auth_otp_codes (phone, created_at DESC);
CREATE INDEX auth_otp_user_id_idx ON auth_otp_codes (user_id);
CREATE INDEX auth_otp_employee_id_idx ON auth_otp_codes (employee_id);

-- ── حظر طلبات OTP (§11.5) ────────────────────────────────────────────
-- تجاوز 5 طلبات لكل هاتف خلال 15 دقيقة ⇒ حظر طلبات OTP لهذا الهاتف
-- 15 دقيقة كاملة. الجدول يحمل مدة الحظر الصريحة لأن العدّ وحده لا
-- يصف «مدة الحظر» التي تبدأ بلحظة تجاوز الحد.
CREATE TABLE auth_otp_rate_limits (
    phone         text PRIMARY KEY,
    blocked_until timestamptz NOT NULL,
    blocked_at    timestamptz NOT NULL DEFAULT now()
);

-- migrate:down
DROP TABLE auth_otp_rate_limits;
DROP TABLE auth_otp_codes;
DROP TABLE auth_sessions;
DROP INDEX users_status_idx;
ALTER TABLE users
    DROP CONSTRAINT users_frozen_has_expiry,
    DROP CONSTRAINT users_secret_fields_together,
    DROP CONSTRAINT users_active_requires_secret,
    DROP COLUMN activated_at,
    DROP COLUMN frozen_until,
    DROP COLUMN failed_login_attempts,
    DROP COLUMN must_change_secret,
    DROP COLUMN secret_key_id,
    DROP COLUMN secret_auth_tag,
    DROP COLUMN secret_iv,
    DROP COLUMN secret_ciphertext,
    DROP COLUMN status;