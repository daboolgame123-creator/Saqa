/**
 * تنفيذ مصدر البيانات المحلي (Phase 10) — fallback للتطوير والاختبار.
 *
 * يغلّف `StorageService` (localStorage) خلف نفس العقد غير المتزامن
 * `IDataAdapter`، فيمكن تبديل المصدر دون أن تعرف الواجهة.
 *
 * لماذا هو fallback لا Production: الخطة §26 تنصّ عليه صراحةً
 * («fallback Local Adapter فقط للاختبارات/التطوير المحلي»). الوضع
 * الافتراضي هو `api`؛(Local يُختار بإعداد `VITE_DATA_SOURCE=local`
 * أو عند فشل أول تحميل من الـAPI (انظر `index.ts`).
 *
 * فرق جوهري عن التنفيذ المحلي: **لا يولّد معرّفات UUID**. localStorage
 * هوية字符串 ما في_data؛ لذلك يبقى توليد المعرّف محلياً عبر
 * `PersonnelService.newId` كما كان قبل المرحلة، وتبقى البيانات المدمجة
 * (`mockData`) صالحة هنا ولا تصلح للقاعدة (uuid).
 */
import type {
  Employee,
  Transaction,
  TransactionEmployee,
  DailySituationRecord,
  EmployeeLeave,
  EmployeeTimePermission,
  EmployeeAssignment,
  EmployeeCourse,
} from '../core/models';
import type {
  CreateDailySituationInput,
  CreateEmployeeInput,
  CreateTransactionEmployeeInput,
  CreateTransactionInput,
  DailySituationListFilter,
  EmployeeListFilter,
  IDataAdapter,
  TimelineFilter,
  TimelineResultData,
  TransactionListFilter,
  UpdateTransactionInput,
} from '../core/interfaces/dataAdapter';
import { StorageService } from '../services/storageService';
import { TransactionEmployeeService } from '../services/transactionEmployeeService';
import { TimelineService } from '../services/timelineService';

/**
 * تنفيذ محلي كامل.
 *
 * وظيفته: إبقاء النموذج الأولي يعمل بلا خادم أثناء التطوير، وبلا قاعدة
 * أثناء اختبارات الواجهة. لا يُستخدم كمصدر بيانات في النشر.
 */
export class LocalDataAdapter implements IDataAdapter {
  readonly kind = 'local' as const;

  // ── الموظفون ────────────────────────────────────────────────
  async loadEmployees(filter: EmployeeListFilter = {}): Promise<Employee[]> {
    const all = StorageService.loadEmployees();
    const search = filter.search?.trim();
    return all.filter((employee) => {
      if (filter.status === 'former') return false; // الحالة المحلية: كلها active
      if (search === undefined || search === '') return true;
      return (
        employee.name.includes(search) ||
        employee.badgeNumber?.includes(search) === true
      );
    });
  }

  async createEmployee(input: CreateEmployeeInput): Promise<Employee> {
    const created: Employee = { ...input, id: `emp-${Date.now()}-${Math.floor(Math.random() * 10000)}` };
    StorageService.saveEmployees([created, ...StorageService.loadEmployees()]);
    return created;
  }

  async updateEmployee(id: string, patch: Partial<Employee>): Promise<Employee> {
    const employees = StorageService.loadEmployees();
    const current = employees.find((employee) => employee.id === id);
    if (current === undefined) {
      throw new Error(`الموظف بالمعرّف «${id}» غير موجود في التخزين المحلي.`);
    }
    const updated: Employee = { ...current, ...patch, id: current.id };
    StorageService.saveEmployees(
      employees.map((employee) => (employee.id === id ? updated : employee)),
    );
    return updated;
  }

  /**
   * نقل الحالة محلياً: «previous» يُترجَم إلى إبقاء السجل مع وسم.
   * لا نطبّق قاعدة «الموظف السابق» (سبب انتهاء الخدمة الإلزامي) لأنها
   * قاعدة أعمال والخادم هو مرجعها — هنا فقط نُبقي السجل ظاهراً كي لا
   * يفقد النموذج الأولي موظفاً بحركة واجهة.
   */
  async changeEmployeeStatus(id: string): Promise<Employee> {
    return this.updateEmployee(id, {});
  }

