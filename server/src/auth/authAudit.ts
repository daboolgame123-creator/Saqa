/**
 * تسجيل أحداث المصادقة (Phase 11) — تكتب في `audit_logs` وحدها.
 *
 * لماذا `audit_logs` الآن (§11.4/§11.5/§11.8/§11.9 تفرض التسجيل)؟
 * - الخطة تشترط صراحةً: «كل المحاولات تسجل» (تسجيل الدخول)، «طلبات OTP
 *   تسجل»، «تسجيل الدخول والخروج في السجل»، و«كل عملية كشف للرمز تسجل
 *   Audit Log» — كلها متطلبات في §11، أي في نطاق Phase 11.
 * - `audit_logs` مُعدّ في Phase 9 (migration 0004) و`event_kind` فيه
 *   يقبل بالفعل `login` / `logout` / `otp_event` / `admin_secret_reveal`.
 * - سجل التدقيق العام لأحداث المجال (إنشاء/تعديل/أرشفة...) وView Logs
 *   ينفذه طبقة `audit/` الموحّدة (Phase 15).
 *
 * **Phase 15**: هذا الملف صار غلافاً فوق `recordAuditEvent` — نفس
 * التوقيع ونفس الاستدعاءات في `authService`، لكن الكتابة الفعلية تمرّ
 * بالطبقة الموحّدة (تنقية الأسرار + سياق + كاتب واحد للجدول)، فلا
 * يوجد مساران لكتابة سجل التدقيق.
 *
 * قاعدة أمنية: لا تُكتب هنا أي قيمة سرّية — لا الرمز السري ولا رقم OTP.
 * تُكتب `purpose` و`outcome` ومعرّفات الحساب فقط، والتنقية دفاع ثانٍ.
 */
import type { Queryable } from '../database';
import { recordAuditEvent } from '../audit';

/**
 * أنواع أحداث المصادقة المسموح بها في قيد CHECK.
 *
 * `update` مستعمل هنا لتغيير الرمز السري (تعديل بيانات اعتماد)؛ و
 * `permission_change` يبقى غير مستعمل: لا عملية تغيير صلاحية في
 * النظام — إسناد الأدوار لا تدفّق له بعد (سياسة غير محددة في الخطة)،
 * وPhase 12 تفرض الصلاحيات فقط ولا تعدّلها. فلا يُختلط تعديل الاعتماد
 * بتعديل صلاحية لا وجود له.
 */
export type AuthEventKind = 'login' | 'logout' | 'otp_event' | 'admin_secret_reveal' | 'update';

/** وصف حدث مصادقة واحد للتسجيل. */
export interface AuthEvent {
  eventKind: AuthEventKind;
  /** فاعل مُصادَق إن وُجد؛ قد يكون null في محاولة بهوية غير معروفة. */
  actorUserId?: string | null;
  actorEmployeeId?: string | null;
  /** الكيان المتأثر: الحساب المستهدَم عادةً. */
  targetUserId?: string | null;
  /** نوع الكيان في سجل التدقيق. */
  entityKind?: string;
  /** معرّف الكيان (العمود `entity_id` يقبل NULL). */
  entityId?: string | null;
  /** قيم وصفية خالية من الأسرار (purpose/outcome وما شابه). */
  details?: Record<string, unknown>;
}

/** يكتب حدث مصادقة واحدًا في `audit_logs` عبر الطبقة الموحّدة (Phase 15). */
export async function recordAuthEvent(db: Queryable, event: AuthEvent): Promise<void> {
  await recordAuditEvent(db, {
    eventKind: event.eventKind,
    actor: {
      userId: event.actorUserId ?? null,
      employeeId: event.actorEmployeeId ?? null,
      // أحداث المصادقة تسبق جلسة قائمة أو تخلو منها هنا — لا يُخترع
      // sessionId لحدث قبل إنشائه.
      sessionId: null,
    },
    entityKind: event.entityKind ?? 'user_account',
    entityId: event.entityId ?? event.targetUserId ?? null,
    newValues: event.details ?? null,
  });
}
