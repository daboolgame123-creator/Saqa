/**
 * كتابة وقراءة سجل التدقيق (Phase 15 — §31).
 *
 * لماذا هنا لا في `repositories/`: سجل التدقيق طبقة مصغّرة مستقلة
 * (`audit/` في بنية §6) تكتب و تقرأ جدولاً واحداً بروابطها الخاصة،
 * لا كيان مجالاً تديره مستودعات الموارد. الترحيل 0004 هو مصدر البنية.
 *
 * الخصائص المفروضة هنا:
 * - **Server-side**: لا مسار يكتب من العميل — الكتابة من العمليات
 *   الحساسة المصادق عليها وحدها.
 * - **لا تعديل ولا حذف**: لا تُصدَّر دالة update/delete إطلاقاً، ولا
 *   مسار HTTP يعرضهما — القراوّة وحدها عبر `listAuditLogs` المحمية
 *   بـ`view_audit_logs` في طبقة الـAPI.
 * - **لا أسرار**: كل قيم old/new تمرّ عبر `redactSensitiveValues`.
 * - **فشل الكتابة يُرمى ولا يُبتلع**: سجل تدقيق فاسد لا يُستهمل بصمت
 *   (نفس سياسة `authAudit` في Phase 11).
 */
import type { Queryable } from '../database';
import { redactSensitiveValues, type AuditEvent } from './auditTypes';

/** صف سجل التدقيق كما يعود من القاعدة. */
export interface AuditLogRecord {
  id: string;
  eventKind: string;
  actorUserId: string | null;
  actorEmployeeId: string | null;
  entityKind: string | null;
  entityId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  occurredAt: string;
}

/** عمود `jsonb` كما يعيده pg بعد محلّل التواريخ — كائن أو null. */
type JsonValue = Record<string, unknown> | null;

interface AuditLogRow {
  id: string;
  event_kind: string;
  actor_user_id: string | null;
  actor_employee_id: string | null;
  entity_kind: string | null;
  entity_id: string | null;
  old_values: JsonValue;
  new_values: JsonValue;
  occurred_at: string | Date;
}

/** حد أقصى لقراءة القائمة في الاستجابة الواحدة (عرض التدقيق لا التدفق الحي). */
export const AUDIT_LIST_LIMIT = 100;

/**
 * يكتب حدثاً واحداً في `audit_logs`.
 *
 * سياق الجلسة (`actor.sessionId`) يُخزَّن داخل `new_values.context`
 * لأن الجدول لا عمود له — والبنية jsonb تكفي للتدقيق (§9.2 «بيانات
 * الجلسة اللازمة للتدقيق عند الحاجة»). إن كانت القيم تحمل مفتاحاً
 * حساساً يُستبدل بـ`[REDACTED]` قبل التحويل إلى jsonb.
 */
export async function recordAuditEvent(db: Queryable, event: AuditEvent): Promise<void> {
  const { actor } = event;
  // سياق الجلسة يُدمج مع قيم العملية؛ وبلا قيم وبلا سياق يبقى العمود
  // NULL كما في سلوك Phase 11 (لا كائن فارغ يوحي ببيانات مفقودة).
  const context = actor.sessionId ?? null;
  const hasValues = event.newValues !== null && event.newValues !== undefined;
  const newValues =
    !hasValues && context === null
      ? null
      : redactSensitiveValues(
          context === null
            ? (event.newValues ?? {})
            : { ...(event.newValues ?? {}), context: { sessionId: context } },
        );
  const oldValues = redactSensitiveValues(event.oldValues ?? undefined);

  await db.query(
    `INSERT INTO audit_logs (
       event_kind, actor_user_id, actor_employee_id,
       entity_kind, entity_id, old_values, new_values
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      event.eventKind,
      actor.userId,
      actor.employeeId ?? null,
      event.entityKind ?? null,
      event.entityId ?? null,
      oldValues === null ? null : JSON.stringify(oldValues),
      newValues === null ? null : JSON.stringify(newValues),
    ],
  );
}

/**
 * يقرأ آخر الأحداث مرتّبة تنازلياً — القراءة فقط.
 *
 * `LIMIT` ثابت (لا قيمة من العميل) حتى لا تصبح القراءة مسار تزوير
 * أو استخراج غير محدود؛ التصفية التفصيلية قرار عرض لاحق لا تغيير
 * في فرض الصلاحية.
 */
export async function listAuditLogs(db: Queryable): Promise<AuditLogRecord[]> {
  const result = await db.query<AuditLogRow>(
    `SELECT id, event_kind, actor_user_id, actor_employee_id,
            entity_kind, entity_id, old_values, new_values, occurred_at
       FROM audit_logs
      ORDER BY occurred_at DESC, id DESC
      LIMIT $1`,
    [AUDIT_LIST_LIMIT],
  );
  return result.rows.map(toAuditLogRecord);
}

/** تحويل صف القاعدة إلى سجل بتواريخ ISO نصية. */
function toAuditLogRecord(row: AuditLogRow): AuditLogRecord {
  return {
    id: row.id,
    eventKind: row.event_kind,
    actorUserId: row.actor_user_id,
    actorEmployeeId: row.actor_employee_id,
    entityKind: row.entity_kind,
    entityId: row.entity_id,
    oldValues: row.old_values,
    newValues: row.new_values,
    occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : row.occurred_at,
  };
}
