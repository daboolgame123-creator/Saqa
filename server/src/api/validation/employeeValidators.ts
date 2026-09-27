/**
 * مُحقِّقات الموظف (Phase 10 — بند 1 من ترتيب النقل).
 *
 * حقول الفحص مطابقة لعمود `employees` في migration 0001. لا يُفحص هنا:
 * - الصلاحيات وربط الحساب (Phase 11/12).
 * - أي قاعدة إجازة أو رصيد.
 */
import { invalidOutcome, issue, validOutcome } from '../../validation/validationTypes';
import { pipeline } from './primitives';
import {
  atLeastOneField,
  noExplicitNulls,
  noUnknownFields,
  objectFields,
  requiredFields,
} from './objectValidators';
import { date, enumValue, id, optText, text } from './fields';
import { EMPLOYEE_CATEGORIES, EMPLOYEE_STATUSES, SERVICE_END_REASONS } from './catalogs';

/** حقول الموظف في عقد الـDTO (مرآة لعمود employees). */
export const EMPLOYEE_FIELDS = [
  'name', 'title', 'department', 'badgeNumber', 'joinedDate', 'category',
  'academicDegree', 'specialization', 'status', 'phone', 'photo', 'userId',
] as const;

/** الحقول الإلزامية عند الإنشاء؛ الباقي له افتراض أو nullable في القاعدة. */
const EMPLOYEE_REQUIRED = ['name', 'title', 'department'] as const;

/** مُحقِّق حقول الموظف — مشترك بين الإنشاء والتعديل الجزئي. */
const employeeFields = objectFields<Record<string, unknown>>({
  name: text('name'),
  title: text('title'),
  department: text('department'),
  badgeNumber: optText('badgeNumber'),
  joinedDate: date('joinedDate'),
  category: enumValue(EMPLOYEE_CATEGORIES),
  academicDegree: optText('academicDegree'),
  specialization: optText('specialization'),
  status: enumValue(EMPLOYEE_STATUSES),
  phone: optText('phone'),
  photo: optText('photo'),
  userId: id('userId'),
});

/** إنشاء موظف: حقول مطلوبة + لا حقول مجهولة + لا null صريح. */
export const createEmployeeBody = pipeline([
  requiredFields(EMPLOYEE_REQUIRED),
  noUnknownFields(EMPLOYEE_FIELDS),
  noExplicitNulls(EMPLOYEE_FIELDS),
  employeeFields,
]);

/** تعديل موظف (PATCH): حقل واحد على الأقل، والغياب يعني «لا تغيير». */
export const updateEmployeeBody = pipeline([
  noUnknownFields(EMPLOYEE_FIELDS),
  noExplicitNulls(EMPLOYEE_FIELDS),
  atLeastOneField(EMPLOYEE_FIELDS),
  employeeFields,
]);

/** حقول تغيير حالة الموظف. */
const CHANGE_STATUS_FIELDS = ['status', 'serviceEndReason', 'notes'] as const;

/**
 * تغيير حالة الموظف.
 *
 * `status='former'` تستلزم سبب انتهاء خدمة معتمداً (قيمة من الأربع).
 * هذا ينقل قيد CHECK في migration 0001 إلى طبقة التحقق، فيصل العميل
 * رسالة عربية واضحة بدل خطأ قاعدة بيانات مبهم (القاعدة §13).
 */
export const changeEmployeeStatusBody = pipeline([
  requiredFields(['status']),
  noUnknownFields(CHANGE_STATUS_FIELDS),
  noExplicitNulls(CHANGE_STATUS_FIELDS),
  objectFields<Record<string, unknown>>({
    status: enumValue(EMPLOYEE_STATUSES),
    serviceEndReason: enumValue(SERVICE_END_REASONS),
    notes: optText('notes'),
  }),
  (input) => {
    const body = input as { status?: string; serviceEndReason?: string };
    if (body.status === 'former' && body.serviceEndReason === undefined) {
      return invalidOutcome([
        issue(
          'serviceEndReason',
          'سبب انتهاء الخدمة إلزامي عند نقل الموظف إلى حالة «موظف سابق» (الخطة §13).',
        ),
      ]);
    }
    return validOutcome(body);
  },
]);
