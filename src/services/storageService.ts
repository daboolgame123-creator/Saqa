import {
  Transaction,
  Employee,
  EmployeeLeave,
  EmployeeTimePermission,
  EmployeeAssignment,
  EmployeeCourse,
  Request,
  TransactionEmployee,
} from '../core/models';
import type {
  IDataStorage,
  BackupPayload,
  BackupRestoreResult,
} from '../core/interfaces/storage';
import {
  INITIAL_TRANSACTIONS,
  INITIAL_EMPLOYEES,
  INITIAL_EMPLOYEE_LEAVES,
  INITIAL_EMPLOYEE_TIME_PERMISSIONS,
  INITIAL_EMPLOYEE_ASSIGNMENTS,
  INITIAL_EMPLOYEE_COURSES,
} from '../data/mockData';
import { AuthService } from './authService';

export const STORAGE_KEYS = {
  TRANSACTIONS: 'zatiya_prototype_transactions_v2',
  EMPLOYEES: 'zatiya_prototype_employees_v3',
  DARK_MODE: 'zatiya_prototype_dark_mode_v1',

  // ── مجموعات شؤون المنتسبين (PHASE 2) ──
  EMPLOYEE_LEAVES: 'zatiya_prototype_employee_leaves_v1',
  EMPLOYEE_TIME_PERMISSIONS: 'zatiya_prototype_employee_time_permissions_v1',
  EMPLOYEE_ASSIGNMENTS: 'zatiya_prototype_employee_assignments_v1',
  EMPLOYEE_COURSES: 'zatiya_prototype_employee_courses_v1',
  REQUESTS: 'zatiya_prototype_requests_v1',

  // ── علاقات الكتاب↔المنتسب (PHASE 5) ──
  TRANSACTION_EMPLOYEES: 'zatiya_prototype_transaction_employees_v1',
} as const;

export class StorageService {
  // ───────────── مساعدان عامّان لمجموعات شؤون المنتسبين (تقليل التكرار) ────────────

  /** قراءة مجموعة من localStorage — تُرجع [] عند الغياب أو التلف (بلا استثناءات) */
  private static loadCollection<T>(key: string): T[] {
    try {
      const saved = localStorage.getItem(key);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      // تحصين بنيوي أدنى: العناصر يجب أن تكون كائنات
      return parsed.filter((item) => item !== null && typeof item === 'object');
    } catch (e) {
      console.error(`Error loading collection [${key}] from localStorage:`, e);
      return [];
    }
  }

  /** كتابة مجموعة إلى localStorage — تفشل بهدوء مع تسجيل الخطأ (بلا استثناءات) */
  private static saveCollection<T>(key: string, items: T[]): void {
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch (e) {
      console.error(`Error saving collection [${key}] to localStorage:`, e);
    }
  }

  /**
   * قراءة مجموعة مع الرجوع لبيانات الاختبار عند غياب مفتاحها فقط.
   * المجموعة الفارغة المحفوظة تبقى فارغة ولا تستبدل ببيانات mock.
   */
  private static loadCollectionOrFallback<T>(key: string, fallback: T[]): T[] {
    try {
      const saved = localStorage.getItem(key);
      if (saved === null) return fallback;

      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return fallback;
      return parsed.filter((item) => item !== null && typeof item === 'object');
    } catch (e) {
      console.error(`Error loading collection [${key}] from localStorage:`, e);
      return fallback;
    }
  }

  // ──────────────────── مجموعات شؤون المنتسبين (PHASE 2) ─────────────────────

  static loadLeaves(): EmployeeLeave[] {
    return this.loadCollectionOrFallback<EmployeeLeave>(
      STORAGE_KEYS.EMPLOYEE_LEAVES,
      INITIAL_EMPLOYEE_LEAVES
    );
  }

  static saveLeaves(leaves: EmployeeLeave[]): void {
    this.saveCollection(STORAGE_KEYS.EMPLOYEE_LEAVES, leaves);
  }

  static loadTimePermissions(): EmployeeTimePermission[] {
    return this.loadCollectionOrFallback<EmployeeTimePermission>(
      STORAGE_KEYS.EMPLOYEE_TIME_PERMISSIONS,
      INITIAL_EMPLOYEE_TIME_PERMISSIONS
    );
  }

