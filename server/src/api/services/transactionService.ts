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
 */
import type {
  CreateTransactionInput,
  TransactionListFilter,
  TransactionRepository,
  TransactionScopeFilter,
} from '../../repositories/contracts';
import { ResourceNotFoundError } from '../errors';
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

  /** تعديل جزئي للكتاب (بلا روابط — لها مسارها المستقل). */
  async update(id: string, dto: UpdateTransactionDto): Promise<TransactionDto> {
    const record = await this.transactions.update(id, toUpdateTransactionInput(dto));
    if (record === null) {
      throw new ResourceNotFoundError('transaction', id, ARABIC_TRANSACTION);
    }
    return toTransactionDto(record);
  }

  /**
   * أرشفة كتاب (Phase 16 — §32): طوابع حالة، لا حذف.
   *
   * `null` من المستودع = الكتاب غير موجود أصلاً **أو** مؤرشف أصلاً؛
   * في الحالتين 404 بلا كشف أي فرق بينهما للعميل. الفاعل من الجلسة
   * (`AuditActor`)، والسبب اختياري («سبب الحذف عند الحاجة»).
   */
  async archive(
    id: string,
    query: ArchiveTransactionQuery,
    actor: AuditActor,
  ): Promise<TransactionDto> {
    const record = await this.transactions.archive(id, {
      deletedByUserId: actor.userId,
      reason: query.reason ?? null,
    });
    if (record === null) {
      throw new ResourceNotFoundError('transaction', id, ARABIC_TRANSACTION);
    }
    return toTransactionDto(record);
  }

  /**
   * استعادة كتاب مؤرشف (Phase 16 — §32).
   *
   * الحالة قبل الاستعادة تُقرأ من الصفّ المؤرشف نفسه (لا من العميل ولا
   * بالتخمين) لأنها هي ما يكتبه حدث التدقيق. كتاب نشط أصلاً ⇒ 404:
   * لا تعديل صامت ولا حدث بلا أثر (السلوك الأبسط المتسق مع الأرشفة).
   */
  async restore(
    id: string,
  ): Promise<{
    transaction: TransactionDto;
    archivedAt: string;
    archivedBy: string | null;
    archiveReason: string | null;
  }> {
    const archived = await this.transactions.findById(id, undefined, {
      includeArchived: true,
    });
    if (archived === null || archived.deletedAt === null) {
      throw new ResourceNotFoundError('transaction', id, ARABIC_TRANSACTION);
    }
    const record = await this.transactions.restore(id);
    if (record === null) {
      throw new ResourceNotFoundError('transaction', id, ARABIC_TRANSACTION);
    }
    return {
      transaction: toTransactionDto(record),
      archivedAt: archived.deletedAt,
      archivedBy: archived.deletedBy,
      archiveReason: archived.deleteReason ?? null,
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
