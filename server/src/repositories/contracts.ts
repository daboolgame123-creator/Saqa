/**
 * عقود طبقة Repositories (Phase 9) — الواجهة التي يعتمد عليها Phase 10.
 *
 * القاعدة: لا منطق أعمال هنا ولا قواعد مخترعة — عقود نقل فقط بين
 * نماذج المجال (src/core/models) وPostgreSQL، مع الحفاظ على هوية الكيانات.
 */
import type {
  Employee,
} from '../../../src/core/models/employee';
import type {
  Attachment,
  Transaction,
  TransactionDirection,
  TransactionStatus,
} from '../../../src/core/models/transaction';
import type {
  TransactionEmployee,
  TransactionEmployeeRole,
} from '../../../src/core/models/transactionEmployee';
import type {
  EmployeeLeave,
  LeaveStatus,
  LeaveType,
} from '../../../src/core/models/employeeLeave';
import type {
  EmployeeTimePermission,
  TimePermissionStatus,
} from '../../../src/core/models/employeeTimePermission';
import type {
  AssignmentStatus,
  AssignmentType,
  EmployeeAssignment,
} from '../../../src/core/models/employeeAssignment';
import type {
  EmployeeCourse,
  ParticipationStatus,
  ParticipationType,
} from '../../../src/core/models/employeeCourse';
import type {
  DailySituationCategory,
  DailySituationRecord,
  DailySituationRelatedRecord,
} from '../../../src/core/models/dailySituation';

/** حالة موظف كما تُخزَّن (النماذج لا تحملها — الخطة §7.3/§32). */
export type EmployeeStatusValue = 'active' | 'former';

/** سجل موظف كامل: نموذج المجال + الحالة الراهنة والحقول المضافة في الخطة §7.2. */
export interface EmployeeRecord extends Employee {
  status: EmployeeStatusValue;
  phone?: string;
  photo?: string;
  createdAt: string;
  updatedAt: string;
}

/** سطر من سجل تغييرات حالة الموظف. */
export interface EmployeeStatusHistoryRecord {
  id: string;
  employeeId: string;
  status: EmployeeStatusValue;
  serviceEndReason: string | null;
  notes: string | null;
  changedAt: string;
}

/** سجل معاملة كامل: نموذج المجال + توقيتات النظام (updated/imported). */
export interface TransactionRecord extends Transaction {
  updatedAt: string;
  importedAt: string | null;
}

/** إدخال إنشاء موظف. */
export type CreateEmployeeInput = Omit<Employee, 'id' | 'userId'> & {
  userId?: string;
  status?: EmployeeStatusValue;
  phone?: string;
  photo?: string;
};

/**
 * إدخال تعديل جزئي — الحقول غير المذكورة تبقى كما هي.
 * userId = null يفك ربط الحساب (الربط مخزَّن في users.employee_id).
 */
export type UpdateEmployeeInput = Partial<Omit<CreateEmployeeInput, 'userId'>> & {
  userId?: string | null;
};

/** إدخال تغيير الحالة (يكتب الجدول + السجل التاريخي في معاملة واحدة). */
export interface ChangeEmployeeStatusInput {
  status: EmployeeStatusValue;
  serviceEndReason?: string;
  notes?: string;
}

/** فلترة قائمة الموظفين. */
export interface EmployeeListFilter {
  /** الافتراضي 'all' — لا إخفاء لبيانات حقيقية صامتة. */
  status?: 'active' | 'former' | 'all';
  /** بحث جزئي في الاسم أو رقم الشارة. */
  search?: string;
}

/** عقد مستودع الموظفين. */
export interface EmployeeRepository {
  findById(id: string): Promise<EmployeeRecord | null>;
  list(filter?: EmployeeListFilter): Promise<EmployeeRecord[]>;
  create(input: CreateEmployeeInput): Promise<EmployeeRecord>;
  update(id: string, patch: UpdateEmployeeInput): Promise<EmployeeRecord | null>;
  /** ينقل الحالة ويسجّلها تاريخياً في معاملة واحدة — لا حذف (§32). */
  changeStatus(
    id: string,
    input: ChangeEmployeeStatusInput,
  ): Promise<{ employee: EmployeeRecord; history: EmployeeStatusHistoryRecord } | null>;
  listStatusHistory(employeeId: string): Promise<EmployeeStatusHistoryRecord[]>;
}

/** رابط موظف يُنشأ داخل عملية الكتاب. */
export interface CreateTransactionEmployeeInput {
  employeeId: string;
  relationshipType?: TransactionEmployeeRole;
  notes?: string;
}

/** مرفق يُنشأ مع الكتاب (بيانات وصفية فقط — لا ملفات). */
export interface CreateAttachmentInput {
  name: string;
  type: string;
  fileSize: string;
  uploadDate: string;
  originalFilename?: string;
  mimeType?: string;
  contentHash?: string;
  storageKey?: string;
  ocrState?: string;
}

/**
 * إدخال إنشاء كتاب:
 * - month تُشتق من date آلياً (deriveMonth) فلا تُدخل.
 * - الروابط والمرفقات تُكتب في نفس المعاملة (لا كيانات يتيمة).
 */
export type CreateTransactionInput = Omit<
  Transaction,
  'id' | 'createdAt' | 'readAt' | 'isRead' | 'attachments' | 'employeeIds' | 'month'
