/**
 * خدمة الموظف في طبقة الـAPI (Phase 10 — بند 1 من ترتيب النقل).
 *
 * مسؤولياتها محدودة عمداً:
 * - نداء مستودع الموظفين وترجمة سجلاته إلى DTO.
 * - تحويل «السجل غير موجود» إلى ResourceNotFoundError بدل `null` عابر للواجهة.
 *
 * ما لا تفعله: لا تحقق (middleware)، ولا صلاحيات (Phase 12)،
 * ولا تحقّق من كيانات مرتبطة (تتكفل بها قيود FK في القاعدة).
 *
 * لا يوجد `delete`: الخطة §32 تمنع حذف الموظف، و`changeStatus` ينقله
 * إلى «موظف سابق» مع سبب معتمد. `handleDeleteEmployee` في الواجهة لا
 * يقابله مسار على الخادم في هذه المرحلة.
 */
import type {
  ChangeEmployeeStatusInput,
  CreateEmployeeInput,
  EmployeeListFilter,
  EmployeeRepository,
  UpdateEmployeeInput,
} from '../../repositories/contracts';
import { ResourceNotFoundError } from '../errors';
import {
  toEmployeeDto,
  toEmployeeStatusHistoryDto,
} from '../dto/recordMappers';
import type {
  ChangeEmployeeStatusDto,
  CreateEmployeeDto,
  EmployeeDto,
  EmployeeListQuery,
  EmployeeStatusHistoryDto,
  UpdateEmployeeDto,
} from '../dto';
import {
  toChangeStatusInput,
  toCreateEmployeeInput,
  toUpdateEmployeeInput,
} from '../dto/inputMappers';

const ARABIC_EMPLOYEE = 'الموظف';

export class EmployeeApiService {
  constructor(private readonly employees: EmployeeRepository) {}

  /** قائمة الموظفين مع تصفية الحالة والبحث الجزئي. */
  async list(filter: EmployeeListQuery = {}): Promise<EmployeeDto[]> {
    const records = await this.employees.list({
      status: filter.status,
      search: filter.search,
    } satisfies EmployeeListFilter);
    return records.map(toEmployeeDto);
  }

  /** موظف واحد، أو 404 إن لم يوجد. */
  async getById(id: string): Promise<EmployeeDto> {
    const record = await this.employees.findById(id);
    if (record === null) {
      throw new ResourceNotFoundError('employee', id, ARABIC_EMPLOYEE);
    }
    return toEmployeeDto(record);
  }

  /**
   * إنشاء موظف.
   * المعرّف لا يُقبل من العميل: القاعدة تولّده (`gen_random_uuid`)
   * والخدمة تُعيد السجل بالمعرّف الحقيقي.
   */
  async create(dto: CreateEmployeeDto): Promise<EmployeeDto> {
    const record = await this.employees.create(toCreateEmployeeInput(dto));
    return toEmployeeDto(record);
  }

  /** تعديل جزئي: الحقول غير المرسلة تبقى كما هي. */
  async update(id: string, dto: UpdateEmployeeDto): Promise<EmployeeDto> {
    const record = await this.employees.update(id, toUpdateEmployeeInput(dto));
    if (record === null) {
      throw new ResourceNotFoundError('employee', id, ARABIC_EMPLOYEE);
    }
    return toEmployeeDto(record);
  }

  /**
   * نقل حالة الموظف (لا حذف) — يكتب الجدول والسجل التاريخي في معاملة
   * واحدة داخل المستودع (الخطة §13 و§32).
   */
  async changeStatus(id: string, dto: ChangeEmployeeStatusDto): Promise<EmployeeDto> {
    const result = await this.employees.changeStatus(
      id,
      toChangeStatusInput(dto) as ChangeEmployeeStatusInput,
    );
    if (result === null) {
      throw new ResourceNotFoundError('employee', id, ARABIC_EMPLOYEE);
    }
    return toEmployeeDto(result.employee);
  }

  /** سجل تغييرات حالة الموظف (الأحدث أولاً). */
  async statusHistory(id: string): Promise<EmployeeStatusHistoryDto[]> {
    const employee = await this.employees.findById(id);
    if (employee === null) {
      throw new ResourceNotFoundError('employee', id, ARABIC_EMPLOYEE);
    }
    const history = await this.employees.listStatusHistory(id);
    return history.map(toEmployeeStatusHistoryDto);
  }
}

/** إعادة تصدير نوع الإدخال لأجل الاختبارات والشفافية. */
export type { CreateEmployeeInput, UpdateEmployeeInput };
