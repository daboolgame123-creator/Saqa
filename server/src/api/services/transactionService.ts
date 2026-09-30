/**
 * خدمة الكتاب في طبقة الـAPI (Phase 10 — بند 2؛ وُسّعت في Phase 16).
 *
 * `month` لا يظهر هنا كمدخل: يُشتق من `date` داخل المستودع.
 * `employeeIds` في القراءة مرآة مشتقة من جدول الروابط لا حقل مستقل.
 *
 * Phase 16 — Soft Delete (§32): `archive` و`restore` لا يحذفان الصف.
 * الأرشفة طوابع حالة على الكتاب نفسه (الصف وروابطه ومرفقاته وسجلات
 * إتاحته وإطلاعه وتدقيقه كلها باقية)، والاستعادة تصفّرها.
 * `list` يعرض النشط فقط؛ `listArchived` هو الاستعلام التاريخي الإداري.
 *
 * Phase 17 — Concurrency (§33): كل كتابة على كتاب موجود (`update`،
 * `archive`، `restore`) مشروطة بنسخة يرسلها العميل. النسخة القديمة ليست
 * تعديلاً صامتاً ولا آخر-يكتب-يفوز: خطأ 409 `VERSION_CONFLICT` بلا أي
 * كتابة (وقرار الأرشفة الأصعب نفسه). والنطاق: الكتاب وحده في هذه المرحلة.
 */
import type {
  ArchivedTransactionState,
  CreateTransactionInput,
  TransactionListFilter,
  TransactionRepository,
  TransactionScopeFilter,
  VersionedWriteMiss,
} from '../../repositories/contracts';
import { ResourceNotFoundError, VersionConflictError } from '../errors';
import { toTransactionDto } from '../dto/recordMappers';
import type {
  ArchiveTransactionQuery,
  CreateTransactionDto,
  TransactionDto,
  TransactionListQuery,
  UpdateTransactionDto,
} from '../dto';
import {
  toCreateTransactionInput,
  toUpdateTransactionInput,
} from '../dto/inputMappers';
import type { AuditActor } from '../../audit';

const ARABIC_TRANSACTION = 'الكتاب';

export class TransactionApiService {
  constructor(private readonly transactions: TransactionRepository) {}

  /**
   * قائمة الكتب مع تصفية الشهر/الحالة/الاتجاه والترقيم.
   * `scope` (Phase 13) يقيّد ما يراه الفاعل داخل الاستعلام قبل الترقيم.
   */
  async list(
    filter: TransactionListQuery = {},
    scope?: TransactionScopeFilter,
  ): Promise<TransactionDto[]> {
    const records = await this.transactions.list(
      {
        month: filter.month,
        status: filter.status as TransactionListFilter['status'],
        direction: filter.direction as TransactionListFilter['direction'],
        limit: filter.limit,
        offset: filter.offset,
      },
      scope,
    );
    return records.map(toTransactionDto);
  }

  /**
   * كتاب واحد مع employeeIds ومرفقاته، أو 404.
   * كتاب خارج النطاق يعود `null` من المستودع ⇒ 404 نفسه: لا يميّز الخادم
   * بين «غير موجود» و«غير مرئي لك» فلا يعرف الطالب بوجوده (§12).
   */
  async getById(id: string, scope?: TransactionScopeFilter): Promise<TransactionDto> {
    const record = await this.transactions.findById(id, scope);
    if (record === null) {
      throw new ResourceNotFoundError('transaction', id, ARABIC_TRANSACTION);
    }
    return toTransactionDto(record);
  }


  /**
   * إنشاء كتاب مع روابطه ومرفقاته في معاملة واحدة (لا كيانات يتيمة).
   * الروابط تُقبل عند الإنشاء لأن `transaction_employees` لا معرّفاً
   * مستقلاً للعميل في هذه المرحلة؛ بعد ذلك تُدار بمسار الروابط.
   */
  async create(dto: CreateTransactionDto): Promise<TransactionDto> {
    const input = toCreateTransactionInput(dto) as CreateTransactionInput;
    const record = await this.transactions.create(input);
    return toTransactionDto(record);
  }

  /**
   * تعديل جزئي للكتاب (بلا روابط — لها مسارها المستقل) بقفل تفاؤلي.
   *
   * النسخة المتوقعة تُفصل عن الحقول قبل بناء المدخل: هي شرط في جملة
   * `UPDATE` لا عمود يُكتب. غيابها مستحيل هنا (المُحقِّق يفرضها)، والنسخة
   * القديمة ⇒ 409 بلا أي كتابة.
   */
  async update(id: string, dto: UpdateTransactionDto): Promise<TransactionDto> {
    const { expectedVersion, ...patch } = dto;
    const outcome = await this.transactions.update(
      id,
      toUpdateTransactionInput(patch),
      expectedVersion,
    );
    if (outcome.outcome !== 'updated') {
      throw versionedWriteError(outcome, id, expectedVersion, 'transaction');
    }
    return toTransactionDto(outcome.record);
  }

