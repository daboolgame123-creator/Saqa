/**
 * أنواع وثوابت طبقة المصادقة (Phase 11).
 *
 * كل القيم هنا منقولة حرفياً من `ALSQAYA_PLAN.md` §11 (قواعد الحسابات)
 * و§27 (نطاق Phase 11) — لا قيمة هنا مخترعة.
 *
 * القاعدة: منطق الأعمال كله فوق هذه الثوابت، فلا رقم سحري في الخدمات.
 */

/** حالة الحساب — القيم الأربع المعتمدة في §11.3. */
export type AccountStatus = 'inactive' | 'active' | 'frozen' | 'blocked';

/** الغرض من الرمز السري OTP — تدفّقان معتمدان فقط (§11.1 و§11.6). */
export type OtpPurpose = 'registration' | 'recovery';

/** القيم المسموحة لحالة الحساب (مطابقة قيد CHECK في migration 0005). */
export const ACCOUNT_STATUS_VALUES: readonly AccountStatus[] = [
  'inactive',
  'active',
  'frozen',
  'blocked',
];

/** القيم المسموحة لغرض الرمز السري. */
export const OTP_PURPOSE_VALUES: readonly OtpPurpose[] = ['registration', 'recovery'];

// ── §11.5: قواعد الرمز السري OTP ─────────────────────────────────────

/** 6 أرقام. */
export const OTP_LENGTH = 6;

/** صالح 5 دقائق. */
export const OTP_TTL_MINUTES = 5;

/** 5 طلبات كحد أقصى لكل حساب/هاتف. */
export const OTP_MAX_REQUESTS = 5;

/** خلال 15 دقيقة. */
export const OTP_RATE_WINDOW_MINUTES = 15;

/** تجاوز الحد يؤدي إلى حظر طلبات OTP لمدة 15 دقيقة. */
export const OTP_RATE_BLOCK_MINUTES = 15;

/** 5 محاولات OTP خاطئة تبطل الرمز الحالي. */
export const OTP_MAX_FAILED_ATTEMPTS = 5;

// ── §11.4: قواعد محاولات الدخول ─────────────────────────────────────

/** المحاولة 4: تأخير 5 ثوانٍ. */
export const LOGIN_DELAY_AT_ATTEMPT = 4;

/** مدّة التأخير بالمللي ثانية. */
export const LOGIN_DELAY_MS = 5000;

/** المحاولة 5: تجميد 15 دقيقة. */
export const LOGIN_FREEZE_AT_ATTEMPT = 5;

/** مدّة التجميد بالمللي ثانية. */
export const LOGIN_FREEZE_MINUTES = 15;

// ── §11.9: قواعد الجلسات ────────────────────────────────────────────

/** مهلة خمول 30 دقيقة. */
export const SESSION_IDLE_MINUTES = 30;

/** مهلة الخمول بالمللي ثانية. */
export const SESSION_IDLE_MS = SESSION_IDLE_MINUTES * 60 * 1000;

/**
 * اسم كوكي الجلسة. التوثيق هنا هو آلية الـsession المعتمدة في §27
 * («session ID آمن أو آلية token/session موثّقة»).
 */
export const SESSION_COOKIE_NAME = 'alsqaya_session';

/**
 * الحد الأدنى وطول الرمز السري عند الإنشاء أو التغيير.
 *
 * ملاحظة: الطول في §11 غير محدد، فهذه **قرارة تقنية** (شكل المدخل وحدوده)
 * لا قاعدة أعمال: تُرفض القيم الفارغة أو الأطول من الحد. لا تُطبَّق أي
 * سياسة قوة أو تعقيد على المحتوى — فهي غير معتمدة في الخطة.
 */
export const SECRET_MIN_LENGTH = 8;
export const SECRET_MAX_LENGTH = 128;

/** سجل حساب كما يُخزَّن في `users` (Phase 11). */
export interface AccountRecord {
  id: string;
  employeeId: string | null;
  username: string;
  displayName: string;
  role: string;
  status: AccountStatus;
  secretCiphertext: string | null;
  secretIv: string | null;
  secretAuthTag: string | null;
  secretKeyId: string | null;
  mustChangeSecret: boolean;
  failedLoginAttempts: number;
  frozenUntil: string | null;
  activatedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

/** جلسة كما تُخزَّن في `auth_sessions`. */
export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  lastActivityAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

/** رمز سري OTP كما يُخزَّن في `auth_otp_codes`. */
export interface OtpRecord {
  id: string;
  /** null أثناء التسجيل: لا حساب بعد، والطلب يجب ألا يكشف ذلك. */
  userId: string | null;
  /** الموظف المطابق وقت الطلب — يجعل التحقق غير ملتبس. */
  employeeId: string | null;
  phone: string;
  purpose: OtpPurpose;
  codeHash: string;
  attempts: number;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  invalidatedAt: string | null;
}

/** الهوية المثبَّتة على الطلب بعد نجاح التحقق من الجلسة. */
export interface AuthenticatedIdentity {
  userId: string;
  employeeId: string | null;
  sessionId: string;
  username: string;
  displayName: string;
  role: string;
  mustChangeSecret: boolean;
}

/** أسباب إبطال الجلسات — تُخزَّن في `revoke_reason` للمراجعة فقط. */
export const SESSION_REVOKE_REASONS = {
  logout: 'logout',
  freeze: 'account_frozen',
  block: 'account_blocked',
  idle: 'idle_timeout',
  adminReset: 'admin_secret_reset',
  ownSecretChange: 'own_secret_change',
} as const;

export type SessionRevokeReason = (typeof SESSION_REVOKE_REASONS)[keyof typeof SESSION_REVOKE_REASONS];