/**
 * DTOs شؤون المنتسبين — Phase 10 (بند 5)، ووُسّعت في Phase 18.
 *
 * الأربعة كيانات المستقلة، كل واحد موظف واحد عبر employeeId (القاعدة 7).
 * المرجع: §7.8/§7.11 وPhase 3.
 *
 * Phase 18 — العقد صار **مصدراً واحداً** للمدة: `durationMinutes` في نموذج
 * المجال `EmployeeTimePermission` نفسه، لا إضافة جزئية في المستودع وثالثة
 * في الـDTO. لا تُشتق المدة مرتين (§14.3).
 */
import type {
  EmployeeLeave,
  EmployeeLeaveBalance,
  LeaveLedgerEntry,
} from '../../../../src/core/models/employeeLeave';
import type { EmployeeTimePermission } from '../../../../src/core/models/employeeTimePermission';
import type { EmployeeAssignment } from '../../../../src/core/models/employeeAssignment';
import type { EmployeeCourse } from '../../../../src/core/models/employeeCourse';

export type EmployeeLeaveDto = EmployeeLeave;
export type CreateEmployeeLeaveDto = Omit<EmployeeLeave, 'id'>;
export type UpdateEmployeeLeaveDto = Partial<CreateEmployeeLeaveDto>;

/** سجل الزمنية — المدة بالدقائق محفوظة في النموذج (§14.3). */
export type EmployeeTimePermissionDto = EmployeeTimePermission;
export type CreateEmployeeTimePermissionDto = Omit<EmployeeTimePermissionDto, 'id'>;
export type UpdateEmployeeTimePermissionDto = Partial<CreateEmployeeTimePermissionDto>;

export type EmployeeAssignmentDto = EmployeeAssignment;
export type CreateEmployeeAssignmentDto = Omit<EmployeeAssignment, 'id'>;
export type UpdateEmployeeAssignmentDto = Partial<CreateEmployeeAssignmentDto>;

export type EmployeeCourseDto = EmployeeCourse;
export type CreateEmployeeCourseDto = Omit<EmployeeCourse, 'id'>;
export type UpdateEmployeeCourseDto = Partial<CreateEmployeeCourseDto>;

/** فلترة مشتركة لسجلات شؤون المنتسبين (employeeId + تخصّص كل مورد). */
export interface PersonnelListQuery {
  employeeId?: string;
}

// ══════════════════════════════════════════════════════════════════
// Phase 18 — الأرصدة وسجل الحركات
// ══════════════════════════════════════════════════════════════════

/** رصيد سنة واحدة كما يعيده الخادم (محسوب بالمحرك لا بالواجهة). */
export type LeaveBalanceDto = EmployeeLeaveBalance;

/** حركة رصيد واحدة — نفس شكل سجل الـledger (§15). */
export type LeaveLedgerEntryDto = LeaveLedgerEntry;

/** فلترة الأرصدة: بمنتسب واحد وسنة، أو الكل. */
export interface LeaveBalanceListQuery {
  employeeId?: string;
  year?: string;
}

/** فلترة سجل الحركات — فلاتر قراءة فقط. */
export interface LeaveLedgerListQuery {
  employeeId?: string;
  year?: number;
  leaveId?: string;
  movementType?: string;
}

/** أنواع الرصيد القابلة للافتتاح/التصحيح — `annual` و`emergency` فقط. */
export type BalanceLeaveTypeDto = 'annual' | 'emergency';

/** نقطة بداية افتتاحية موثّقة (§34). */
export interface OpeningBalanceDto {
  employeeId: string;
  year: string;
  leaveType: BalanceLeaveTypeDto;
  days: number;
  occurredOn: string;
  notes: string;
}

/** تصحيح إداري موثّق (§15). */
export interface LeaveAdjustmentDto {
  employeeId: string;
  year: string;
  leaveType: BalanceLeaveTypeDto;
  days: number;
  occurredOn: string;
  notes: string;
}

/**
 * نتيجة تسجيل إجازة مع أثرها على الرصيد.
 *
 * `balance` تُعاد دائماً فيقرأ العميل الرصيد بعد العملية من مصدر واحد
 * (المحرك على الخادم) لا من حساب في الواجهة (§34).
 */
export interface LeaveWithBalanceDto {
  leave: EmployeeLeaveDto;
  balance: LeaveBalanceDto | null;
  /** أيام بدون راتب نتجت عن نقص الرصيد (§14.10). */
  unpaidDays: number;
}

/**
 * نتيجة تسجيل زمنية مع أثرها على الرصيد والمؤشر الأسبوعي.
 *
 * `exceedsWeeklyLimit` **مؤشر فقط** (§14.4): لا يمنع التسجيل ولا يحذف شيئاً.
 */
export interface TimePermissionWithBalanceDto {
  record: EmployeeTimePermissionDto;
  balance: LeaveBalanceDto | null;
  /** دقائق الأسبوع بعد التسجيل — قياس (§14.4). */
  weeklyMinutes: number;
  /** تجاوز 4 ساعات أسبوعياً — مؤشر لا حاجز. */
  exceedsWeeklyLimit: boolean;
  /** أيام طارئة مُضافة من تحويل هذه السجل. */
  coveredEmergencyDays: number;
  /** أيام بدون راتب بسبب نفاد الطارئ (§14.5/§14.10). */
  unpaidDays: number;
  /** الدقائق المتبقية بعد التحويل — ترحل للسنة التالية (§14.3). */
  remainderMinutes: number;
}
