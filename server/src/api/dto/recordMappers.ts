/**
 * تحويل سجلات المستودعات ← DTOs (Phase 10) — الاتجاه للقراءة.
 *
 * هذا هو الجسر الوحيد بين `repositories` وطبقة الـAPI في اتجاه القراءة. كل دالة:
 * - لا تنطق قواعد أعمال ولا تتحقق (التحقق في `api/validation`).
 * - تحافظ على القيم كما هي: الاختياري يبقى اختيارياً (لا fabrication).
 * - الاتجاه المعاكس (DTO ← repository input) في `inputMappers.ts`.
 */
import type {
  EmployeeRecord,
  EmployeeStatusHistoryRecord,
  TimePermissionRecord,
  TransactionRecord,
} from '../../repositories/contracts';
import type { TransactionEmployee } from '../../../../src/core/models/transactionEmployee';
import type {
  AttachmentDto,
  EmployeeDto,
  EmployeeStatusHistoryDto,
  EmployeeTimePermissionDto,
  TransactionDto,
  TransactionEmployeeDto,
} from '../dto';

/** مرفق الكتاب: نفس حقول DTO بلا حذف (بيانات وصفية فقط). */
function toAttachmentDto(attachment: TransactionRecord['attachments'][number]): AttachmentDto {
  return {
    id: attachment.id,
    name: attachment.name,
    type: String(attachment.type),
    fileSize: attachment.fileSize,
    uploadDate: attachment.uploadDate,
  };
}

/** سجل الموظف من المستودع إلى DTO — تطابق حرفي بلا اشتقاق. */
export function toEmployeeDto(record: EmployeeRecord): EmployeeDto {
  return {
    id: record.id,
    name: record.name,
    title: record.title,
    department: record.department,
    ...(record.badgeNumber !== undefined && { badgeNumber: record.badgeNumber }),
    ...(record.joinedDate !== undefined && { joinedDate: record.joinedDate }),
    ...(record.category !== undefined && { category: record.category }),
    ...(record.academicDegree !== undefined && { academicDegree: record.academicDegree }),
    ...(record.specialization !== undefined && { specialization: record.specialization }),
    status: record.status,
    ...(record.phone !== undefined && { phone: record.phone }),
    ...(record.photo !== undefined && { photo: record.photo }),
    ...(record.userId !== undefined && { userId: record.userId }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** سجل تغيير حالة الموظف إلى DTO. */
export function toEmployeeStatusHistoryDto(
  record: EmployeeStatusHistoryRecord,
): EmployeeStatusHistoryDto {
  return {
    id: record.id,
    employeeId: record.employeeId,
    status: record.status,
    serviceEndReason: record.serviceEndReason,
    notes: record.notes,
    changedAt: record.changedAt,
  };
}

/** الكتاب من المستودع إلى DTO. month وemployeeIds يأتيان من القاعدة. */
export function toTransactionDto(record: TransactionRecord): TransactionDto {
  return {
    id: record.id,
    number: record.number,
    sequence: record.sequence,
    date: record.date,
    month: record.month,
    direction: record.direction,
    category: record.category,
    subType: record.subType,
    entity: record.entity,
    subject: record.subject,
    ...(record.addressedTo !== undefined && { addressedTo: record.addressedTo }),
    ...(record.content !== undefined && { content: record.content }),
    employeeIds: record.employeeIds ?? [],
    ...(record.employeeName !== undefined && { employeeName: record.employeeName }),
    ...(record.visibility !== undefined && { visibility: record.visibility }),
    ...(record.targetScope !== undefined && { targetScope: record.targetScope }),
    ...(record.priority !== undefined && { priority: record.priority }),
    ...(record.directorDirective !== undefined && { directorDirective: record.directorDirective }),
    ...(record.reminder !== undefined && { reminder: record.reminder }),
    status: record.status,
    ...(record.notes !== undefined && { notes: record.notes }),
    attachments: (record.attachments ?? []).map(toAttachmentDto),
    ...(record.isRead !== undefined && { isRead: record.isRead }),
    ...(record.readAt !== undefined && { readAt: record.readAt }),
    ...(record.isDailySituation !== undefined && { isDailySituation: record.isDailySituation }),
    ...(record.dailySituationData !== undefined && {
      dailySituationData: record.dailySituationData,
    }),
    ...(record.specificDetails !== undefined && { specificDetails: record.specificDetails }),
    ...(record.createdAt !== undefined && { createdAt: record.createdAt }),
    updatedAt: record.updatedAt,
    importedAt: record.importedAt,
  };
}

/** سجل رابط الكتاب بالمنتسب إلى DTO. */
export function toTransactionEmployeeDto(record: TransactionEmployee): TransactionEmployeeDto {
  return {
    id: record.id,
    transactionId: record.transactionId,
    employeeId: record.employeeId,
    ...(record.relationshipType !== undefined && { relationshipType: record.relationshipType }),
    ...(record.notes !== undefined && { notes: record.notes }),
    ...(record.createdAt !== undefined && { createdAt: record.createdAt }),
  };
}

/** سجل الزمنية مع المدة اختيارياً (TimePermissionRecord في Phase 9). */
export function toTimePermissionDto(record: TimePermissionRecord): EmployeeTimePermissionDto {
  return {
    id: record.id,
    employeeId: record.employeeId,
    date: record.date,
    timeOut: record.timeOut,
    ...(record.timeIn !== undefined && { timeIn: record.timeIn }),
    ...(record.reason !== undefined && { reason: record.reason }),
    status: record.status,
    ...(record.transactionId !== undefined && { transactionId: record.transactionId }),
    ...(record.notes !== undefined && { notes: record.notes }),
    ...(record.durationMinutes !== undefined && { durationMinutes: record.durationMinutes }),
  };
}
