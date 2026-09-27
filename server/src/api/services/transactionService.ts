/**
 * خدمة الكتاب في طبقة الـAPI (Phase 10 — بند 2 من ترتيب النقل).
 *
 * `month` لا يظهر هنا كمدخل: يُشتق من `date` داخل المستودع.
 * `employeeIds` في القراءة مرآة مشتقة من جدول الروابط لا حقل مستقل.
 *
 * لا يوجد `delete`: الكتاب لا يُحذف في الاستخدام الإداري (§13/§32)،
 * والحذف الناعم مخصَّص لمرحلة لاحقة (Phase 16) بإضافة أعمدة لا تُخترع هنا.
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
  CreateTransactionDto,
  TransactionDto,
  TransactionListQuery,
  UpdateTransactionDto,
} from '../dto';
import {
  toCreateTransactionInput,
  toUpdateTransactionInput,
} from '../dto/inputMappers';

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
}