  static saveTimePermissions(permissions: EmployeeTimePermission[]): void {
    this.saveCollection(STORAGE_KEYS.EMPLOYEE_TIME_PERMISSIONS, permissions);
  }

  static loadAssignments(): EmployeeAssignment[] {
    return this.loadCollectionOrFallback<EmployeeAssignment>(
      STORAGE_KEYS.EMPLOYEE_ASSIGNMENTS,
      INITIAL_EMPLOYEE_ASSIGNMENTS
    );
  }

  static saveAssignments(assignments: EmployeeAssignment[]): void {
    this.saveCollection(STORAGE_KEYS.EMPLOYEE_ASSIGNMENTS, assignments);
  }

  static loadCourses(): EmployeeCourse[] {
    return this.loadCollectionOrFallback<EmployeeCourse>(
      STORAGE_KEYS.EMPLOYEE_COURSES,
      INITIAL_EMPLOYEE_COURSES
    );
  }

  static saveCourses(courses: EmployeeCourse[]): void {
    this.saveCollection(STORAGE_KEYS.EMPLOYEE_COURSES, courses);
  }

  static loadRequests(): Request[] {
    return this.loadCollection<Request>(STORAGE_KEYS.REQUESTS);
  }

  static saveRequests(requests: Request[]): void {
    this.saveCollection(STORAGE_KEYS.REQUESTS, requests);
  }

  // ──────────────────── علاقات الكتاب↔المنتسب (PHASE 5) ────────────────────

  /** قراءة العلاقات المخزّنة — [] عند الغياب؛ الترحيل من employeeIds مسؤولية طبقة التنسيق. */
  static loadTransactionEmployees(): TransactionEmployee[] {
    return this.loadCollection<TransactionEmployee>(STORAGE_KEYS.TRANSACTION_EMPLOYEES);
  }

  static saveTransactionEmployees(relations: TransactionEmployee[]): void {
    this.saveCollection(STORAGE_KEYS.TRANSACTION_EMPLOYEES, relations);
  }

  // ──────────────────────── الوضع الليلي (Dark Mode) ────────────────────────

