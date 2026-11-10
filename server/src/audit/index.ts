/**
 * طبقة `audit` (Phase 15 — §31) — سجل التدقيق وسجل الاطلاع معاً
 * تحت سقف البنية المعتمدة في §6 (`audit`: Audit Log وView Log)،
 * وبفصل تام بينهما:
 *
 * - `auditLog.ts` / `auditTypes.ts`: سجل تدقيق خادمي للأحداث الحساسة —
 *   كتابة من العمليات، وقراءة عبر `view_audit_logs` فقط.
 * - `viewLog.ts`: الاعتراف الرسمي بـ«اطلعت» — مستقل، idempotent،
 *   ولا يعنيه فتح الصفحة ولا التنزيل.
 *
 * لا تُصدَّر من هنا دوال تعديل أو حذف لأي من السجلين.
 */
export {
  AUDIT_LIST_LIMIT,
  listAuditLogs,
  recordAuditEvent,
  type AuditLogRecord,
} from './auditLog';
export {
  AUDIT_EVENT_KINDS,
  REDACTED,
  isSensitiveKey,
  redactSensitiveValues,
  type AuditActor,
  type AuditEvent,
  type AuditEventKind,
} from './auditTypes';
export { acknowledgeView, type AcknowledgeInput, type ViewLogRecord } from './viewLog';
