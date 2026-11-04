/**
 * التحقق من مدخلات تقارير المرحلة 23 — §39_filters.
 *
 * المرجع: `ALSQAYA_PLAN.md` §39 (التقرير الشهري، الوارد، الصادر، الإجازات،
 * الزمنيات، الأعمام والاطلاع، الطلبات، المنتسبون، الباحثون، الأساتذة، الحالة).
 *
 * الفلاتر المعتمدة: dateFrom/dateTo، section، type، employee، status، source.
 *
 * لا تُخترع قيمًا جديدة. `type` يُقيد حسب نوع التقرير عند الحاجة (مثلاً
 * direction أو category أو leave type)، بقوائم موجودة في النموذج فقط.
 */

import { invalidOutcome, issue, validOutcome, type ValidationOutcome, type Validator } from '../../validation/validationTypes';
import { objectFields, noUnknownFields, requiredFields } from './objectValidators';
import { pipeline } from './primitives';
import {
  date,
  enumValue,
  optionalQuery,
  text,
} from './fields';
import {
  EMPLOYEE_CATEGORIES,
  EMPLOYEE_STATUSES,
  LEAVE_STATUSES,
  LEAVE_TYPES,
  REQUEST_KINDS,
  REQUEST_STATUSES,
  TIME_PERMISSION_STATUSES,
  TRANSACTION_DIRECTIONS,
  TRANSACTION_STATUSES,
} from './catalogs';
import type { ReportFilter, ReportType } from '../dto/report';

/** كل أنواع التقارير المعتمدة في §39. */
export const REPORT_TYPES: readonly ReportType[] = [
  'monthly',
  'incoming',
  'outgoing',
  'leaves',
  'timePermissions',
  'circularsAndAcknowledgements',
  'requests',
  'employees',
  'researchers',
  'professors',
  'situation',
] as const;

/**
 * يتحقق من أن `dateFrom` ≤ `dateTo` إن وُجدا معًا.
 */
function dateRangeValidator(input: ReportFilter): ValidationOutcome<true> {
  const from = input.dateFrom;
  const to = input.dateTo;
  if (typeof from === 'string' && typeof to === 'string' && from !== '' && to !== '' && from > to) {
    return invalidOutcome([
      issue('dateFrom', 'تاريخ «من» يجب ألا يكون بعد تاريخ «إلى».'),
    ]);
  }
  return validOutcome(true);
}

/**
 * يتحقق من قيمة `type` حسب نوع التقرير — بقوائم موجودة فقط، لا تصنيف جديد.
 */
function reportTypeValidator(input: ReportFilter): ValidationOutcome<true> {
  const reportType = input.reportType;
  const type = input.type;
  if (typeof reportType !== 'string' || typeof type !== 'string' || type === '') {
    return validOutcome(true);
  }

  let allowed: readonly string[] = [];
  switch (reportType) {
    case 'incoming':
    case 'outgoing':
    case 'monthly':
      allowed = TRANSACTION_DIRECTIONS;
      break;
    case 'leaves':
      allowed = LEAVE_TYPES;
      break;
    case 'timePermissions':
      allowed = TIME_PERMISSION_STATUSES;
      break;
    case 'requests':
      allowed = REQUEST_KINDS;
      break;
    case 'employees':
    case 'researchers':
      allowed = EMPLOYEE_CATEGORIES;
      break;
    default:
      // الأنواع الأخرى لا تُقيد `type` بقائمة مغلقة من النموذج الحالي.
      return validOutcome(true);
  }

  if (!allowed.includes(type)) {
    return invalidOutcome([
      issue('type', `القيمة «${type}» غير مسموحة لتقرير «${reportType}».`),
    ]);
  }
  return validOutcome(true);
}

/** مُحقِّق فلتر التقرير. */
const reportFields = pipeline<Partial<ReportFilter>>([
  noUnknownFields([
    'reportType',
    'dateFrom',
    'dateTo',
    'section',
    'type',
    'employee',
    'status',
    'source',
  ]),
  requiredFields(['reportType']),
  objectFields<ReportFilter>({
    reportType: enumValue(REPORT_TYPES),
    dateFrom: optionalQuery(date('dateFrom')),
    dateTo: optionalQuery(date('dateTo')),
    section: optionalQuery(text('section')),
    type: optionalQuery(text('type')),
    employee: optionalQuery(text('employee')),
    status: optionalQuery(text('status')),
    source: optionalQuery(text('source')),
  }),
]);

/** Cross-field checks consume normalized fields; return that object, never true. */
export const reportQuery: Validator<unknown, ReportFilter> = (input) => {
  const parsed = reportFields(input);
  if (parsed.kind === 'invalid') return parsed;
  const reportType = parsed.value.reportType;
  if (reportType === undefined) {
    return invalidOutcome([issue('reportType', 'هذا الحقل مطلوب.')]);
  }
  const filter: ReportFilter = { ...parsed.value, reportType };
  for (const check of [dateRangeValidator, reportTypeValidator, reportStatusValidator]) {
    const outcome = check(filter);
    if (outcome.kind === 'invalid') return outcome;
  }
  return validOutcome(filter);
};

function reportStatusValidator(filter: ReportFilter): ValidationOutcome<true> {
  if (filter.status !== undefined && !reportStatusOptions(filter.reportType).includes(filter.status)) {
    return invalidOutcome([issue('status', 'الحالة غير مسموحة لهذا التقرير.')]);
  }
  return validOutcome(true);
}

/**
 * قيم الحالة الرسمية حسب المورد؛ المطابقة حرفية بعد تشذيب النص.
 */
export function reportStatusOptions(reportType: ReportType): readonly string[] {
  switch (reportType) {
    case 'monthly':
    case 'incoming':
    case 'outgoing':
    case 'circularsAndAcknowledgements':
    case 'situation':
      return TRANSACTION_STATUSES;
    case 'leaves':
      return LEAVE_STATUSES;
    case 'timePermissions':
      return TIME_PERMISSION_STATUSES;
    case 'requests':
      return REQUEST_STATUSES;
    case 'employees':
      return EMPLOYEE_STATUSES;
    default:
      return [];
  }
}

// إعادة تصدير الدوال المساعدة المستخدمة من قبل المسارات والخدمات عند الحاجة.
export { dateRangeValidator, reportTypeValidator };
