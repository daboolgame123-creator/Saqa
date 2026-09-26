/**
 * القيم المسموحة المشتركة بين مُحقِّقات Phase 10.
 *
 * المصدر الوحيد لكل قيمة: كتالوجات `src/core/models` المعتمدة أو قيد CHECK
 * في `server/migrations/*.sql`. لا تُخترق قيمة هنا ولا تُشتق من بيانات.
 *
 * ملاحظة على استخراج unions: مفاتيح `Record<Union, string>` تكمل الـunion،
 * فأي قيمة جديدة في النموذج تكسر هذا الملف حتى تُضاف — وهذا هو المطلوب
 * (لا قيمة تُقبل بصمت).
 */
import {
  ATTACHMENT_TYPE_LABELS,
  TRANSACTION_CATEGORY_LABELS,
  TRANSACTION_DIRECTION_LABELS,
  TRANSACTION_PRIORITY_LABELS,
  TRANSACTION_STATUS_LABELS,
} from '../../../../src/core/models/transaction';
import {
  ASSIGNMENT_STATUS_LABELS,
  ASSIGNMENT_TYPE_LABELS,
  DAILY_SITUATION_CATEGORY_LABELS,
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
  PARTICIPATION_STATUS_LABELS,
  PARTICIPATION_TYPE_LABELS,
  TIME_PERMISSION_STATUS_LABELS,
} from '../../../../src/core/models/personnelCatalogs';

export const TRANSACTION_DIRECTIONS = Object.keys(TRANSACTION_DIRECTION_LABELS);
export const TRANSACTION_CATEGORIES = Object.keys(TRANSACTION_CATEGORY_LABELS);
export const TRANSACTION_STATUSES = Object.keys(TRANSACTION_STATUS_LABELS);
export const TRANSACTION_PRIORITIES = Object.keys(TRANSACTION_PRIORITY_LABELS);
export const ATTACHMENT_TYPES = Object.keys(ATTACHMENT_TYPE_LABELS);

export const LEAVE_TYPES = Object.keys(LEAVE_TYPE_LABELS);
export const LEAVE_STATUSES = Object.keys(LEAVE_STATUS_LABELS);
export const TIME_PERMISSION_STATUSES = Object.keys(TIME_PERMISSION_STATUS_LABELS);
export const ASSIGNMENT_TYPES = Object.keys(ASSIGNMENT_TYPE_LABELS);
export const ASSIGNMENT_STATUSES = Object.keys(ASSIGNMENT_STATUS_LABELS);
export const PARTICIPATION_TYPES = Object.keys(PARTICIPATION_TYPE_LABELS);
export const PARTICIPATION_STATUSES = Object.keys(PARTICIPATION_STATUS_LABELS);
export const DAILY_SITUATION_CATEGORIES = Object.keys(DAILY_SITUATION_CATEGORY_LABELS);

/** نطاقات الرؤية المعتمدة (AccessScope في accessScope.ts). */
export const ACCESS_SCOPES = [
  'PublicToEmployees',
  'SpecificEmployees',
  'Administrative',
  'DirectorOnly',
] as const;

/** حالات الموظف المعتمدة (employees.status في migration 0001). */
export const EMPLOYEE_STATUSES = ['active', 'former'] as const;

/** أسباب انتهاء الخدمة المعتمدة (migration 0001 / الخطة §13). */
export const SERVICE_END_REASONS = ['انتهت خدمته', 'تقاعد', 'انفصال', 'استقالة'] as const;

/** نطاقات الاستهداف الإداري (transactions.target_scope). */
export const TARGET_SCOPES = ['all', 'specific', 'department', 'none'] as const;

/** أدوار رابط الكتاب بالمنتسب (BR-05). */
export const RELATIONSHIP_TYPES = ['subject', 'recipient', 'assigned', 'beneficiary'] as const;

/** أنواع السجلات الإدارية القابلة للربط بالموقف اليومي (migration 0004). */
export const RELATED_RECORD_KINDS = [
  'transaction',
  'leave',
  'time_permission',
  'assignment',
  'course',
] as const;

/** فئات الموظف المعتمدة (employees.category في migration 0001). */
export const EMPLOYEE_CATEGORIES = ['منتسب', 'باحث'] as const;

/**
 * أنواع مصادر الخط الزمني القابلة للقراءة الآن.
 * `appointment` و`transfer` و`other` محجوزة لمصادر مستقبلية لم تُنشأ
 * بيانات لها بعد (الخطة §22: «مصادر مستقبلية محجوزة»)، فلا تُقبل هنا
 * حتى لا يُطلب مصدر غير موجود.
 */
export const TIMELINE_SOURCE_TYPES = [
  'leave',
  'timePermission',
  'assignment',
  'course',
  'transaction',
  'dailySituation',
] as const;
