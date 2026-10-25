/**
 * سجل الاطلاع الرسمي / Acknowledgement (Phase 15 — §9.1/§9.2 و§31).
 *
 * هذا الملف **مستقل عن `auditLog.ts`**: جدول آخر، معنى آخر، وقاعدة
 * أخرى. الفصل الذي تفرضه §31 حرفياً:
 * - **فتح الصفحة** ليس اطلاعياً (لا يكتب هذا الجدول).
 * - **تنزيل المرفق** حدث وصول حساس في `audit_logs` — لا يكتب هذا الجدول.
 * - **«اطلعت»** وحده هو الحدث الرسمي: ضغطة صريحة تُختم بـ`acknowledged_at`.
 *
 * الـidempotent مفروض في **القاعدة** لا في الطلب: قيد فريد
 * `view_logs_transaction_user_key (transaction_id, user_id)` من ترحيل
 * 0008، و`ON CONFLICT … DO UPDATE` لا يمسّ الختم القائم أبداً — تكرار
 * الضغطة يُعيد الحالة نفسها ب TIMESTAMPها الأول ولا ينشئ صفّاً ثانياً.
 *
 * لا حذف ولا تعديل من هذا الطبقة: لا تُصدَّر دالة حذف، والاستخدام
 * العادي لا يمسّ السجل (§9.2 «سجل الاطلاع الرسمي لا يحذف»).
 */
import type { Queryable } from '../database';

/** صف سجل الاطلاع كما يعود من القاعدة. */
export interface ViewLogRecord {
  id: string;
  transactionId: string;
  userId: string | null;
  employeeId: string | null;
  viewedAt: string;
  acknowledgedAt: string | null;
  sessionRef: string | null;
}

/** مدخل الاعتراف — الفاعل من الجلسة لا من العميل. */
export interface AcknowledgeInput {
  transactionId: string;
  userId: string;
  employeeId: string | null;
  /** مرجع الجلسة (§9.2) — يُخزَّن ولا يُفصح في DTO العرض. */
  sessionRef: string | null;
}

interface ViewLogRow {
  id: string;
  transaction_id: string;
  user_id: string | null;
  employee_id: string | null;
  viewed_at: string | Date;
  acknowledged_at: string | Date | null;
  session_ref: string | null;
}

const VIEW_LOG_COLUMNS = `
  id, transaction_id, user_id, employee_id,
  viewed_at, acknowledged_at, session_ref
`;

/** تحويل صف القاعدة إلى سجل بتواريخ ISO نصية. */
function toViewLogRecord(row: ViewLogRow): ViewLogRecord {
  const iso = (value: string | Date | null): string | null =>
    value === null ? null : value instanceof Date ? value.toISOString() : value;
  return {
    id: row.id,
    transactionId: row.transaction_id,
    userId: row.user_id,
    employeeId: row.employee_id,
    viewedAt: iso(row.viewed_at) as string,
    acknowledgedAt: iso(row.acknowledged_at),
    sessionRef: row.session_ref,
  };
}

/**
 * يختم الاطلاع الرسمي لـ(كتاب، مستخدم) — idempotent.
 *
 * أول استدعاء: ينشئ الصف بـ`viewed_at` و`acknowledged_at` معاً.
 * أي استدعاء لاحق: `ON CONFLICT` يُبقي `acknowledged_at` الأول
 * (`COALESCE` مع الموجود لا مع المستبعد) ولا ينشئ حالة جديدة زائفة.
 * `employee_id` يُملأ فقط إن كان مفقوداً (حساب يرتبط لاحقاً بمنتسب).
 */
export async function acknowledgeView(
  db: Queryable,
  input: AcknowledgeInput,
): Promise<ViewLogRecord> {
  const result = await db.query<ViewLogRow>(
    `INSERT INTO view_logs (
       transaction_id, user_id, employee_id, viewed_at, acknowledged_at, session_ref
     ) VALUES ($1, $2, $3, now(), now(), $4)
     ON CONFLICT (transaction_id, user_id)
     DO UPDATE SET
       employee_id      = COALESCE(view_logs.employee_id, EXCLUDED.employee_id),
       acknowledged_at  = COALESCE(view_logs.acknowledged_at, EXCLUDED.acknowledged_at),
       session_ref      = COALESCE(view_logs.session_ref, EXCLUDED.session_ref)
     RETURNING ${VIEW_LOG_COLUMNS}`,
    [input.transactionId, input.userId, input.employeeId, input.sessionRef],
  );
  const row = result.rows[0];
  if (row === undefined) {
    // مستحيل عملياً مع ON CONFLICT RETURNING — لكن الصمت هنا يعني
    // اعترافاً بلا سجل، وهو بالضبط ما تمنعه §9.2.
    throw new Error('فشل حفظ سجل الاطلاع: لم يُعد صف بعد الختم.');
  }
  return toViewLogRecord(row);
}
