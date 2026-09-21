import {
  Transaction,
  Employee,
  EmployeeLeave,
  EmployeeTimePermission,
  EmployeeAssignment,
  EmployeeCourse,
} from '../models';

export interface StorageKeys {
  TRANSACTIONS: string;
  EMPLOYEES: string;
  DARK_MODE: string;

  // ── مفاتيح مجموعات شؤون المنتسبين (PHASE 2) ──
  EMPLOYEE_LEAVES: string;
  EMPLOYEE_TIME_PERMISSIONS: string;
  EMPLOYEE_ASSIGNMENTS: string;
  EMPLOYEE_COURSES: string;
}

/**
 * حمولة النسخة الاحتياطية الموحّدة (الإصدار 3.0)
 * ملاحظة: المجموعات الغائبة من ملف النسخة القديمة (2.0) لا تُلمس عند الاستعادة.
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
 * - لا يتضمن هذا العقد أي دوال للوضع الليلي (خارج نطاق PHASE 2).
 * - جميع التوقيعات بلا استثناءات (لا throw كجزء من العقد).
 */
export interface IDataStorage {
  // ─ المعاملات والمنتسبون (موجود — موحَّد التوقيع) ─
  loadTransactions(): Transaction[];
  saveTransactions(transactions: Transaction[]): void;
  loadEmployees(): Employee[];
  saveEmployees(employees: Employee[]): void;

  // ── مجموعات شؤون المنتسبين (PHASE 2) ──
  loadLeaves(): EmployeeLeave[];
  saveLeaves(leaves: EmployeeLeave[]): void;
  loadTimePermissions(): EmployeeTimePermission[];
  saveTimePermissions(permissions: EmployeeTimePermission[]): void;
  loadAssignments(): EmployeeAssignment[];
  saveAssignments(assignments: EmployeeAssignment[]): void;
  loadCourses(): EmployeeCourse[];
  saveCourses(courses: EmployeeCourse[]): void;

  // ── النسخ الاحتياطي (موحَّد التوقيع) ─
  exportBackup(): string;
  restoreFromBackup(jsonString: string): BackupRestoreResult;
}
