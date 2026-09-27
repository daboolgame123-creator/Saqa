/**
 * مُحقِّقات شؤون المنتسبين (Phase 10 — بند 5 من ترتيب النقل).
 *
 * أربعة كيانات مستقلة، كل واحد لموظف واحد عبر employeeId (القاعدة 7).
 * حقول الفحص مطابقة لأعمدة `leaves` و`time_permissions` و`assignments`
 * و`courses` في migration 0003.
 *
 * ما لا يُفحص هنا: قواعد الإجازات والأرصدة والحدود الأسبوعية — Phase 18.
 * هذه المرحلة تنقل السجلات فقط ولا تحكمها.
 */
import { booleanValue, pipeline } from './primitives';
import {
  atLeastOneField,
  noExplicitNulls,
  noUnknownFields,
  objectFields,
  requiredFields,
} from './objectValidators';
import {
  date,
  enumValue,
  id,
  nonNegativeCount,
  optText,
  positiveCount,
  text,
  time,
} from './fields';
import {
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_TYPES,
  LEAVE_STATUSES,
  LEAVE_TYPES,
  PARTICIPATION_STATUSES,
  PARTICIPATION_TYPES,
  TIME_PERMISSION_STATUSES,
} from './catalogs';

// ── EmployeeLeave (نموذج employeeLeave) ──────────────────────────

export const LEAVE_FIELDS = [
  'employeeId', 'type', 'startDate', 'endDate', 'days', 'isPaid', 'status',
  'transactionId', 'notes',
] as const;

const leaveFields = objectFields<Record<string, unknown>>({
  employeeId: id('employeeId'),
  type: enumValue(LEAVE_TYPES),
  startDate: date('startDate'),
  endDate: date('endDate'),
  days: positiveCount('days'),
  isPaid: booleanValue('isPaid'),
  status: enumValue(LEAVE_STATUSES),
  transactionId: id('transactionId'),
  notes: optText('notes'),
});

/** إنشاء إجازة. `days` و`isPaid` اختياريان (القاعدة تضع افتراضات لهما). */
export const createLeaveBody = pipeline([
  requiredFields(['employeeId', 'type', 'startDate', 'endDate', 'status']),
  noUnknownFields(LEAVE_FIELDS),
  noExplicitNulls(LEAVE_FIELDS),
  leaveFields,
]);

export const updateLeaveBody = pipeline([
  noUnknownFields(LEAVE_FIELDS),
  noExplicitNulls(LEAVE_FIELDS),
  atLeastOneField(LEAVE_FIELDS),
  leaveFields,
]);

// ── EmployeeTimePermission (نموذج employeeTimePermission) ────────

export const TIME_PERMISSION_FIELDS = [
  'employeeId', 'date', 'timeOut', 'timeIn', 'durationMinutes', 'reason',
  'status', 'transactionId', 'notes',
] as const;

const timePermissionFields = objectFields<Record<string, unknown>>({
  employeeId: id('employeeId'),
  date: date('date'),
  timeOut: time('timeOut'),
  timeIn: time('timeIn'),
  // المدة تُخزَّن ولا تُشتق (الخطة §7.11 و§14.3).
  durationMinutes: nonNegativeCount('durationMinutes'),
  reason: optText('reason'),
  status: enumValue(TIME_PERMISSION_STATUSES),
  transactionId: id('transactionId'),
  notes: optText('notes'),
});

/** إنشاء زمنية. `durationMinutes` اختياري ولا يُشتق هنا. */
export const createTimePermissionBody = pipeline([
  requiredFields(['employeeId', 'date', 'timeOut', 'status']),
  noUnknownFields(TIME_PERMISSION_FIELDS),
  noExplicitNulls(TIME_PERMISSION_FIELDS),
  timePermissionFields,
]);

export const updateTimePermissionBody = pipeline([
  noUnknownFields(TIME_PERMISSION_FIELDS),
  noExplicitNulls(TIME_PERMISSION_FIELDS),
  atLeastOneField(TIME_PERMISSION_FIELDS),
  timePermissionFields,
]);

// ── EmployeeAssignment (نموذج employeeAssignment) ────────────────

export const ASSIGNMENT_FIELDS = [
  'employeeId', 'type', 'entity', 'place', 'startDate', 'endDate',
  'purpose', 'status', 'transactionId', 'notes',
] as const;

const assignmentFields = objectFields<Record<string, unknown>>({
  employeeId: id('employeeId'),
  type: enumValue(ASSIGNMENT_TYPES),
  entity: text('entity'),
  place: optText('place'),
  startDate: date('startDate'),
  endDate: date('endDate'),
  purpose: optText('purpose'),
  status: enumValue(ASSIGNMENT_STATUSES),
  transactionId: id('transactionId'),
  notes: optText('notes'),
});

/** إنشاء تكليف. */
export const createAssignmentBody = pipeline([
  requiredFields(['employeeId', 'type', 'entity', 'startDate', 'endDate', 'status']),
  noUnknownFields(ASSIGNMENT_FIELDS),
  noExplicitNulls(ASSIGNMENT_FIELDS),
  assignmentFields,
]);

export const updateAssignmentBody = pipeline([
  noUnknownFields(ASSIGNMENT_FIELDS),
  noExplicitNulls(ASSIGNMENT_FIELDS),
  atLeastOneField(ASSIGNMENT_FIELDS),
  assignmentFields,
]);

// ── EmployeeCourse (نموذج employeeCourse) ────────────────────────

export const COURSE_FIELDS = [
  'employeeId', 'name', 'organizer', 'place', 'startDate', 'endDate',
  'participationType', 'participationStatus', 'transactionId',
  'certificateRef', 'notes',
] as const;

const courseFields = objectFields<Record<string, unknown>>({
  employeeId: id('employeeId'),
  name: text('name'),
  organizer: text('organizer'),
  place: optText('place'),
  startDate: date('startDate'),
  endDate: date('endDate'),
  participationType: enumValue(PARTICIPATION_TYPES),
  participationStatus: enumValue(PARTICIPATION_STATUSES),
  transactionId: id('transactionId'),
  certificateRef: optText('certificateRef'),
  notes: optText('notes'),
});

/**
 * إنشاء دورة.
 * `startDate` اختياري عمداً: النموذج يوثّق أن بعض الدورات تُسجَّل
 * بلا تاريخ بداية دقيق، وTimelineMappers يتعامل مع ذلك بمجموعة
 * «بلا تاريخ» بدل اختلاق تاريخ.
 */
export const createCourseBody = pipeline([
  requiredFields([
    'employeeId', 'name', 'organizer', 'participationType', 'participationStatus',
  ]),
  noUnknownFields(COURSE_FIELDS),
  noExplicitNulls(COURSE_FIELDS),
  courseFields,
]);

export const updateCourseBody = pipeline([
  noUnknownFields(COURSE_FIELDS),
  noExplicitNulls(COURSE_FIELDS),
  atLeastOneField(COURSE_FIELDS),
  courseFields,
]);
