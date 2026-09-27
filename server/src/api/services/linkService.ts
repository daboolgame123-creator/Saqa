/**
 * خدمة روابط الكتاب بالمنتسب في طبقة الـAPI (Phase 10 — بند 3، BR-05).
 *
 * العلاقة هي المصدر المنطقي للربط؛ `employeeIds` داخل الكتاب مرآة
 * مشتقة منها (القاعدة 7). لا يعتمد أي شيء هنا على الاسم النصي.
 *
 * `remove` يزيل سطر العلاقة فقط: لا الكتاب ولا الموظف. قيد UNIQUE في
 * القاعدة يمنع تكرار نفس المنتسب بنفس الدور في الكتاب نفسه.
 */
import type { TransactionEmployeeRepository } from '../../repositories/contracts';
import type { TransactionEmployeeRole } from '../../../../src/core/models/transactionEmployee';
import { ResourceNotFoundError } from '../errors';
import { toTransactionEmployeeDto } from '../dto/recordMappers';
import type {
  CreateTransactionEmployeeDto,
  TransactionEmployeeDto,
  UpdateTransactionEmployeeDto,
} from '../dto';
import { toCreateTransactionEmployeeInput } from '../dto/inputMappers';

const ARABIC_LINK = 'العلاقة بين الكتاب والمنتسب';

export class TransactionEmployeeApiService {
  constructor(private readonly links: TransactionEmployeeRepository) {}

  /** روابط كتاب واحد. */
  async listByTransaction(transactionId: string): Promise<TransactionEmployeeDto[]> {
    const records = await this.links.listByTransaction(transactionId);
    return records.map(toTransactionEmployeeDto);
  }

  /** روابط منتسب واحد (نطاق المعاملات التي يرتبط بها). */
  async listByEmployee(employeeId: string): Promise<TransactionEmployeeDto[]> {
    const records = await this.links.listByEmployee(employeeId);
    return records.map(toTransactionEmployeeDto);
  }

  /** إنشاء رابط وإعادته بمعرّفه الحقيقي. */
  async create(dto: CreateTransactionEmployeeDto): Promise<TransactionEmployeeDto> {
    const record = await this.links.add(toCreateTransactionEmployeeInput(dto));
    return toTransactionEmployeeDto(record);
  }

  /** تعديل دور العلاقة أو ملاحظاتها. */
  async update(id: string, dto: UpdateTransactionEmployeeDto): Promise<TransactionEmployeeDto> {
    const record = await this.links.update(id, {
      // الأدوار الأربعة مستوفاة أصلاً في التحقق؛ التضييق هنا لإرضاء نوع العقد.
      relationshipType: dto.relationshipType as TransactionEmployeeRole | undefined,
      notes: dto.notes,
    });
    if (record === null) {
      throw new ResourceNotFoundError('transactionEmployee', id, ARABIC_LINK);
    }
    return toTransactionEmployeeDto(record);
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
