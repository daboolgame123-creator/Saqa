/**
 * تنفيذ مصدر البيانات عبر الـAPI (Phase 10).
 *
 * كل دالة: بناء المسار ← نداء العميل ← تحويل DTO ← نموذج المجال.
 * لا منطق أعمال هنا ولا تحقق: التحقق على الخادم (المرجع النهائي)،
 * وخدمات المجال في الواجهة (`TransactionService` وغيرها) تبقى كما هي.
 *
 * نقطة مهمة: كل عملية كتابة تُعيد **السجل المُعاد من الخادم** لا
 * الكائن المرسل، لأن القاعدة تولّد المعرّف (uuid) وتشتق الشهر. حالة
 * الواجهة تُبنى من هذه القيم لا من معرّفات مؤقتة.
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
import { getApiClient, type ApiClient } from './apiClient';
import {
  toDailySituation,
  toEmployee,
  toTransaction,
  toTransactionEmployee,
  type DailySituationDto,
  type EmployeeDto,
  type TimelineResponseDto,
  type TransactionDto,
  type TransactionEmployeeDto,
} from './mappers';

/**
 * يُزيل الحقول غير المعرَّفة قبل الإرسال.
 * `exactOptionalPropertyTypes` مفعّل: مفتاح بقيمة `undefined` لا يساوي
 * غيابه، والخادم يرفض الحقول بصيغة `null` صراحةً.
 */
function definedFields<T extends object>(source: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

/** ينشئ تنفيذ الـAPI. `client` يُحقن ليسهل الاختبار بلا شبكة. */
export function createApiDataAdapter(client: ApiClient = getApiClient()): IDataAdapter {
  /** يهرّب المعرّف في المسار — المعرّفات نصوص قادمة من الشبكة. */
  const segment = (id: string): string => encodeURIComponent(id);

  return {
    kind: 'api',

    // ── الموظفون (بند 1) ───────────────────────────────────────
    async loadEmployees(filter: EmployeeListFilter = {}): Promise<Employee[]> {
      const rows = await client.get<EmployeeDto[]>('/employees', {
        status: filter.status,
        search: filter.search,
      });
      return rows.map(toEmployee);
    },

    async createEmployee(input: CreateEmployeeInput): Promise<Employee> {
      return toEmployee(await client.post<EmployeeDto>('/employees', definedFields(input)));
    },

    async updateEmployee(id: string, patch: Partial<Employee>): Promise<Employee> {
      const updated = await client.patch<EmployeeDto>(
        `/employees/${segment(id)}`,
        definedFields(patch),
      );
      return toEmployee(updated);
    },

    async changeEmployeeStatus(
      id: string,
      input: { status: string; serviceEndReason?: string; notes?: string },
    ): Promise<Employee> {
      const changed = await client.post<EmployeeDto>(
        `/employees/${segment(id)}/status`,
        definedFields(input),
      );
      return toEmployee(changed);
    },

    // ── الكتب (بند 2) ──────────────────────────────────────────
    async loadTransactions(filter: TransactionListFilter = {}): Promise<Transaction[]> {
      const rows = await client.get<TransactionDto[]>('/transactions', {
        month: filter.month,
        status: filter.status,
        direction: filter.direction,
      });
      return rows.map(toTransaction);
    },

    async createTransaction(input: CreateTransactionInput): Promise<Transaction> {
      return toTransaction(
        await client.post<TransactionDto>('/transactions', definedFields(input)),
      );
    },

    async updateTransaction(id: string, patch: UpdateTransactionInput): Promise<Transaction> {
      const updated = await client.patch<TransactionDto>(
        `/transactions/${segment(id)}`,
        definedFields(patch),
      );
      return toTransaction(updated);
    },

    // ── روابط الكتاب بالمنتسب (بند 3) ─────────────────────────
    async loadLinksByTransaction(transactionId: string): Promise<TransactionEmployee[]> {
      const rows = await client.get<TransactionEmployeeDto[]>('/transaction-employees', {
        transactionId,
      });
      return rows.map(toTransactionEmployee);
    },

    async loadLinksByEmployee(employeeId: string): Promise<TransactionEmployee[]> {
      const rows = await client.get<TransactionEmployeeDto[]>('/transaction-employees', {
        employeeId,
      });
      return rows.map(toTransactionEmployee);
    },

    async createLink(input: CreateTransactionEmployeeInput): Promise<TransactionEmployee> {
      const created = await client.post<TransactionEmployeeDto>(
        '/transaction-employees',
        definedFields(input),
      );
      return toTransactionEmployee(created);
    },

    async updateLink(
      id: string,
      patch: { relationshipType?: string; notes?: string },
    ): Promise<TransactionEmployee> {
      const updated = await client.patch<TransactionEmployeeDto>(
        `/transaction-employees/${segment(id)}`,
        definedFields(patch),
      );
      return toTransactionEmployee(updated);
    },

    async removeLink(id: string): Promise<void> {
      await client.remove(`/transaction-employees/${segment(id)}`);
    },

    // ── الموقف اليومي (بند 4) ──────────────────────────────────
    async loadDailySituations(
      filter: DailySituationListFilter = {},
    ): Promise<DailySituationRecord[]> {
      const rows = await client.get<DailySituationDto[]>('/daily-situations', {
        employeeId: filter.employeeId,
        date: filter.date,
        category: filter.category,
      });
      return rows.map(toDailySituation);
    },

    async createDailySituation(input: CreateDailySituationInput): Promise<DailySituationRecord> {
      return toDailySituation(
        await client.post<DailySituationDto>('/daily-situations', definedFields(input)),
      );
    },

    async updateDailySituation(
      id: string,
      patch: Partial<DailySituationRecord>,
    ): Promise<DailySituationRecord> {
      const updated = await client.patch<DailySituationDto>(
        `/daily-situations/${segment(id)}`,
        definedFields(patch),
      );
      return toDailySituation(updated);
    },

    // ── شؤون المنتسبين (بند 5) — قراءة فقط في الواجهة حالياً ───
    // الـDTO لنماذج شؤون المنتسبين هو نموذج المجال نفسه، فالتحويل
    // مطابق (isometry) بلا نسخ زائد.
    loadLeaves(employeeId?: string): Promise<EmployeeLeave[]> {
      return client.get<EmployeeLeave[]>('/leaves', { employeeId });
    },

    loadTimePermissions(employeeId?: string): Promise<EmployeeTimePermission[]> {
      return client.get<EmployeeTimePermission[]>('/time-permissions', { employeeId });
    },

    loadAssignments(employeeId?: string): Promise<EmployeeAssignment[]> {
      return client.get<EmployeeAssignment[]>('/assignments', { employeeId });
    },

    loadCourses(employeeId?: string): Promise<EmployeeCourse[]> {
      return client.get<EmployeeCourse[]>('/courses', { employeeId });
    },

    // ── الخط الزمني (بند 6) — قراءة مشتقة فقط ──────────────────
    // الأحداث تُحسب على الخادم من مصادرها الأصلية. الواجهة لا تعيد
    // الحساب: حسابان مختلفان مصدر اختلاف في العرض بين جهازين.
    loadTimeline(filter: TimelineFilter): Promise<TimelineResultData> {
      return client.get<TimelineResponseDto>('/timeline', {
        employeeId: filter.employeeId,
        sourceTypes: filter.sourceTypes?.join(','),
        dateFrom: filter.dateFrom,
        dateTo: filter.dateTo,
        searchText: filter.searchText,
        limit: filter.limit,
      });
    },
  };
}