  // ── الكتب ───────────────────────────────────────────────────
  async loadTransactions(filter: TransactionListFilter = {}): Promise<Transaction[]> {
    return StorageService.loadTransactions().filter((transaction) => {
      if (filter.month !== undefined && transaction.month !== filter.month) return false;
      if (filter.status !== undefined && transaction.status !== filter.status) return false;
      if (filter.direction !== undefined && transaction.direction !== filter.direction) return false;
      return true;
    });
  }

  async createTransaction(input: CreateTransactionInput): Promise<Transaction> {
    const created = { ...input, id: `tr-${Date.now()}-${Math.floor(Math.random() * 1000)}` } as Transaction;
    StorageService.saveTransactions([created, ...StorageService.loadTransactions()]);
    return created;
  }

  async updateTransaction(id: string, patch: UpdateTransactionInput): Promise<Transaction> {
    const transactions = StorageService.loadTransactions();
    const current = transactions.find((transaction) => transaction.id === id);
    if (current === undefined) {
      throw new Error(`الكتاب بالمعرّف «${id}» غير موجود في التخزين المحلي.`);
    }
    // المرفقات تأتي بلا معرّف (القاعدة تولّده)، فنعيد معرّفات القائمة
    // السابقة بالترتيب — نفس ما تفعله القاعدة.
    const { attachments, ...rest } = patch;
    const merged: Transaction = {
      ...current,
      ...rest,
      id: current.id,
      ...(attachments !== undefined && {
        attachments: attachments.map(
          (attachment, index) => ({
            ...attachment,
            id: current.attachments[index]?.id ?? `att-${Date.now()}-${index}`,
          }),
        ),
      }),
    };
    StorageService.saveTransactions(
      transactions.map((transaction) => (transaction.id === id ? merged : transaction)),
    );
    return merged;
  }

  // ── روابط الكتاب بالمنتسب ───────────────────────────────────
  async loadLinksByTransaction(transactionId: string): Promise<TransactionEmployee[]> {
    return StorageService.loadTransactionEmployees().filter(
      (link) => link.transactionId === transactionId,
    );
  }

  async loadLinksByEmployee(employeeId: string): Promise<TransactionEmployee[]> {
    return StorageService.loadTransactionEmployees().filter(
      (link) => link.employeeId === employeeId,
    );
  }

  async createLink(input: CreateTransactionEmployeeInput): Promise<TransactionEmployee> {
    const result = TransactionEmployeeService.link(
      StorageService.loadTransactionEmployees(),
      input.transactionId,
      input.employeeId,
    );
    if (result.ok === false) {
      throw new Error(result.errors.join(' '));
    }
    StorageService.saveTransactionEmployees(result.value);
    const created = result.value.find(
      (link) => link.transactionId === input.transactionId && link.employeeId === input.employeeId,
    );
    if (created === undefined) {
      throw new Error('تعذّر تحديد العلاقة المُنشأة في التخزين المحلي.');
    }
    return created;
  }

  async updateLink(
    id: string,
    patch: { relationshipType?: string; notes?: string },
  ): Promise<TransactionEmployee> {
    const links = StorageService.loadTransactionEmployees();
    const current = links.find((link) => link.id === id);
    if (current === undefined) {
      throw new Error(`العلاقة بالمعرّف «${id}» غير موجودة في التخزين المحلي.`);
    }
    const updated: TransactionEmployee = {
      ...current,
      ...patch,
      id: current.id,
      ...(patch.relationshipType !== undefined && {
        relationshipType: patch.relationshipType as TransactionEmployee['relationshipType'],
      }),
    };
    StorageService.saveTransactionEmployees(
      links.map((link) => (link.id === id ? updated : link)),
    );
    return updated;
  }

