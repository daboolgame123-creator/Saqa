/**
 * أنواع سجل التدقيق (Phase 15 — §31) — الطبقة المستقلة عن سجل الاطلاع.
 *
 * المصادر:
 * - `ALSQAYA_PLAN.md` §7.15 (AuditLog: سجل إداري/أمني للأفعال الحساسة)
 *   و§31 (الأحداث المعتمدة وسياسة old/new والأسرار).
 * - قيد CHECK في `audit_logs` (ترحيل 0004) هو مرجع قيم `eventKind` —
 *   القائمة أدناه **مرآة له حرفياً**، وحارس في `tests/audit.test.ts`
 *   يقارن الاثنين فلا يتباعد تعريفٌ عن الآخر.
 *
 * قواعد هذا الملف:
 * - **لا أسرار**: `redactSensitiveValues` يُمرَّر على كل قيم old/new قبل
 *   الكتابة (دفاعاً في العمق): لا كلمة مرور ولا OTP ولا رمز ولا تجزئة
 *   تصل إلى القاعدة، ولو مرّرتها مُستدعاً عن سهو (§31: «لا تُخزَّن
 *   الأسرار نفسها»). يُسجَّل اسم الحدث بدل محتوى السر.
 * - **بنية منظمة لا نص**: القيم كائنات تُحوَّل إلى jsonb — قابلة
 *   للاستعلام والفلترة، لا سلاسل غير قابلة للمعالجة.
 * - الفاعل من هوية الجلسة المصادق عليها على الخادم — لا من جسم الطلب.
 */

/** قيم `event_kind` المعتمدة في §31 — مرآة لقيد CHECK في ترحيل 0004. */
export const AUDIT_EVENT_KINDS = [
  'create',
  'update',
  'archive',
  'delete',
  'status_change',
  'permission_change',
  'login',
  'logout',
  'otp_event',
  'sensitive_file_access',
  'admin_secret_reveal',
  'backup_restore',
] as const;

export type AuditEventKind = (typeof AUDIT_EVENT_KINDS)[number];

/**
 * الفاعل كما يُقرأ من هوية الجلسة على الخادم (`AuthenticatedIdentity`).
 * `sessionId` سياق جلسة اختياري — يُخزَّن داخل `new_values.context` لا
 * كعمود مستقل (الجدول لا عمود له، والبنية jsonb كافية للتدقيق §9.2).
 */
export interface AuditActor {
  userId: string | null;
  employeeId: string | null;
  sessionId?: string | null;
}

/** حدث تدقيق واحد للكتابة في `audit_logs`. */
export interface AuditEvent {
  eventKind: AuditEventKind;
  actor: AuditActor;
  /** نوع الكيان المتأثر (اسم مستقر): `employee` · `attachment` · `transaction_availability` · `user_account`… */
  entityKind?: string;
  /** معرّف الكيان (uuid) — العمود يقبل NULL. */
  entityId?: string | null;
  /** قيم قبل التعديل — للعمليات التي تتطلب old/new (§31). */
  oldValues?: Record<string, unknown> | null;
  /** قيم بعد التعديل/سياق العملية — تمرّ عبر تنقية الأسرار. */
  newValues?: Record<string, unknown> | null;
}

/**
 * مفاتيح لا يجوز أن تصل قيمها إلى السجل.
 *
 * مطابقة جزئية (substring) لالتقاط الاشتقاقات الشائعة (`otpCode`,
 * `sessionToken`, `passwordHash`) مع تطابق تام لـ`code`/`pin` حتى لا
 * تبتلع مفاتيح بريئة مثل `badgeNumber` أو `pinned`.
 */
const SENSITIVE_KEY_SUBSTRING = /(password|secret|otp|token|hash|credential|passphrase)/i;
const SENSITIVE_KEY_EXACT = new Set(['code', 'pin', 'pass']);

/** القيمة البديلة في السجل — إشارة صريحة لا سرّ مُعمّى. */
export const REDACTED = '[REDACTED]';

/** هل المفتاح حساس؟ */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_SUBSTRING.test(key) || SENSITIVE_KEY_EXACT.has(key.toLowerCase());
}

/**
 * ينقي القيم الحساسة من كائن (أو مصفوفة) إنشاءً عن جديد — لا يُعدَّل
 * الأصل، ويغوص داخل المتداخل. القيم غير الكئيبية (نص/رقم/منطقي/null)
 * تبقى كما هي إلا إذا كان مفتاحها حساساً.
 */
export function redactSensitiveValues(
  values: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (values === null || values === undefined) {
    return null;
  }
  return redactNode(values) as Record<string, unknown>;
}

/** مساعدة داخلية: تنقية عقدة واحدة (كائن/مصفوفة/قيمة). */
function redactNode(value: unknown, key?: string): unknown {
  if (key !== undefined && isSensitiveKey(key)) {
    return REDACTED;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactNode(item));
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      result[childKey] = redactNode(childValue, childKey);
    }
    return result;
  }
  return value;
}
