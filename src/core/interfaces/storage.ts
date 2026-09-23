import {
  Transaction,
  Employee,
  EmployeeLeave,
  EmployeeTimePermission,
  EmployeeAssignment,
  EmployeeCourse,
  Request,
  TransactionEmployee,
  DailySituationRecord,
} from '../models';

/**
 * حمولة النسخة الاحتياطية الموحّدة (الإصدار 3.0)
 * ملاحظة: المجموعات الغائبة من ملف النسخة القديمة (2.0) لا تُلمس عند الاستعادة.
 * مجموعة transactionEmployees أُضيفت في PHASE 5؛ الملفات الأقدم (قبل إضافتها)
 * تُعامل كباقية: إن غابت ولم تكن transactions موجودة تُتخطى دون مساس.
 */
export interface BackupPayload {
  version: '3.0';
  timestamp: string;
  transactions: Transaction[];
  employees: Employee[];
  employeeLeaves: EmployeeLeave[];
  employeeTimePermissions: EmployeeTimePermission[];
  employeeAssignments: EmployeeAssignment[];
  employeeCourses: EmployeeCourse[];
  requests: Request[];
  /** علاقات الكتاب↔المنتسب (PHASE 5) — اختيارية لتوافق الملفات الأقدم. */
  transactionEmployees?: TransactionEmployee[];
  /**
   * قيود الموقف اليومي المستقلة (PHASE 6 / BR-13) — اختيارية لتوافق الملفات الأقدم.
   * غيابها في ملف قديم يُعامل كمجموعة غائبة: لا تُمَس القيود الحالية.
   */
  dailySituations?: DailySituationRecord[];
}

/** نتيجة استعادة النسخة الاحتياطية — بلا استثناءات */
export interface BackupRestoreResult {
  success: boolean;
  message: string;
  /** أسماء المجموعات التي كُتبت فعلاً */
  restored: string[];
  /** أسماء المجموعات الغائبة من الملف (لم تُمَس بياناتها الحالية) */
  skipped: string[];
}

/**
 * عقد محوّل التخزين (Storage Adapter Contract) — نقطة الفصل الوحيدة:
 * اليوم: StorageService (localStorage) — غداً: ApiStorageAdapter (PHASE 11/12) بنفس التوقيعات.
 *
 * ملاحظات:
 * - يصف هذا العقد العمليات الفعلية الحالية لـ StorageService فقط — لا دوال تخمينية لخدمة مستقبلية.
 * - توقيعات النسخ الاحتياطي مطابقة للتنفيذ الحالي (exportBackup / restoreFromBackup → BackupRestoreResult).
 * - الوضع الليلي جزء من العقد (loadDarkMode / saveDarkMode) بمفتاح واحد موحّد في STORAGE_KEYS.
 * - جميع التوقيعات بلا استثناءات (لا throw كجزء من العقد).
 */
export interface IDataStorage {
  // ─ المعاملات والمنتسبون ─
  loadTransactions(existingEmployees?: Employee[]): Transaction[];
  saveTransactions(transactions: Transaction[]): void;
  loadEmployees(): Employee[];
  saveEmployees(employees: Employee[]): void;

  // ─ الوضع الليلي (Dark Mode) ─
  /** تُرجع null إذا لم تُضبط الحالة مسبقاً (يتولى App.tsx الرجوع لتفضيل النظام) */
  loadDarkMode(): boolean | null;
  saveDarkMode(value: boolean): void;

  // ── مجموعات شؤون المنتسبين (PHASE 2 — منفَّذة فعلياً في StorageService) ──
  loadLeaves(): EmployeeLeave[];
  saveLeaves(leaves: EmployeeLeave[]): void;
  loadTimePermissions(): EmployeeTimePermission[];
  saveTimePermissions(permissions: EmployeeTimePermission[]): void;
  loadAssignments(): EmployeeAssignment[];
  saveAssignments(assignments: EmployeeAssignment[]): void;
  loadCourses(): EmployeeCourse[];
  saveCourses(courses: EmployeeCourse[]): void;

  // ── الطلبات (PHASE 2 — إضافة لاحقة ضمن شؤون المنتسبين) ──
  loadRequests(): Request[];
  saveRequests(requests: Request[]): void;

  // ── علاقات الكتاب↔المنتسب (PHASE 5) ──
  loadTransactionEmployees(): TransactionEmployee[];
  saveTransactionEmployees(relations: TransactionEmployee[]): void;

  // ── الموقف اليومي المستقل (PHASE 6 / BR-13) ──
  loadDailySituations(): DailySituationRecord[];
  saveDailySituations(records: DailySituationRecord[]): void;
  /**
   * هل مجموعة الموقف اليومي محفوظة فعلاً في التخزين؟
   * يُستخدم للتمييز بين مفتاح غائب (تُشتق القيود من البيانات المورثة) ومجموعة
   * فارغة صريحة (تُحترم كما هي) — بنفس منطق النسخ الاحتياطي (غائب ⇒ لا يُمس).
   */
  hasDailySituations(): boolean;

  // ── النسخ الاحتياطي ─
  exportBackup(): string;
  restoreFromBackup(jsonString: string): BackupRestoreResult;
}