  /**
   * أرشفة كتاب (Phase 16 — §32) بقفل تفاؤلي (Phase 17 — §33).
   *
   * لا حذف: طوابع حالة على الصف نفسه. كتاب غير موجود ⇒ 404، كتاب مؤرشف
   * أصلاً ⇒ 404 كذلك (`stateMismatch` — لا فرق يُكشف للعميل)، ونسخة قديمة
   * ⇒ 409. في الحالات الثلاث لم تُكتب أي بيانات. الفاعل من الجلسة
   * (`AuditActor`)، والسبب اختياري («سبب الحذف عند الحاجة»).
   */
  async archive(
    id: string,
    query: ArchiveTransactionQuery,
    actor: AuditActor,
  ): Promise<TransactionDto> {
    const outcome = await this.transactions.archive(id, {
      deletedByUserId: actor.userId,
      reason: query.reason ?? null,
      expectedVersion: query.expectedVersion,
    });
    if (outcome.outcome !== 'updated') {
      throw versionedWriteError(outcome, id, query.expectedVersion, 'transaction');
    }
    return toTransactionDto(outcome.record);
  }

  /**
   * استعادة كتاب مؤرشف (Phase 16 — §32) بقفل تفاؤلي (Phase 17 — §33).
   *
   * الحالة قبل الاستعادة تأتي من **داخل معاملة الاستعادة** نفسها
   * (`previous`) لا من قراءة سابقة لها: حدث التدقيق يجب أن يصف ما
   * استُعيد فعلاً، لا قراءة قد تكون تغيّرت قبلها. كتاب نشط أصلاً ⇒ 404
   * (`stateMismatch`) بنفس سلوك Phase 16، ونسخة قديمة ⇒ 409.
   */
  async restore(
    id: string,
    expectedVersion: number,
  ): Promise<{
    transaction: TransactionDto;
    archivedAt: string;
    archivedBy: string | null;
    archiveReason: string | null;
  }> {
    const outcome = await this.transactions.restore(id, expectedVersion);
    if (outcome.outcome !== 'restored') {
      throw versionedWriteError(outcome, id, expectedVersion, 'transaction');
    }
    return {
      transaction: toTransactionDto(outcome.record),
      ...archivedStateFields(outcome.previous),
    };
  }

  /**
   * الاستعلام التاريخي الإداري للمؤرشف (§32 «historical query still
   * available to authorized admins»): الأحدث أرشفة أولاً، بنفس ترقيم
   * القوائم النشطة. الفرض على الصلاحية في المسار لا هنا.
   */
  async listArchived(
    filter: TransactionListQuery = {},
    scope?: TransactionScopeFilter,
  ): Promise<TransactionDto[]> {
    const records = await this.transactions.list(
      {
        month: filter.month,
        status: filter.status as TransactionListFilter['status'],
        direction: filter.direction as TransactionListFilter['direction'],
        limit: filter.limit,
        offset: filter.offset,
        archived: 'only',
      },
      scope,
    );
    return records.map(toTransactionDto);
  }
}

/**
 * حقول حدث الاستعادة من حالة ما قبل الاستعادة (Phase 17): تُشتق في مكان
 * واحد فلا تختلف تسمية الحدث عن وصف الحالة المخزّنة.
 */
function archivedStateFields(previous: ArchivedTransactionState): {
  archivedAt: string;
  archivedBy: string | null;
  archiveReason: string | null;
} {
  return {
    archivedAt: previous.deletedAt,
    archivedBy: previous.deletedBy,
    archiveReason: previous.deleteReason,
  };
}

/**
 * ترجمة فشل الكتابة المقيدة بالنسخة إلى خطأ HTTP (Phase 17 — §33).
 *
 * الأسباب الثلاثة تُترجم هنا — موضع واحد — حتى لا تختلف الاستجابة بين
 * `update` و`archive` و`restore`:
 * - `stale` ⇒ 409 `VERSION_CONFLICT` مع النسختين في `details`.
 * - `notFound` و`stateMismatch` ⇒ 404 نفسه: الخادم لا يكشف الفرق بين
 *   «غير موجود» و«موجود في حالة لا تقبل العملية» (سلوك Phase 16 نفسه).
 */
function versionedWriteError(
  miss: VersionedWriteMiss,
  id: string,
  expectedVersion: number,
  resource: string,
): Error {
  if (miss.outcome === 'stale') {
    return new VersionConflictError(
      resource,
      id,
      ARABIC_TRANSACTION,
      expectedVersion,
      miss.currentVersion,
    );
  }
  return new ResourceNotFoundError(resource, id, ARABIC_TRANSACTION);
}
