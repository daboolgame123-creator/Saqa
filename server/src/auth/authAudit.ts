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
 *   يبقى Phase 15 — لا يُنفَّذ هنا.
 *
 * قاعدة أمنية: لا تُكتب هنا أي قيمة سرّية — لا الرمز السري ولا رقم OTP.
 * تُكتب `purpose` و`outcome` ومعرّفات الحساب فقط.
 */
import type { Queryable } from '../database';

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

/** يكتب حدث مصادقة واحدًا في `audit_logs`. */
export async function recordAuthEvent(db: Queryable, event: AuthEvent): Promise<void> {
  await db.query(
    `INSERT INTO audit_logs (
       event_kind, actor_user_id, actor_employee_id, entity_kind, entity_id, new_values
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      event.eventKind,
      event.actorUserId ?? null,
      event.actorEmployeeId ?? null,
      event.entityKind ?? 'user_account',
      event.entityId ?? event.targetUserId ?? null,
      event.details === undefined ? null : JSON.stringify(event.details),
    ],
  );
}
