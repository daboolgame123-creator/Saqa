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

/**
 * إنشاء كتاب (Phase 20 — بند «create» في قائمة تدقيق الكتب §31).
 *
 * الفجوة التي تسدّها هذه المرحلة: المراحل السابقة كتبت أحداث `archive`
 * و`restore` وحالات الطلبات، ولم تكتب حدثاً لإنشاء كتاب ولا لتعديله —
 * وهما بندان صريحان في §31. تسدّ Phase 20 الفجوة بأحداث من القائمة
 * المعتمدة نفسها، **بلا نوع جديد**.
 *
 * `newValues` تحمل الحقول الدلالية القليلة التي تميّز الكتاب لا كامل
 * جسمه: §31 تطلب old/new «حسب سياسة الحساسية» لا نسخاً كاملاً. و
 * `importedAt` يُنقل لأنه يميّز **مصدر** السجل (تاريخي مقابل حيّ)،
 * وهو بند صريح من §37.
 */
export interface TransactionCreateEvent {
  transactionId: string;
  direction: string;
  number: string;
  status: string;
  importedAt?: string | null;
}

/**
 * تعديل كتاب (Phase 20 — بند «update» في §31).
 *
 * `fields` أسماء الحقول التي تغيّرت كما أرسلها العميل بعد التحقق، و
 * `fromStatus`/`toStatus` إجباريان لأن تغيّر الحالة هو الأهم في هذا
 * المورد و§31 تطلب old/new عند تغيّر مهم.
 */
export interface TransactionUpdateEvent {
  transactionId: string;
  fields: readonly string[];
  fromStatus: string;
  toStatus: string;
}

/** إنشاء ارتباط كتابين (Phase 20 — §36 «Related Books»). */
export interface RelationCreateEvent {
  transactionId: string;
  relatedTransactionId: string;
  relationId: string;
}

/** إزالة سطر ارتباط (Phase 20) — لا كتاب ولا طرف (§32). */
export interface RelationRemoveEvent {
  transactionId: string;
  relationId: string;
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

  /**
   * إنشاء كتاب — حدث `create` (Phase 20، §31).
   *
   * لا يُسجَّل الفحص عن تشابه: هو قراءة وصفية (§36 «لا يمنع الإدخال»)،
   * و§31 يشترط «عند الحاجة» للعمليات الحسّاسة لا لكل مقارنة.
   */
  async recordTransactionCreate(
    actor: AuditActor,
    event: TransactionCreateEvent,
  ): Promise<void> {
    await this.record({
      eventKind: 'create',
      actor,
      entityKind: 'transaction',
      entityId: event.transactionId,
      newValues: {
        direction: event.direction,
        number: event.number,
        status: event.status,
        ...(event.importedAt !== undefined && event.importedAt !== null
          ? { importedAt: event.importedAt }
          : {}),
        outcome: 'success',
      },
    });
  }

  /** تعديل كتاب — حدث `update` بالقيمة قبل/بعد للحالة (§31). */
  async recordTransactionUpdate(
    actor: AuditActor,
    event: TransactionUpdateEvent,
  ): Promise<void> {
    await this.record({
      eventKind: 'update',
      actor,
      entityKind: 'transaction',
      entityId: event.transactionId,
      oldValues: { status: event.fromStatus },
      newValues: {
        status: event.toStatus,
        fields: [...event.fields],
        outcome: 'success',
      },
    });
  }

  /**
   * انتقال حالة الكتاب (Phase 20 — §36).
   *
   * `status_change` نوع معتمد في §31 وقيد CHECK منذ Phase 9 — لا نوع
   * جديد. القيم قبل/بعد إجبارية لأن §31 تطلبها «عند تعديل مهم».
   */
  async recordTransactionStatusTransition(
    actor: AuditActor,
    event: { transactionId: string; fromStatus: string; toStatus: string },
  ): Promise<void> {
    await this.record({
      eventKind: 'status_change',
      actor,
      entityKind: 'transaction',
      entityId: event.transactionId,
      oldValues: { status: event.fromStatus },
      newValues: { status: event.toStatus, outcome: 'success' },
    });
  }

  /** إنشاء ارتباط كتابين — حدث `create` على كيان الكتاب (§36). */
  async recordRelationCreate(actor: AuditActor, event: RelationCreateEvent): Promise<void> {
    await this.record({
      eventKind: 'create',
      actor,
      entityKind: 'transaction',
      entityId: event.transactionId,
      newValues: {
        action: 'link_related_book',
        relatedTransactionId: event.relatedTransactionId,
        relationId: event.relationId,
        outcome: 'success',
      },
    });
  }

  /**
   * إزالة سطر ارتباط — حدث `update` لا `delete`.
   *
   * `delete` في §31 يعني حذف سجل؛ وهنا **لم يُحذف كتاب ولا سجل دائم**:
   * سطر ارتباط أُزيل فقط، والكتابان بقيا كما هما (§32). فتسجيلها
   * `update` يحفظ التمييز في السجل بدل أن يبدو حذفاً لكتاب.
   */
  async recordRelationRemove(actor: AuditActor, event: RelationRemoveEvent): Promise<void> {
    await this.record({
      eventKind: 'update',
      actor,
      entityKind: 'transaction',
      entityId: event.transactionId,
      oldValues: { relationId: event.relationId, linked: true },
      newValues: { relationId: event.relationId, linked: false, outcome: 'success' },
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
