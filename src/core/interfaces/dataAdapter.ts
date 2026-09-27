/**
 * عقد مصدر البيانات في الواجهة (Phase 10).
 *
 * نقطة الفصل الوحيدة بين React والتخزين. قبل هذه المرحلة كان ذلك
 * `IDataStorage` وهو **متزامن** (localStorage) — ولا يمكن لعميل HTTP
 * غير متزامن أن يحقّقه. لذلك هذا عقد **غير متزامن** جديد، و`IDataStorage`
 * محفوظ كما هو ليخدم الـLocal Adapter والوضع الليلي.
 *
 * لماذا لا نعدّل `IDataStorage`: تغيير توقيعه يمسّ 28 استدعاءً في
 * `App.tsx` و`StorageService` دفعة واحدة، ويُلغي LocalStorage كخيار
 * للوضع الليلي. العقدان معاً أنظف من كسر العقد القديم.
 *
 * عمليات القراءة/الكتابة مفردة لكل سجل (repository adapters) لا
 * «استبدال المجموعة كاملة»: هذا ما يجعل الكتابة عبر الخادم ولاية
 * على سجل واحد، ويمتنع عن إعادة إرسال كل الجدول عند أي تغيير.
 */
import type {
  Employee,
  EmployeeLeave,
  EmployeeTimePermission,
  EmployeeAssignment,
  EmployeeCourse,
  Transaction,
  TransactionEmployee,
  DailySituationRecord,
  TimelineEntry,
  TimelineSourceType,
} from '../models';

/** فلترة قائمة الموظفين الواردة من الواجهة. */
export interface EmployeeListFilter {
  status?: 'active' | 'former' | 'all';
  search?: string;
}

/** فلترة قائمة الكتب الواردة من الواجهة. */
export interface TransactionListFilter {
  month?: string;
  status?: Transaction['status'];
  direction?: Transaction['direction'];
}

/** فلترة الموقف اليومي. */
export interface DailySituationListFilter {
  employeeId?: string;
  date?: string;
  category?: DailySituationRecord['category'];
}

/** فلاتر الخط الزمني (نفس خيارات Phase 7). */
export interface TimelineFilter {
  employeeId: string;
  sourceTypes?: TimelineSourceType[];
  dateFrom?: string;
  dateTo?: string;
  searchText?: string;
  limit?: number;
}

/** نتيجة تجميع الخط الزمني. */
export interface TimelineResultData {
  entries: TimelineEntry[];
  countsBySource: Record<string, number>;
  totalCount: number;
}

/**
 * المدخلات المرسلة للخادم.
 *
 * `id` غير مطلوب في الإنشاء: القاعدة تولّده (uuid) ويعيده الخادم،
 * وتُحدَّث حالة الواجهة بالمعرّف الحقيقي بعد الحفظ.
 */
export type CreateEmployeeInput = Omit<Employee, 'id' | 'userId'> & {
  userId?: string;
  status?: string;
  phone?: string;
  photo?: string;
};

export type CreateTransactionInput = Omit<
  Transaction,
  'id' | 'month' | 'createdAt' | 'readAt' | 'isRead' | 'attachments' | 'employeeIds'
> & {
  employeeLinks?: { employeeId: string; relationshipType?: string; notes?: string }[];
  attachments?: {
    name: string;
    type: string;
    fileSize: string;
    uploadDate: string;
  }[];
};

export type CreateTransactionEmployeeInput = {
  transactionId: string;
  employeeId: string;
  relationshipType?: string;
  notes?: string;
};

export type CreateDailySituationInput = Omit<DailySituationRecord, 'id'> & { id?: string };

/**
 * تعديل جزئي للكتاب.
 *
 * المرفقات هنا **بيانات وصفية بلا معرّف**: القاعدة تولّد معرّف المرفق
 * وتستبدل قائمة المرفقات كاملة. لذلك يختلف شكلها عن `Attachment` في
 * نموذج المجال (التي يحمل `previewUrl`/`isImage` العرضيين).
 */
export interface AttachmentInput {
  name: string;
  type: string;
  fileSize: string;
  uploadDate: string;
}

/** ما يُرسَل في تعديل الكتاب. */
export type UpdateTransactionInput = Partial<
  Omit<Transaction, 'attachments' | 'employeeIds'>
> & {
  attachments?: AttachmentInput[];
};

/**
 * عقد مصدر البيانات.
 *
 * كل تنفيذ (API أو Local) يلتزم بالتوقيع نفسه، فتبقى الواجهة ignorant
 * تماماً بمكان البيانات. هذه هي «repository adapters» في نص الخطة.
 */
export interface IDataAdapter {
  /** اسم التنفيذ («api» أو «local») — للتشخيص لا لمنطق عمل. */
  readonly kind: 'api' | 'local';

  // ── الموظفون (بند 1) ─────────────────────────────────────────
  loadEmployees(filter?: EmployeeListFilter): Promise<Employee[]>;
  createEmployee(input: CreateEmployeeInput): Promise<Employee>;
  updateEmployee(id: string, patch: Partial<Employee>): Promise<Employee>;
  /**
   * نقل حالة الموظف — لا حذف (الخطة §32).
   * الواجهة تستدعيه بدل الحذف؛ سبب انتهاء الخدمة إلزامي عند 'former'
   * فيتحقق منه الخادم (قيد CHECK) ويصل العميل خطأ 400 واضحاً.
   */
  changeEmployeeStatus(
    id: string,
    input: { status: string; serviceEndReason?: string; notes?: string },
  ): Promise<Employee>;

  // ── الكتب (بند 2) ────────────────────────────────────────────
  loadTransactions(filter?: TransactionListFilter): Promise<Transaction[]>;
  createTransaction(input: CreateTransactionInput): Promise<Transaction>;
  updateTransaction(id: string, patch: UpdateTransactionInput): Promise<Transaction>;

  // ── روابط الكتاب بالمنتسب (بند 3) ───────────────────────────
  loadLinksByTransaction(transactionId: string): Promise<TransactionEmployee[]>;
  loadLinksByEmployee(employeeId: string): Promise<TransactionEmployee[]>;
  createLink(input: CreateTransactionEmployeeInput): Promise<TransactionEmployee>;
  updateLink(
    id: string,
    patch: { relationshipType?: string; notes?: string },
  ): Promise<TransactionEmployee>;
  /** يزيل سطر العلاقة فقط — لا الكتاب ولا الموظف. */
  removeLink(id: string): Promise<void>;

  // ── الموقف اليومي (بند 4) ───────────────────────────────────
  loadDailySituations(filter?: DailySituationListFilter): Promise<DailySituationRecord[]>;
  createDailySituation(input: CreateDailySituationInput): Promise<DailySituationRecord>;
  updateDailySituation(
    id: string,
    patch: Partial<DailySituationRecord>,
  ): Promise<DailySituationRecord>;

  // ── شؤون المنتسبين (بند 5) — قراءة فقط في الواجهة حالياً ──────
  loadLeaves(employeeId?: string): Promise<EmployeeLeave[]>;
  loadTimePermissions(employeeId?: string): Promise<EmployeeTimePermission[]>;
  loadAssignments(employeeId?: string): Promise<EmployeeAssignment[]>;
  loadCourses(employeeId?: string): Promise<EmployeeCourse[]>;

  // ── الخط الزمني (بند 6) — قراءة مشتقة فقط ───────────────────
  loadTimeline(filter: TimelineFilter): Promise<TimelineResultData>;
}
