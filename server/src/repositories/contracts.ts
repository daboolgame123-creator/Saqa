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
import type { AccessScope } from '../../../src/core/models/accessScope';
import type {
  EmployeeLeave,
  EmployeeLeaveBalance,
  LeaveLedgerEntry,
  LeaveLedgerUnit,
  LeaveMovementType,
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
  /**
   * حالة الأرشفة الناعمة (Phase 16 — §32).
   *
   * الثلاثة `null` معاً ⇐ كتاب نشط. بعد الأرشفة تحمل الطوابع الثلاثة،
   * وتُصفَّر كلها بالاستعادة — فلا يمكن أن يكون الكتاب «مؤرشفاً بلا فاعل»
   * أو «نشطاً له سبب حذف» (قيد في الترحيل 0009).
   */
  deletedAt: string | null;
  deletedBy: string | null;
  deleteReason: string | null;
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

/**
 * سجل مرفق كامل كما في جدول `attachments` (Phase 14).
 *
 * هذا هو سجل الـmetadata الذي تشترطه §30: stable ID · original filename ·
 * MIME · size · created date · hash · storage key · OCR status · integrity.
 * الملف المادي ليس هنا — البايتات على القرص تحت `storage_key`.
 *
 * ملاحظة على التوافق: `fileSize` و`uploadDate` يبقان نصَّي عرض كما كانتا
 * منذ Phase 9 (قيمة `file_size` نصية في القاعدة، والقاعدة `NOT NULL`).
 * لذلك تقرأ هنا القيم الرقمية من `sizeBytes` و`createdDate` اللذين أضافهما
 * الترحيل 0007، ويبقى العرض القديم متاحاً للتوافق.
 */
export interface AttachmentRecord {
  /** stable ID — معرّف السقاية، وليس اسم الملف (§30). */
  id: string;
  /** الكتاب المالك (علاقة واحدة إلى كثير). */
  transactionId: string;
  /** الاسم المعروض للمرفق (قابل للتغيير دون المساس بالهوية). */
  name: string;
  /** نوع المرفق من كتالوج الخطة. */
  type: string;
  /** الحجم كنص عرض (قيمة القائمة، للتوافق). */
  fileSize: string;
  /** تاريخ الرفع كنص عرض (قيمة القائمة، للتوافق). */
  uploadDate: string;
  /** اسم الملف الأصلي القادم من المصدر، محفوظاً كما ورد (§30). */
  originalFilename: string;
  /** نوع MIME المكتشف من المحتوى، أو `null` لصف قديم لم يُفحص. */
  mimeType: string | null;
  /** الحجم الحقيقي بالبايت، أو `null` لصف لم يُقَس. */
  sizeBytes: number | null;
  /** تاريخ الإنشاء كتاريخ نظيف، أو `null`. */
  createdDate: string | null;
  /** بصمة المحتوى `sha256:<hex>`، أو `null`. */
  contentHash: string | null;
  /** مفتاح التخزين المركزي (مشتقّ من stable ID، لا من اسم الملف). */
  storageKey: string | null;
  /** حالة OCR — تبقى `null` حتى Phase 17 (لا قيم مخترعة). */
  ocrState: string | null;
  /** حالة سلامة الملف: `verified` · `corrupted` · `missing` · `null`(غير مفحوص). */
  integrityState: string | null;
  /** ختم الإنشاء من النظام. */
  createdAt: string;
}

/**
 * إدخال إنشاء مرفق **مخزَّن** بعد كتاب (رفع مستقل — Phase 14).
 *
 * الاسم مختلف عن `CreateAttachmentInput` أعلاه عن قصد: ذلك مرفق بيانات
 * وصفية يُكتب مع الكتاب بلا بايتات (شكل Phase 9/10 القائم، ولم يتغيّر)،
 * وهذا مرفق له ملف فعلي في التخزين المركزي. دمجهما كان سيخفي الفرق الجوهري:
 * أحدهما لا يحتاج فحوصاً والآخر يحتاجها كلها.
 */
export interface CreateStoredAttachmentInput {
  /** الكتاب المالك. */
  transactionId: string;
  /** الاسم المعروض. */
  name: string;
  /** نوع المرفق من الكتالوج. */
  type: string;
  /** الحجم كنص عرض (للتوافق مع الشكل القائم). */
  fileSize: string;
  /** تاريخ الرفع كنص عرض. */
  uploadDate: string;
  /** اسم الملف الأصلي كما ورد من المصدر. */
  originalFilename: string;
  /** نوع MIME المكتشف من المحتوى. */
  mimeType: string;
  /** الحجم الحقيقي بالبايت. */
  sizeBytes: number;
  /** تاريخ الإنشاء `YYYY-MM-DD`. */
  createdDate: string;
  /** بصمة المحتوى. */
  contentHash: string;
  /**
   * مفتاح التخزين (مشتقّ من الـstable ID)، أو `null` في الرفع الأول.
   *
   * `null` لا سلسلة فارغة: فهرس `attachments_storage_key_unique` في PostgreSQL
   * يسمح بعدة `NULL` ولا يسمح بتكرار السلسلة الفارغة، فقيمة فارغة كانت
   * سترفض الرفع الثاني. يُكتب المفتاح الحقيقي بـ`setStorageKey` بعد معرفة
   * المعرّف.
   */
  storageKey: string | null;
  /** حالة السلامة الابتدائية بعد الحفظ والفحص. */
  integrityState: string;
}

/**
 * عقد مستودع المرفقات (Phase 14).
 *
 * **لا حذف هنا**: الحذف الإداري للكتاب/المرفق في Phase 16 (Soft Delete)،
 * فلا يُخترع مسار حذف أفقي في هذه المرحلة.
 */
export interface AttachmentRepository {
  /** مرفق واحد بمعرّفه، أو `null`. */
  findById(id: string): Promise<AttachmentRecord | null>;
  /** مرفقات كتاب واحد (مرفق واحد أو عدة — §30 Multiple Attachments). */
  listByTransaction(transactionId: string): Promise<AttachmentRecord[]>;
  /** ينشئ مرفقاً مخزَّناً جديداً ويعيد السجل الكامل بمعرّفه. */
  create(input: CreateStoredAttachmentInput): Promise<AttachmentRecord>;
  /**
   * يكتب مفتاح التخزين بعد معرفة الـstable ID.
   *
   * **لماذا دالة منفصلة**: المفتاح مشتقّ من معرّف تولّدته القاعدة، فلا
   * يكون معروفاً وقت `INSERT`. وعمود `storage_key` له فهرس فريد، فلا يجوز
   * أن يُترك فارغاً في INSERT (صف فارغ ثانٍ يخالف الفهرس). لذلك يُكتب
   * مرتين عمداً: قيمة مؤقتة ثم المفتاح الحقيقي.
   */
  setStorageKey(id: string, storageKey: string): Promise<void>;
  /** يحدّث حالة السلامة بعد فحص على القرص (الـmetadata فقط). */
  updateIntegrityState(id: string, state: string | null): Promise<void>;
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
  | 'id'
  | 'createdAt'
  | 'readAt'
  | 'isRead'
  | 'attachments'
  | 'employeeIds'
  | 'month'
  // نسخة القفل التفاؤلي (Phase 17): لا تُدخل عند الإنشاء — القيمة 1 من
  // DEFAULT القاعدة، ولا يحق للعميل تثبيت نسخة مخترعة.
  | 'version'
> & {
  employeeLinks?: CreateTransactionEmployeeInput[];
  attachments?: CreateAttachmentInput[];
  isRead?: boolean;
  readAt?: string;
  importedAt?: string;
};

/**
 * فلترة قائمة الكتب.
 *
 * `archived` (Phase 16 — §32) يفصل الرؤيتين:
 * - `exclude` (الافتراضي، وهو سلوك كل القوائم النشطة): المؤرشف مستبعد من
 *   الاستعلام نفسه لا بعد قراءته.
 * - `only`: المؤرشف وحده — للاستعلام التاريخي الإداري.
 */
export interface TransactionListFilter {
  month?: string;
  status?: TransactionStatus;
  direction?: TransactionDirection;
  limit?: number;
  offset?: number;
  archived?: 'exclude' | 'only';
}

/**
 * قيد نطاق الرؤية على الكتب (Phase 13) — **صورته بيانات لا قرار**:
 * من يبني هذا القيد هو `authorization/accessScope.ts` من هوية الجلسة،
 * ودور المستودع تنفيذه في الاستعلام وحده.
 *
 * - `visibilityIn`: قيم `visibility` المقروءة بلا إتاحة صريحة (§12).
 *   قائمة فارغة = لا كتاب مرئي (fail-closed).
 * - `availableToEmployeeId`: عند تحديده تُضاف الكتب التي له فيها إتاحة
 *   سارية (صف غير مسحوب في `transaction_availability`).
 * - `availabilityScope`: النطاق الذي تُقبل فيه الإتاحة بديلاً عن الظهور
 *   المباشر (§9.3 → `SpecificEmployees`). بغيابه لا تُطبَّق الإتاحة.
 */
export interface TransactionScopeFilter {
  visibilityIn: readonly AccessScope[];
  availableToEmployeeId?: string;
  availabilityScope?: AccessScope;
}

/**
 * خيارات قراءة كتاب واحد (Phase 16).
 *
 * `includeArchived` وحده يفتح قراءة كتاب مؤرشف، وهو لمسارين إداريين
 * فقط (عرض الأرشيف والاستعادة)؛ كل القراءات النشطة تتركه `false` فيبقى
 * الكتاب المؤرشف محجوباً كغير المرئي تماماً (404 لا كشف وجود).
 */
export interface TransactionReadOptions {
  includeArchived?: boolean;
}

/** إدخال أرشفة كتاب (Phase 16 — §32؛ وأُضيف إليه شرط النسخة في Phase 17). */
export interface ArchiveTransactionInput {
  /** الحساب المنفّذ من هوية الجلسة — لا يُؤخذ من جسم الطلب. */
  deletedByUserId: string | null;
  /** «سبب الحذف عند الحاجة» — نص حر اختياري (§32). */
  reason?: string | null;
  /**
   * النسخة التي قرأها العميل قبل الأرشفة (Phase 17 — §33).
   * الأرشفة تكتب فقط إن بقيت النسخة كما قرأها الفاعل؛ وإلا `stale`.
   */
  expectedVersion: number;
}

/**
 * فشل كتابة مقيدة بنسخة متوقعة (Phase 17 — §33) دون تأثر أي صف.
 *
 * الأسباب الثلاثة متمايزة لأن استجابتها مختلفة:
 * - `notFound`: لا صف بالمعرّف أصلاً ⇒ 404 (لا كشف وجود).
 * - `stale`: الصف موجود لكن نسخته تغيّرت منذ قراءة العميل ⇒ 409
 *   Conflict — لا كتابة فوق الأحدث.
 * - `stateMismatch`: النسخة مطابقة لكن حالة الصف لا تقبل العملية
 *   (تعديل/أرشفة مؤرشف، أو استعادة نشط) ⇒ 404 بسلوك Phase 16.
 */
export type VersionedWriteMiss =
  | { outcome: 'notFound' }
  | { outcome: 'stale'; currentVersion: number }
  | { outcome: 'stateMismatch' };

/** ناتج كتابة مقيدة بنسخة متوقعة: نجاح مع السجل، أو فشل مُصنَّف. */
export type VersionedWriteOutcome =
  | { outcome: 'updated'; record: TransactionRecord }
  | VersionedWriteMiss;

/** حالة الأرشفة السابقة كما تُقرأ داخل معاملة الاستعادة (مصدر حدث التدقيق). */
export interface ArchivedTransactionState {
  deletedAt: string;
  deletedBy: string | null;
  deleteReason: string | null;
}

/**
 * ناتج الاستعادة (Phase 17): يضيف قراءة الحالة السابقة إلى فشل مُصنَّف —
 * الحالة السابقة والكتابة تأتيان من معاملة واحدة، فلا يُسجَّل حدث
 * تدقيق بحالة قبل لم تُستعَد فعلاً.
 */
export type RestoreTransactionOutcome =
  | { outcome: 'restored'; record: TransactionRecord; previous: ArchivedTransactionState }
  | VersionedWriteMiss;

/** عقد مستودع المعاملات. */
export interface TransactionRepository {
  /**
   * يعيد الكتاب مع employeeIds (من transaction_employees) ومرفقاته.
   * `scope` يقيّد النتيجة على ما يراه الفاعل؛ والعائد `null` إن لم يكن
   * الكتاب مرئياً له — فيُترجم عند الطبقة الأعلى إلى 404 (لا كشف وجود).
   * الكتاب المؤرشف لا يُقرأ هنا إلا بـ`includeArchived` (Phase 16).
   */
  findById(
    id: string,
    scope?: TransactionScopeFilter,
    options?: TransactionReadOptions,
  ): Promise<TransactionRecord | null>;
  /** القائمة مقيدة بـ`scope` **قبل** الترقيم، فلا صفحة ناقصة ولا تسرّب. */
  list(
    filter?: TransactionListFilter,
    scope?: TransactionScopeFilter,
  ): Promise<TransactionRecord[]>;
  create(input: CreateTransactionInput): Promise<TransactionRecord>;
  /**
   * تعديل جزئي بقفل تفاؤلي (Phase 17 — §33).
   *
   * الجملة واحدة: `WHERE id AND version = expectedVersion AND
   * deleted_at IS NULL` مع `version = version + 1`. تأثر صف واحد ⇐ نجاح؛
   * صف صفر ⇐ فشل مُصنَّف (`VersionedWriteMiss`) بلا أي كتابة.
   */
  update(
    id: string,
    patch: Partial<CreateTransactionInput>,
    expectedVersion: number,
  ): Promise<VersionedWriteOutcome>;
  /**
   * أرشفة ناعمة (Phase 16 — §32) بقفل تفاؤلي (Phase 17 — §33): لا `DELETE`،
   * بل طوابع حالة على الصف نفسه مقيدة بالنسخة المتوقعة والحالة النشطة.
   *
   * الشرط `deleted_at IS NULL` جزء من جملة `UPDATE` نفسها: الأرشفة ذرّية،
   * وأرشفة كتاب مؤرشف بنسخة حاسمة تُصنَّف `stateMismatch` (404 بسلوك
   * Phase 16)، وبنسخة قديمة تُصنَّف `stale` (409). أيٌّ منهما بلا كتابة.
   * الروابط والمرفقات وسجلات الإتاحة وسجل الاطلاع والتدقيق تبقى كما هي.
   */
  archive(
    id: string,
    input: ArchiveTransactionInput,
  ): Promise<VersionedWriteOutcome>;
  /**
   * استعادة كتاب مؤرشف (Phase 16 — §32) بقفل تفاؤلي (Phase 17 — §33).
   *
   * قراءة الحالة السابقة للتدقيق والكتابة تجريان **داخل معاملة واحدة**
   * (`withTransaction`) فلا تتغيّر الحالة بينهما. الفشل مُصنَّف كما في
   * `update`؛ وكتابة الاستعادة نفسها مقيدة بـ`version` و`deleted_at IS NOT NULL`
   * فلا تُستعاد نسخة أقدم بصمت.
   */
  restore(id: string, expectedVersion: number): Promise<RestoreTransactionOutcome>;
}

/** صف إتاحة كتاب لمنتسب (جدول `transaction_availability` — Phase 13). */
export interface TransactionAvailabilityRecord {
  id: string;
  transactionId: string;
  employeeId: string;
  grantedAt: string;
  /** `null` = الإتاحة سارية؛ ووجود تاريخ = سُحبت (§9.3: السحب لا يحذف السجل). */
  revokedAt: string | null;
}

/**
 * عقد مستودع إتاحة الكتب (§9.3/§9.4 و§29).
 *
 * لا سحب جماعي ولا حذف: العمليات المعتمدة في §29 أربع — منح، منح جماعي
 * (يُنفَّذ على مرتبطي الكتاب من طبقة الخدمة)، سحب، وفحص للسجل.
 */
export interface TransactionAvailabilityRepository {
  /** سجل الإتاحة الكامل لكتاب: الصفوف السارية والمسحوبة (فحص الإدارة §29). */
  listByTransaction(transactionId: string): Promise<TransactionAvailabilityRecord[]>;
  /**
   * يمنح إتاحة سارية لمنتسبين، ويتجاوز من له إتاحة سارية بالفعل.
   * يعيد الصفوف **المنشأة في هذه الدعوة** — لا كل السجل.
   */
  grant(
    transactionId: string,
    employeeIds: readonly string[],
  ): Promise<TransactionAvailabilityRecord[]>;
  /** يسحب الإتاحة السارية لمنتسب واحد؛ `false` إن لم تكن سارية أصلاً. */
  revoke(transactionId: string, employeeId: string): Promise<boolean>;
}

/** إدخال رابط كتاب-موظف. */
export type CreateTransactionEmployeeLink = CreateTransactionEmployeeInput & {
  transactionId: string;
};

/** عقد جدول الروابط Many-to-Many (BR-05). */
export interface TransactionEmployeeRepository {
  /**
   * روابط كتاب واحد. `scope` يقصر النتيجة على الكتب المرئية للفاعل
   * (Phase 13): الرابط يتبع رؤية كتابه، فلا يُقرأ رابط كتاب غير مرئي.
   */
  listByTransaction(
    transactionId: string,
    scope?: TransactionScopeFilter,
  ): Promise<TransactionEmployee[]>;
  /** روابط منتسب واحد، مقيدة بنفس نطاق رؤية الكتب. */
  listByEmployee(
    employeeId: string,
    scope?: TransactionScopeFilter,
  ): Promise<TransactionEmployee[]>;
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

/** سجل زمنية كامل: نموذج المجال نفسه — المدة بالدقائق محفوظة (§14.3). */
export type TimePermissionRecord = EmployeeTimePermission;

/** عقد سجلات الأذونات الزمنية. */
export interface TimePermissionRepository {
  findById(id: string): Promise<TimePermissionRecord | null>;
  list(
    filter?: PersonnelListFilter & { date?: string; status?: TimePermissionStatus },
  ): Promise<TimePermissionRecord[]>;
  /** durationMinutes قيمة محسوبة ومخزَّنة (لا يشتقّها المستودع). */
  create(input: Omit<TimePermissionRecord, 'id'>): Promise<TimePermissionRecord>;
  update(
    id: string,
    patch: Partial<Omit<TimePermissionRecord, 'id'>>,
  ): Promise<TimePermissionRecord | null>;
  /**
   * مجموع دقائق الزمنيات في مدى تواريخ لنفس المنتسب — أساس مؤشر
   * تجاوز 4 ساعات أسبوعياً (§14.4) الذي **لا يمنع التسجيل**.
   */
  sumMinutesBetween(
    employeeId: string,
    fromDate: string,
    toDate: string,
  ): Promise<number>;
  /** زمنيات غير محوّلة بعد (Phase 18: منع التحويل المكرر لنفس السجل). */
  listUnconverted(employeeId: string, excludeId?: string): Promise<TimePermissionRecord[]>;
}

/** حقول الرصيد القابلة للكتابة من محرك القواعد وحده (Phase 18). */
export type LeaveBalanceNumericPatch = Partial<
  Pick<
    EmployeeLeaveBalance,
    | 'annualBalance'
    | 'annualServiceDays'
    | 'annualEarnedDays'
    | 'annualRemainderDays'
    | 'annualCarryoverDays'
    | 'annualPendingDays'
    | 'emergencyBalance'
    | 'emergencyRemainderMinutes'
    | 'unpaidDays'
  >
>;

/** عقد رصيد الإجازات (Phase 18) — كاتب واحد فقط: محرك القواعد. */
export interface LeaveBalanceRepository {
  findByEmployeeYear(employeeId: string, year: string): Promise<EmployeeLeaveBalance | null>;
  /**
   * آخر رصيد **قبل** سنة معيّنة — أساس حساب الترحيل السنوي (§14.1).
   * `null` إن لم توجد سنة سابقة (أول سنة في النظام).
   */
  findLatestBefore(
    employeeId: string,
    year: string,
  ): Promise<EmployeeLeaveBalance | null>;
  list(filter: { employeeId?: string; year?: string }): Promise<EmployeeLeaveBalance[]>;
  create(input: CreateEmployeeLeaveBalanceInput): Promise<EmployeeLeaveBalance>;
  /**
   * تحديث الرصيد **بشروط قيمته الحالية** (قفل تفاؤلي على الصف).
   *
   * جملة واحدة `UPDATE … WHERE` على كل الحقول الرقمية معاً: إمّا تُكتب
   * الحركة وتُحدَّث الأرصدة في معاملة واحدة، أو لا شيء. لا تُعدَّل خانة
   * رصيد منفردة عبر مسار مستقل — الحركات كلها في `leave_ledger`.
   */
  updateNumeric(
    id: string,
    current: LeaveBalanceNumericPatch,
    patch: LeaveBalanceNumericPatch,
  ): Promise<EmployeeLeaveBalance | null>;
}

/** إدخال إنشاء رصيد سنة (نقطة بداية موثّقة أو تهيئة المحرك). */
export interface CreateEmployeeLeaveBalanceInput {
  employeeId: string;
  year: string;
  annualBalance?: number;
  annualServiceDays?: number;
  annualEarnedDays?: number;
  annualRemainderDays?: number;
  annualCarryoverDays?: number;
  annualPendingDays?: number;
  emergencyBalance?: number;
  emergencyRemainderMinutes?: number;
  unpaidDays?: number;
  notes?: string;
}

/** إدخال إنشاء حركة رصيد. */
export interface CreateLeaveLedgerEntryInput {
  employeeId: string;
  movementType: LeaveMovementType;
  amount: number;
  balanceAfter: number;
  unit: LeaveLedgerUnit;
  occurredOn: string;
  leaveId?: string;
  leaveType?: LeaveType;
  timePermissionId?: string;
  reversesLedgerId?: string;
  notes?: string;
}

/** فلترة سجل الحركات. */
export interface LeaveLedgerListFilter {
  employeeId?: string;
  year?: number;
  leaveId?: string;
  leaveType?: LeaveType;
  timePermissionId?: string;
  movementType?: LeaveMovementType;
}

/** عقد سجل حركات الرصيد (Phase 18) — محرّك القواعد هو الكاتب الوحيد. */
export interface LeaveLedgerRepository {
  /** حركة بمعرّفها، أو `null`. */
  findById(id: string): Promise<LeaveLedgerEntry | null>;
  list(filter?: LeaveLedgerListFilter): Promise<LeaveLedgerEntry[]>;
  create(input: CreateLeaveLedgerEntryInput): Promise<LeaveLedgerEntry>;
  /**
   * الحركات التي لم تُعكس بعد — أساس منع الخصم/العكس المكرر.
   * الحركات المعكوسة تُستثنى بالاستعلام (LEFT JOIN على `reverses_ledger_id`).
   */
  listActive(filter: LeaveLedgerListFilter): Promise<LeaveLedgerEntry[]>;
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
