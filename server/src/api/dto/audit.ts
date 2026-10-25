/**
 * DTOs سجل التدقيق وسجل الاطلاع (Phase 15 — §31 و§9.2).
 *
 * - `AuditLogDto`: قراءة السجل عبر مسار `view_audit_logs` وحده.
 *   القيم تعود كما هي (jsonb) — لا نص مُجمَّع ولا حقل يُستنتج في العميل.
 * - `AcknowledgementDto`: نتيجة «اطلعت» وحدها. `sessionRef` (§9.2)
 *   **لا يظهر** هنا: بيان جلسة داخلي للتدقيق لا للعرض، ومن يقرأ DTO
 *   لا يحتاجه.
 */
import type { AuditLogRecord } from '../../audit';
import type { ViewLogRecord } from '../../audit';

/** سجل تدقيق واحد كما يُقرأ من مسار العرض. */
export interface AuditLogDto {
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

/** ختم الاطلاع الرسمي لـ(كتاب، مستخدم). */
export interface AcknowledgementDto {
  id: string;
  transactionId: string;
  userId: string | null;
  employeeId: string | null;
  viewedAt: string;
  acknowledgedAt: string | null;
}

/** تحويل سجل القاعدة إلى DTO قراءة — بلا اشتقاق ولا افتراض. */
export function toAuditLogDto(record: AuditLogRecord): AuditLogDto {
  return {
    id: record.id,
    eventKind: record.eventKind,
    actorUserId: record.actorUserId,
    actorEmployeeId: record.actorEmployeeId,
    entityKind: record.entityKind,
    entityId: record.entityId,
    oldValues: record.oldValues,
    newValues: record.newValues,
    occurredAt: record.occurredAt,
  };
}

/** تحويل سجل الاطلاع إلى DTO — بلا كشف `sessionRef`. */
export function toAcknowledgementDto(record: ViewLogRecord): AcknowledgementDto {
  return {
    id: record.id,
    transactionId: record.transactionId,
    userId: record.userId,
    employeeId: record.employeeId,
    viewedAt: record.viewedAt,
    acknowledgedAt: record.acknowledgedAt,
  };
}
