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

/** أرشفة كتاب (Phase 16 — §32). */
export interface TransactionArchiveEvent {
  transactionId: string;
  /** سبب الحذف الاختياري كما طلبه المحقق/العميل. */
  reason?: string | null;
  /** «متى» و«من» يؤخذان من الصفّ المُرجَع (بعد الأرشفة) لا من مُدخلات العميل. */
  deletedAt: string;
  deletedBy: string | null;
}

/** استعادة كتاب مؤرشف (Phase 16 — §32) — القيم قبل الاستعادة. */
export interface TransactionRestoreEvent {
  transactionId: string;
  archivedAt: string;
  archivedBy: string | null;
  archiveReason: string | null;
}

/** إنشاء طلب (Phase 19 · §35) — الحدث من العملية لا من جسم الطلب. */
export interface RequestCreateEvent {
  requestId: string;
  employeeId: string;
  kind: string;
}

/**
 * انتقال حالة طلب (Phase 19 · §18/§35).
 *
 * `eventKind` هنا **`status_change`** — نوع معتمد في قيد CHECK منذ
 * Phase 9 (§31) ولا يُضاف نوع جديد ولا يُختلق (§31 قائمة مقفولة).
 */
export interface RequestTransitionEvent {
  requestId: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  comment?: string;
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

  /**
   * أرشفة كتاب (Phase 16 — §32): حدث `archive` (نوع موجود في قيد CHECK
   * منذ Phase 9 — لم يُخترع نوع جديد ولا تُعدَّل البنية).
   *
   * old/new يعكسان الانتقال نفسه: من غير مؤرشف إلى مؤرشف بطوابعه.
   */
  async recordTransactionArchive(
    actor: AuditActor,
    event: TransactionArchiveEvent,
  ): Promise<void> {
    await this.record({
      eventKind: 'archive',
      actor,
      entityKind: 'transaction',
      entityId: event.transactionId,
      oldValues: { deletedAt: null, deletedBy: null },
      newValues: {
        deletedAt: event.deletedAt,
        deletedBy: event.deletedBy,
        ...(event.reason !== undefined && event.reason !== null
          ? { deleteReason: event.reason }
          : {}),
        action: 'archive',
        outcome: 'success',
      },
    });
  }

  /**
   * استعادة كتاب (Phase 16 — §32).
   *
   * نوع الحدث `update`: قائمة §31 المعتمدة (وقيد CHECK في Phase 9) لا
   * تتضمن `restore`، ولا يُضاف نوع بلا نصّ في الخطة. والقيم قبل/بعد
   * تُظهر الانتقال كاملاً (`deletedAt: <طابع> → null`) فتبقى العملية
   * قابلة للتتبع في السجل بلا لبس.
   */
  async recordTransactionRestore(
    actor: AuditActor,
    event: TransactionRestoreEvent,
  ): Promise<void> {
    await this.record({
      eventKind: 'update',
      actor,
      entityKind: 'transaction',
      entityId: event.transactionId,
      oldValues: {
        deletedAt: event.archivedAt,
        deletedBy: event.archivedBy,
        deleteReason: event.archiveReason,
      },
      newValues: {
        deletedAt: null,
        deletedBy: null,
        deleteReason: null,
        action: 'restore',
        outcome: 'success',
      },
    });
  }

  /** إنشاء طلب (Phase 19) — حدث `create` على كيان الطلب. */
  async recordRequestCreate(actor: AuditActor, event: RequestCreateEvent): Promise<void> {
    await this.record({
      eventKind: 'create',
      actor,
      entityKind: 'request',
      entityId: event.requestId,
      newValues: {
        employeeId: event.employeeId,
        kind: event.kind,
        status: 'draft',
        outcome: 'success',
      },
    });
  }

  /**
   * انتقال حالة طلب (Phase 19) — حدث `status_change` بالقيمة قبل/بعد.
   *
   * **لا يُسجَّل كل قراءة** (§31): القراءة العادية (`GET`) بلا حدث.
   * ولا يُسجَّل تعديل المسوّد `status_change` — تعديلُ بيانات لا حالة،
   * فيُسجَّل `update` (انظر `recordRequestUpdate`). تعليق المدير
   * وسؤال التوضيح وردّ المنتسب تُحفظ في `new_values.comment` بعد
   * التنقية نفسها التي تمرّ بها كل القيم (§31 «لا أسرار»).
   */
  async recordRequestTransition(
    actor: AuditActor,
    event: RequestTransitionEvent,
  ): Promise<void> {
    await this.record({
      eventKind: 'status_change',
      actor,
      entityKind: 'request',
      entityId: event.requestId,
      oldValues: { status: event.fromStatus },
      newValues: {
        status: event.toStatus,
        action: event.action,
        ...(event.comment !== undefined && { comment: event.comment }),
        outcome: 'success',
      },
    });
  }

  /** تعديل بيانات طلب مسوّد (Phase 19) — حدث `update`. */
  async recordRequestUpdate(
    actor: AuditActor,
    event: { requestId: string; fields: readonly string[] },
  ): Promise<void> {
    await this.record({
      eventKind: 'update',
      actor,
      entityKind: 'request',
      entityId: event.requestId,
      newValues: {
        fields: [...event.fields],
        action: 'update_draft',
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
