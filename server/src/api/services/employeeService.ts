/**
 * خدمة الموظف في طبقة الـAPI (Phase 10 — بند 1 من ترتيب النقل).
 *
 * مسؤولياتها محدودة عمداً:
 * - نداء مستودع الموظفين وترجمة سجلاته إلى DTO.
 * - تطبيق نطاق القراءة الشخصية وتحويل غير المرئي/غير الموجود إلى 404.
 *
 * التحقق وصلاحية العملية في middleware؛ ملكية القراءة تُفرض هنا قبل الجلب،
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
  EmployeeStatusValue,
  UpdateEmployeeInput,
} from '../../repositories/contracts';
import { ResourceNotFoundError } from '../errors';
import { AppError } from '../../errors';
import { EmployeeAccountLinkError, EmployeeStatusNoOpError } from '../../repositories/employeeRepository';
import { canReadEmployee, personnelFilter, type PersonnelReadScope } from '../../authorization/personnelScope';
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

/** Map repository-level identity errors without disclosing another employee's account. */
function rethrowAccountLinkError(error: unknown): never {
  if (error instanceof EmployeeAccountLinkError) {
    if (error.reason === 'account_missing') {
      throw new AppError('حساب المستخدم المطلوب غير موجود.', 404, 'ACCOUNT_LINK_NOT_FOUND');
    }
    throw new AppError(
      'الحساب مرتبط بمنتسب آخر أو أن المنتسب مرتبط بحساب آخر.',
      409,
      'EMPLOYEE_ACCOUNT_LINK_CONFLICT',
    );
  }
  throw error;
}

export class EmployeeApiService {
  constructor(private readonly employees: EmployeeRepository) {}

  /** قائمة الموظفين مع تصفية الحالة والبحث الجزئي. */
  async list(filter: EmployeeListQuery, scope: PersonnelReadScope): Promise<EmployeeDto[]> {
    const scoped = personnelFilter<EmployeeListFilter>({
      status: filter.status,
      search: filter.search,
    }, scope);
    if (scoped === null) return [];
    const records = await this.employees.list(scoped);
    return records.map(toEmployeeDto);
  }

  /** موظف واحد، أو 404 إن لم يوجد. */
  async getById(id: string, scope: PersonnelReadScope): Promise<EmployeeDto> {
    if (!canReadEmployee(scope, id)) {
      throw new ResourceNotFoundError('employee', id, ARABIC_EMPLOYEE);
    }
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
    try {
      const record = await this.employees.create(toCreateEmployeeInput(dto));
      return toEmployeeDto(record);
    } catch (error) {
      return rethrowAccountLinkError(error);
    }
  }

  /** تعديل جزئي: الحقول غير المرسلة تبقى كما هي. */
  async update(id: string, dto: UpdateEmployeeDto): Promise<EmployeeDto> {
    try {
      const record = await this.employees.update(id, toUpdateEmployeeInput(dto));
      if (record === null) {
        throw new ResourceNotFoundError('employee', id, ARABIC_EMPLOYEE);
      }
      return toEmployeeDto(record);
    } catch (error) {
      return rethrowAccountLinkError(error);
    }
  }

  /**
   * نقل حالة الموظف (لا حذف) — يكتب الجدول والسجل التاريخي في معاملة
   * واحدة داخل المستودع (الخطة §13 و§32).
   */
  async changeStatus(id: string, dto: ChangeEmployeeStatusDto): Promise<EmployeeDto> {
    try {
      const result = await this.employees.changeStatus(
        id,
        toChangeStatusInput(dto) as ChangeEmployeeStatusInput,
      );
      if (result === null) {
        throw new ResourceNotFoundError('employee', id, ARABIC_EMPLOYEE);
      }
      return toEmployeeDto(result.employee);
    } catch (error) {
      if (error instanceof EmployeeStatusNoOpError) {
        throw new AppError(
          'حالة المنتسب الحالية مطابقة للحالة المطلوبة؛ لم يُسجَّل انتقال جديد.',
          409,
          'EMPLOYEE_STATUS_UNCHANGED',
        );
      }
      throw error;
    }
  }

  /**
   * Detailed status transition for Phase15 Audit: previousStatus comes from the
   * locked repository mutation, not a separate stale HTTP-controller read.
   */
  async changeStatusForAudit(
    id: string,
    dto: ChangeEmployeeStatusDto,
  ): Promise<{ employee: EmployeeDto; previousStatus: EmployeeStatusValue }> {
    try {
      const result = await this.employees.changeStatus(
        id,
        toChangeStatusInput(dto) as ChangeEmployeeStatusInput,
      );
      if (result === null) {
        throw new ResourceNotFoundError('employee', id, ARABIC_EMPLOYEE);
      }
      return {
        employee: toEmployeeDto(result.employee),
        previousStatus: result.previousStatus,
      };
    } catch (error) {
      if (error instanceof EmployeeStatusNoOpError) {
        throw new AppError(
          'حالة المنتسب الحالية مطابقة للحالة المطلوبة؛ لم يُسجَّل انتقال جديد.',
          409,
          'EMPLOYEE_STATUS_UNCHANGED',
        );
      }
      throw error;
    }
  }


  /** سجل تغييرات حالة الموظف (الأحدث أولاً). */
  async statusHistory(id: string, scope: PersonnelReadScope): Promise<EmployeeStatusHistoryDto[]> {
    if (!canReadEmployee(scope, id)) {
      throw new ResourceNotFoundError('employee', id, ARABIC_EMPLOYEE);
    }
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
