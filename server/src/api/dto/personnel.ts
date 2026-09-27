/**
 * DTOs شؤون المنتسبين — Phase 10 (بند 5 من ترتيب النقل).
 *
 * الأربعة كيانات مستقلة، كل واحد موظف واحد عبر employeeId (القاعدة 7).
 * تُستخدم نماذج المجال نفسها لأن شكلها هو شكل النقل (لا حقول مشتقة).
 * المرجع: §7.8/§7.11 وPhase 3.
 */
import type { EmployeeLeave } from '../../../../src/core/models/employeeLeave';
import type { EmployeeTimePermission } from '../../../../src/core/models/employeeTimePermission';
import type { EmployeeAssignment } from '../../../../src/core/models/employeeAssignment';
import type { EmployeeCourse } from '../../../../src/core/models/employeeCourse';

export type EmployeeLeaveDto = EmployeeLeave;
export type CreateEmployeeLeaveDto = Omit<EmployeeLeave, 'id'>;
export type UpdateEmployeeLeaveDto = Partial<CreateEmployeeLeaveDto>;

/**
 * سجل الزمنية مع المدة بالدقائق إن وُجدت.
 * المدة تُخزَّن ولا تُشتق (الخطة §7.11 و§14.3) — `timePermissionRecord` في
 * عقود المستودعات يضيفها، والنموذج لا يحملها.
 */
export interface EmployeeTimePermissionDto extends EmployeeTimePermission {
  durationMinutes?: number;
}

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