  /** قراءة حالة الوضع الليلي — تُرجع null عند عدم ضبطها مسبقاً (بلا استثناءات) */
  static loadDarkMode(): boolean | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DARK_MODE);
      if (saved === null) return null;
      return saved === 'true';
    } catch (e) {
      console.error('Error loading dark mode from localStorage:', e);
      return null;
    }
  }

  /** حفظ حالة الوضع الليلي — يفشل بهدوء مع تسجيل الخطأ (بلا استثناءات) */
  static saveDarkMode(value: boolean): void {
    try {
      localStorage.setItem(STORAGE_KEYS.DARK_MODE, String(value));
    } catch (e) {
      console.error('Error saving dark mode to localStorage:', e);
    }
  }

  static loadTransactions(existingEmployees?: Employee[]): Transaction[] {
    const employees = existingEmployees || this.loadEmployees();
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // تطبيع البيانات وتثبيت الصلاحيات وعلاقات المنتسبين للبيانات المخزنة مسبقاً
          return parsed.map((tr) => AuthService.normalizeTransaction(tr, employees));
        }
      }
    } catch (e) {
      console.error('Error loading transactions from localStorage:', e);
    }
    return INITIAL_TRANSACTIONS.map((tr) => AuthService.normalizeTransaction(tr, employees));
  }

  static saveTransactions(transactions: Transaction[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
    } catch (e) {
      console.error('Error saving transactions to localStorage:', e);
    }
  }

  static loadEmployees(): Employee[] {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Error loading employees from localStorage:', e);
    }
    return INITIAL_EMPLOYEES;
  }

  static saveEmployees(employees: Employee[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
    } catch (e) {
      console.error('Error saving employees to localStorage:', e);
    }
  }

  /**
   * تصدير نسخة احتياطية — الإصدار 3.0 (يشمل مجموعات شؤون المنتسبين)
   */
  static exportBackup(): string {
    const backupData: BackupPayload = {
      version: '3.0',
      timestamp: new Date().toISOString(),
      transactions: this.loadTransactions(),
      employees: this.loadEmployees(),
      employeeLeaves: this.loadLeaves(),
      employeeTimePermissions: this.loadTimePermissions(),
      employeeAssignments: this.loadAssignments(),
      employeeCourses: this.loadCourses(),
      requests: this.loadRequests(),
      transactionEmployees: this.loadTransactionEmployees(),
    };
    return JSON.stringify(backupData, null, 2);
  }

  /**
   * استعادة نسخة احتياطية — بلا استثناءات (نتيجة صريحة دائماً).
   *
   * قواعد التوافق التراجعي:
   * - المجموعة الغائبة من الملف (نسخة 2.0 قديمة) **لا تلمس** البيانات الحالية.
   * - المجموعة الموجودة كمصفوفة تُستعاد حتى لو كانت فارغة [].
   * - المفتاح الموجود بقيمة غير مصفوفة يُتخطى دون مساس.
   */
  static restoreFromBackup(jsonString: string): BackupRestoreResult {
    const restored: string[] = [];
    const skipped: string[] = [];
    const invalid: BackupRestoreResult = {
      success: false,
      message: 'ملف النسخة الاحتياطية غير صالح أو تالف.',
      restored: [],
      skipped: [],
    };

    let data: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return invalid;
      data = parsed as Record<string, unknown>;
    } catch {
      return invalid;
    }

    // المعاملات والمنتسبون (نفس السلوك السابق)
    if (Array.isArray(data.transactions)) {
      this.saveTransactions(data.transactions as Transaction[]);
      restored.push('transactions');
    } else {
      skipped.push('transactions');
    }
    if (Array.isArray(data.employees)) {
      this.saveEmployees(data.employees as Employee[]);
      restored.push('employees');
    } else {
      skipped.push('employees');
    }

    // مجموعات شؤون المنتسبين (PHASE 2): تُكتب فقط إن كانت موجودة كمصفوفة
    const personnelGroups: Array<{
      field: 'employeeLeaves' | 'employeeTimePermissions' | 'employeeAssignments' | 'employeeCourses' | 'requests';
      key: string;
    }> = [
      { field: 'employeeLeaves', key: STORAGE_KEYS.EMPLOYEE_LEAVES },
      { field: 'employeeTimePermissions', key: STORAGE_KEYS.EMPLOYEE_TIME_PERMISSIONS },
      { field: 'employeeAssignments', key: STORAGE_KEYS.EMPLOYEE_ASSIGNMENTS },
      { field: 'employeeCourses', key: STORAGE_KEYS.EMPLOYEE_COURSES },
      { field: 'requests', key: STORAGE_KEYS.REQUESTS },
    ];

    for (const group of personnelGroups) {
      const value = data[group.field];
      if (Array.isArray(value)) {
        this.saveCollection(group.key, value);
        restored.push(group.field);
      } else {
        skipped.push(group.field);
      }
    }

    // علاقات الكتاب↔المنتسب (PHASE 5): تُستعاد إن وُجدت في الملف، وإلا لا تُمَس
    // الحالية (بنفس سياسة المجموعات الغائبة).
    if (Array.isArray(data.transactionEmployees)) {
      this.saveTransactionEmployees(data.transactionEmployees as TransactionEmployee[]);
      restored.push('transactionEmployees');
    } else {
      skipped.push('transactionEmployees');
    }

    const baseMessage = 'تم استعادة النسخة الاحتياطية بنجاح.';
    const message =
      skipped.length > 0
        ? `${baseMessage} (تم تخطي المجموعات غير الموجودة في الملف: ${skipped.join('، ')} — دون المساس ببياناتها الحالية)`
        : baseMessage;

    return { success: true, message, restored, skipped };
  }
}

/**
 * ⛔ لا تحذف هذا السطر: فحص مطابقة StorageService لعقد IDataStorage وقت الترجمة.
 *
 * ملاحظة تقنية موثقة: تعذّر استخدام `implements IDataStorage` مباشرةً لأن أعضاء
 * StorageService دوال ثابتة (static)، و`implements` في TypeScript يفحص جانب النسخة
 * (instance side) فقط. تحويل الخدمة إلى نسخة يتطلب تعديل كل مستدعيها في App.tsx
 * وهو خارج نطاق PHASE 2. هذا الثابت يفرض نفس الفحص: أي انحراف عن العقد يُفشل البناء.
 */
const storageServiceConformsToIDataStorage: IDataStorage = StorageService;
void storageServiceConformsToIDataStorage;
