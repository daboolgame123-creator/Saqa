/**
 * personnelCatalogs — كتالوجات العرض العربية لنماذج شؤون المنتسبين
 * (PHASE 1 — نماذج شؤون المنتسبين)
 *
 * مبدأ التصميم المعتمد:
 * - القيم البرمجية (في employeeLeave / employeeTimePermission / employeeAssignment / employeeCourse)
 *   إنجليزية ثابتة (stable) قابلة للهجرة إلى PostgreSQL.
 * - النصوص العربية المعروضة للمستخدم معزولة هنا فقط — تعديل النص لا يمس البيانات أو الكود.
 * - Record<T, string> يفرض اكتمال الكتالوج: أي قيمة جديدة في الـ union تكسر البناء
 *   حتى يُضاف نصها العربي — فلا يظهر للمستخدم نص إنجليزي خام أبداً.
 *
 * نمط التصميم موازٍ لـ ACCESS_SCOPE_OPTIONS المتبع في accessScope.ts.
 */

import type {
  LeaveType,
  LeaveStatus,
} from './employeeLeave';
import type {
  TimePermissionStatus,
} from './employeeTimePermission';
import type {
  AssignmentType,
  AssignmentStatus,
} from './employeeAssignment';
import type {
  ParticipationType,
  ParticipationStatus,
} from './employeeCourse';

// ─── EmployeeLeave ───

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  annual: 'اعتيادية',
  sick: 'مرضية',
  excuse: 'استئذان',
  unpaid: 'بدون راتب',
  maternity: 'أمومة',
  transfer: 'تحويل',
  other: 'أخرى',
};

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  registered: 'مسجلة',
  pending_approval: 'قيد الاعتماد',
  approved: 'معتمدة',
  cancelled: 'ملغاة',
};

// ─── EmployeeTimePermission ───

export const TIME_PERMISSION_STATUS_LABELS: Record<TimePermissionStatus, string> = {
  registered: 'مسجلة',
  approved: 'معتمدة',
  cancelled: 'ملغاة',
};

// ─── EmployeeAssignment ───

export const ASSIGNMENT_TYPE_LABELS: Record<AssignmentType, string> = {
  task_assignment: 'تكليف بمهمة',
  delegation: 'إيفاد',
  shift_change: 'تحويل دوام',
  roster_transfer: 'تحويل دورية',
  other: 'أخرى',
};

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  registered: 'مسجل',
  in_progress: 'قيد التنفيذ',
  completed: 'منتهٍ',
  cancelled: 'ملغى',
};

// ─── EmployeeCourse ───

export const PARTICIPATION_TYPE_LABELS: Record<ParticipationType, string> = {
  participant: 'مشارك',
  trainee: 'متدرب',
  lecturer: 'محاضر',
  coordinator: 'منسق',
  other: 'أخرى',
};

export const PARTICIPATION_STATUS_LABELS: Record<ParticipationStatus, string> = {
  registered: 'مسجلة',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتملة',
  withdrew: 'منسحب',
  cancelled: 'ملغاة',
};