> & {
  employeeLinks?: CreateTransactionEmployeeInput[];
  attachments?: CreateAttachmentInput[];
  isRead?: boolean;
  readAt?: string;
  importedAt?: string;
};

/** فلترة قائمة الكتب. */
export interface TransactionListFilter {
  month?: string;
  status?: TransactionStatus;
  direction?: TransactionDirection;
  limit?: number;
  offset?: number;
}

/** عقد مستودع المعاملات. */
export interface TransactionRepository {
  /** يعيد الكتاب مع employeeIds (من transaction_employees) ومرفقاته. */
  findById(id: string): Promise<TransactionRecord | null>;
  list(filter?: TransactionListFilter): Promise<TransactionRecord[]>;
  create(input: CreateTransactionInput): Promise<TransactionRecord>;
  update(id: string, patch: Partial<CreateTransactionInput>): Promise<TransactionRecord | null>;
  // لا delete: الكتاب لا يُحذف في الاستخدام العادي (§13/§32) — Soft Delete في Phase 16.
}
/** إدخال رابط كتاب-موظف. */
export type CreateTransactionEmployeeLink = CreateTransactionEmployeeInput & {
  transactionId: string;
};

/** عقد جدول الروابط Many-to-Many (BR-05). */
export interface TransactionEmployeeRepository {
  listByTransaction(transactionId: string): Promise<TransactionEmployee[]>;
  listByEmployee(employeeId: string): Promise<TransactionEmployee[]>;
  add(input: CreateTransactionEmployeeLink): Promise<TransactionEmployee>;
  update(
    id: string,
    patch: { relationshipType?: TransactionEmployeeRole; notes?: string },
  ): Promise<TransactionEmployee | null>;
  /** يزيل الرابط فقط — لا الكتاب ولا الموظف. */
  remove(id: string): Promise<boolean>;
}

/** فلترة عامة لسجلات شؤون المنتسبين. */
export interface PersonnelListFilter {
  employeeId?: string;
}

/** عقد سجلات الإجازات. */
export interface LeaveRepository {
  findById(id: string): Promise<EmployeeLeave | null>;
  list(filter?: PersonnelListFilter & { status?: LeaveStatus; type?: LeaveType }): Promise<EmployeeLeave[]>;
  create(input: Omit<EmployeeLeave, 'id'>): Promise<EmployeeLeave>;
  update(id: string, patch: Partial<Omit<EmployeeLeave, 'id'>>): Promise<EmployeeLeave | null>;
}

/** سجل زمنية كامل: نموذج المجال + المدة بالدقائق إن سُلِّمت (§14.3). */
export interface TimePermissionRecord extends EmployeeTimePermission {
  durationMinutes?: number;
}

/** عقد سجلات الأذونات الزمنية. */
export interface TimePermissionRepository {
  findById(id: string): Promise<TimePermissionRecord | null>;
  list(
    filter?: PersonnelListFilter & { date?: string; status?: TimePermissionStatus },
  ): Promise<TimePermissionRecord[]>;
  /** durationMinutes اختياري — تمريره من الاستدعاء (لا اشتقاق داخل قاعدة البيانات). */
  create(input: Omit<TimePermissionRecord, 'id'>): Promise<TimePermissionRecord>;
  update(
    id: string,
    patch: Partial<Omit<TimePermissionRecord, 'id'>>,
  ): Promise<TimePermissionRecord | null>;
}

/** عقد سجلات التكليفات. */
export interface AssignmentRepository {
  findById(id: string): Promise<EmployeeAssignment | null>;
  list(
    filter?: PersonnelListFilter & { status?: AssignmentStatus; type?: AssignmentType },
  ): Promise<EmployeeAssignment[]>;
  create(input: Omit<EmployeeAssignment, 'id'>): Promise<EmployeeAssignment>;
  update(
    id: string,
    patch: Partial<Omit<EmployeeAssignment, 'id'>>,
  ): Promise<EmployeeAssignment | null>;
}

/** عقد سجلات الدورات. */
export interface CourseRepository {
  findById(id: string): Promise<EmployeeCourse | null>;
  list(
    filter?: PersonnelListFilter & {
      status?: ParticipationStatus;
      participationType?: ParticipationType;
    },
  ): Promise<EmployeeCourse[]>;
  create(input: Omit<EmployeeCourse, 'id'>): Promise<EmployeeCourse>;
  update(id: string, patch: Partial<Omit<EmployeeCourse, 'id'>>): Promise<EmployeeCourse | null>;
}

/** فلترة الموقف اليومي. */
export interface DailySituationListFilter {
  employeeId?: string;
  date?: string;
  category?: DailySituationCategory;
}

/** عقد الموقف اليومي المستقل (BR-13). */
export interface DailySituationRepository {
  findById(id: string): Promise<DailySituationRecord | null>;
  list(filter?: DailySituationListFilter): Promise<DailySituationRecord[]>;
  create(
    input: Omit<DailySituationRecord, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<DailySituationRecord>;
  update(
    id: string,
    patch: Partial<Omit<DailySituationRecord, 'id' | 'createdAt'>>,
  ): Promise<DailySituationRecord | null>;
}

/** إعادة تصدير الأنواع المستخدمة خارج العقود. */
export type { DailySituationRelatedRecord, TransactionEmployee };
