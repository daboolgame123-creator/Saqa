/**
 * خدمة روابط الكتاب بالمنتسب في طبقة الـAPI (Phase 10 — بند 3، BR-05).
 *
 * العلاقة هي المصدر المنطقي للربط؛ `employeeIds` داخل الكتاب مرآة
 * مشتقة منها (القاعدة 7). لا يعتمد أي شيء هنا على الاسم النصي.
 *
 * `remove` يزيل سطر العلاقة فقط: لا الكتاب ولا الموظف. قيد UNIQUE في
 * القاعدة يمنع تكرار نفس المنتسب بنفس الدور في الكتاب نفسه.
 */
import type {
  TransactionEmployeeRepository,
  TransactionScopeFilter,
} from '../../repositories/contracts';
import type { TransactionEmployeeRole } from '../../../../src/core/models/transactionEmployee';
import { ResourceNotFoundError } from '../errors';
import { AppError } from '../../errors';
import { toTransactionEmployeeDto } from '../dto/recordMappers';
import type {
  CreateTransactionEmployeeDto,
  TransactionEmployeeDto,
  UpdateTransactionEmployeeDto,
} from '../dto';
import { toCreateTransactionEmployeeInput } from '../dto/inputMappers';

const ARABIC_LINK = 'العلاقة بين الكتاب والمنتسب';

/** Only known PostgreSQL integrity errors are translated to safe API responses. */
function rethrowLinkWriteError(
  error: unknown,
  references?: { transactionId: string; employeeId: string },
): never {
  if (error && typeof error === 'object') {
    const pgError = error as { code?: unknown; constraint?: unknown };
    if (pgError.code === '23503' && references) {
      if (pgError.constraint === 'transaction_employees_employee_id_fkey') {
        throw new ResourceNotFoundError('employee', references.employeeId, 'المنتسب');
      }
      if (pgError.constraint === 'transaction_employees_transaction_id_fkey') {
        throw new ResourceNotFoundError('transaction', references.transactionId, 'الكتاب');
      }
    }
    if (pgError.code === '23505') {
      throw new AppError(
        'هذا الربط بين الكتاب والمنتسب موجود بالفعل بنفس الدور.',
        409,
        'TRANSACTION_EMPLOYEE_ALREADY_LINKED',
      );
    }
  }
  throw error;
}

export class TransactionEmployeeApiService {
  constructor(private readonly links: TransactionEmployeeRepository) {}

  /**
   * روابط كتاب واحد.
   * `scope` (Phase 13): تمرير قيد للفاعل المقيَّد يجعل الاستعلام لا يعيد
   * روابط كتاب غير مرئي — فالنطاق هنا لا يُفرض بعد القراءة.
   */
  async listByTransaction(
    transactionId: string,
    scope?: TransactionScopeFilter,
  ): Promise<TransactionEmployeeDto[]> {
    const records = await this.links.listByTransaction(transactionId, scope);
    return records.map(toTransactionEmployeeDto);
  }

  /** روابط منتسب واحد (نطاق المعاملات المرئية له فقط عند تمرير `scope`). */
  async listByEmployee(
    employeeId: string,
    scope?: TransactionScopeFilter,
  ): Promise<TransactionEmployeeDto[]> {
    const records = await this.links.listByEmployee(employeeId, scope);
    return records.map(toTransactionEmployeeDto);
  }

  /** إنشاء رابط وإعادته بمعرّفه الحقيقي. */
  async create(dto: CreateTransactionEmployeeDto): Promise<TransactionEmployeeDto> {
    try {
      const record = await this.links.add(toCreateTransactionEmployeeInput(dto));
      return toTransactionEmployeeDto(record);
    } catch (error) {
      return rethrowLinkWriteError(error, dto);
    }
  }

  /** تعديل دور العلاقة أو ملاحظاتها. */
  async update(id: string, dto: UpdateTransactionEmployeeDto): Promise<TransactionEmployeeDto> {
    try {
      const record = await this.links.update(id, {
        // الأدوار الأربعة مستوفاة أصلاً في التحقق؛ التضييق هنا لإرضاء نوع العقد.
        relationshipType: dto.relationshipType as TransactionEmployeeRole | undefined,
        notes: dto.notes,
      });
      if (record === null) {
        throw new ResourceNotFoundError('transactionEmployee', id, ARABIC_LINK);
      }
      return toTransactionEmployeeDto(record);
    } catch (error) {
      return rethrowLinkWriteError(error);
    }
  }

  /**
   * إزالة الرابط فقط، أو 404 إن لم يعد موجوداً.
   * الكتاب والموظف يبقيان كما هما.
   */
  async remove(id: string): Promise<{ id: string }> {
    const removed = await this.links.remove(id);
    if (!removed) {
      throw new ResourceNotFoundError('transactionEmployee', id, ARABIC_LINK);
    }
    return { id };
  }
}