  /**
   * إزالة سطر العلاقة فقط: يُحذف من جدول الروابط، ولا يُمس الكتاب ولا
   * الموظف — نفس سلوك الـAPI (قاعدة BR-05).
   */
  async removeLink(id: string): Promise<void> {
    const links = StorageService.loadTransactionEmployees();
    const target = links.find((link) => link.id === id);
    if (target === undefined) {
      throw new Error(`العلاقة بالمعرّف «${id}» غير موجودة في التخزين المحلي.`);
    }
    StorageService.saveTransactionEmployees(links.filter((link) => link.id !== id));
  }

  // ── الموقف اليومي ───────────────────────────────────────────
  async loadDailySituations(
    filter: DailySituationListFilter = {},
  ): Promise<DailySituationRecord[]> {
    return StorageService.loadDailySituations().filter((record) => {
      if (filter.employeeId !== undefined && record.employeeId !== filter.employeeId) return false;
      if (filter.date !== undefined && record.date !== filter.date) return false;
      if (filter.category !== undefined && record.category !== filter.category) return false;
      return true;
    });
  }

  async createDailySituation(input: CreateDailySituationInput): Promise<DailySituationRecord> {
    const created: DailySituationRecord = { ...input, id: input.id ?? `ds-${Date.now()}` };
    StorageService.saveDailySituations([...StorageService.loadDailySituations(), created]);
    return created;
  }

  async updateDailySituation(
    id: string,
    patch: Partial<DailySituationRecord>,
  ): Promise<DailySituationRecord> {
    const records = StorageService.loadDailySituations();
    const current = records.find((record) => record.id === id);
    if (current === undefined) {
      throw new Error(`قيد الموقف اليومي بالمعرّف «${id}» غير موجود في التخزين المحلي.`);
    }
    const updated: DailySituationRecord = { ...current, ...patch, id: current.id };
    StorageService.saveDailySituations(
      records.map((record) => (record.id === id ? updated : record)),
    );
    return updated;
  }

  // ── شؤون المنتسبين (قراءة) ──────────────────────────────────
  loadLeaves(employeeId?: string): Promise<EmployeeLeave[]> {
    return Promise.resolve(StorageService.loadLeaves().filter(byEmployee(employeeId)));
  }

  loadTimePermissions(employeeId?: string): Promise<EmployeeTimePermission[]> {
    return Promise.resolve(StorageService.loadTimePermissions().filter(byEmployee(employeeId)));
  }

  loadAssignments(employeeId?: string): Promise<EmployeeAssignment[]> {
    return Promise.resolve(StorageService.loadAssignments().filter(byEmployee(employeeId)));
  }

  loadCourses(employeeId?: string): Promise<EmployeeCourse[]> {
    return Promise.resolve(StorageService.loadCourses().filter(byEmployee(employeeId)));
  }

  // ── الخط الزمني ─────────────────────────────────────────────
  /**
   * الخط الزمني محلياً يُحسب في المتصفح من مصادره عبر `TimelineService`
   * — وهو نفس حساب الخادم، فلا يختلف العرض بين الوضعين.
   */
  async loadTimeline(filter: TimelineFilter): Promise<TimelineResultData> {
    return TimelineService.buildForEmployee({
      employeeId: filter.employeeId,
      leaves: StorageService.loadLeaves(),
      timePermissions: StorageService.loadTimePermissions(),
      assignments: StorageService.loadAssignments(),
      courses: StorageService.loadCourses(),
      transactions: StorageService.loadTransactions(),
      dailySituations: StorageService.loadDailySituations(),
      filter: {
        sourceTypes: filter.sourceTypes,
        dateFrom: filter.dateFrom,
        dateTo: filter.dateTo,
        searchText: filter.searchText,
        limit: filter.limit,
      },
    });
  }
}

/** فلترة سجلات شؤون المنتسبين بمنتسب واحد أو بلا تصفية. */
function byEmployee<T extends { employeeId: string }>(employeeId?: string) {
  return (record: T): boolean => employeeId === undefined || record.employeeId === employeeId;
}
