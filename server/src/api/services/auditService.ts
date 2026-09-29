/**
 * خدمة سجل التدقيق في طبقة الـAPI (Phase 15 — §31).
 *
 * لماذا الخدمة هنا تكتب **بعد** نجاح العملية لا داخلها: الترتيب
 * الأمني المعتمد يبقى
 *   Authentication → Authorization → Access Scope → Resource Access → Audit Event
 * أي أن حدث التدقيق يُكتب بعد اجتياز الفحوص ووصول المورد، فلا يصبح
 * التدقيق ممراً للوصول ولا يُكتب حدث وصول مرفوض كأنه ناجح.
 *
 * لا صلاحيات هنا: قراءة `list()` محمية بـ`view_audit_logs` على المسار،
 * والكتابة من العمليات الحساسة وحدها (لا مسار HTTP يبني أحداثاً).
 */
import type { Queryable } from '../../database';
import {
  listAuditLogs,
  recordAuditEvent,
  type AuditActor,
  type AuditEventKind,
} from '../../audit';
import { toAuditLogDto, type AuditLogDto } from '../dto/audit';

/** وصف العملية الحساسة كما يقرؤه controller — لا يبنيه العميل. */
export interface SensitiveAttachmentAccessEvent {
  transactionId: string;
  attachmentId: string;
  originalFilename: string;
  mimeType: string;
}

export interface AvailabilityChangeEvent {
  transactionId: string;
  employeeIds: readonly string[];
}

export interface AvailabilityRevokeEvent {
  transactionId: string;
  employeeId: string;
}

export interface EmployeeStatusChangeEvent {
  employeeId: string;
  previousStatus: string;
  nextStatus: string;
  serviceEndReason?: string;
}

export class AuditApiService {
  constructor(private readonly db: Queryable) {}

  /** آخر الأحداث (حد أقصى ثابت) — القراءة المحمية بـ`view_audit_logs`. */
  async list(): Promise<AuditLogDto[]> {
    const records = await listAuditLogs(this.db);
    return records.map(toAuditLogDto);
  }

  /**
   * وصول حساس إلى محتوى مرفق بعد authorization وAccess Scope.
   * يُكتب **بعد** نجاح تحميل الخدمة (§31 `sensitive_file_access`).
   */
  async recordAttachmentAccess(
    actor: AuditActor,
    event: SensitiveAttachmentAccessEvent,
  ): Promise<void> {
    await this.record({
      eventKind: 'sensitive_file_access',
      actor,
      entityKind: 'attachment',
      entityId: event.attachmentId,
      newValues: {
        transactionId: event.transactionId,
        originalFilename: event.originalFilename,
        mimeType: event.mimeType,
        outcome: 'success',
      },
    });
  }

  /** منح إتاحة (§9.3/§9.4) — حدث إنشاء على سجل الإتاحة. */
  async recordAvailabilityGrant(
    actor: AuditActor,
    event: AvailabilityChangeEvent,
  ): Promise<void> {
    await this.record({
      eventKind: 'create',
      actor,
      entityKind: 'transaction_availability',
      entityId: event.transactionId,
      newValues: {
        transactionId: event.transactionId,
        employeeIds: [...event.employeeIds],
        outcome: 'success',
      },
    });
  }

  /** سحب إتاحة (§9.3) — تحديث يُسجَّل بالقيمتين قبل/بعد. */
  async recordAvailabilityRevoke(
    actor: AuditActor,
    event: AvailabilityRevokeEvent,
  ): Promise<void> {
    await this.record({
      eventKind: 'update',
      actor,
      entityKind: 'transaction_availability',
      entityId: event.transactionId,
      oldValues: { revoked: false },
      newValues: {
        transactionId: event.transactionId,
        employeeId: event.employeeId,
        revoked: true,
        outcome: 'success',
      },
    });
  }

  /** نقل حالة موظف (§13) — old/new للحالة الحساسة كما تلزم §31. */
  async recordEmployeeStatusChange(
    actor: AuditActor,
    event: EmployeeStatusChangeEvent,
  ): Promise<void> {
    await this.record({
      eventKind: 'status_change',
      actor,
      entityKind: 'employee',
      entityId: event.employeeId,
      oldValues: { status: event.previousStatus },
      newValues: {
        status: event.nextStatus,
        ...(event.serviceEndReason === undefined
          ? {}
          : { serviceEndReason: event.serviceEndReason }),
        outcome: 'success',
      },
    });
  }

  /** الكتابة الموحّدة: تنقية الأسرار والكتابة في `audit_logs`. */
  private async record(event: {
    eventKind: AuditEventKind;
    actor: AuditActor;
    entityKind?: string;
    entityId?: string | null;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
  }): Promise<void> {
    await recordAuditEvent(this.db, event);
  }
}
