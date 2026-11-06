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
  for (const [fromKey, toKey] of [
    ['dateFrom', 'dateTo'],
    ['documentDateFrom', 'documentDateTo'],
  ] as const) {
    const from = input[fromKey];
    const to = input[toKey];
    if (typeof from === 'string' && typeof to === 'string' && from > to) {
      return invalidOutcome([
        issue(fromKey, 'تاريخ «من» يجب ألا يكون بعد تاريخ «إلى».'),
      ]);
    }
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
    case 'situation':
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
  // A fixed-direction report cannot accept the opposite direction as a filter.
  if ((reportType === 'incoming' && type !== 'وارد') ||
      (reportType === 'outgoing' && type !== 'صادر')) {
    return invalidOutcome([issue('type', 'نوع الكتاب يتعارض مع اتجاه التقرير.')]);
  }
  return validOutcome(true);
}

/** Document dates are a separate supported dimension only for book reports.
 * Circular statistics have two independent clocks, so require their own
 * explicit filter semantics before document dates can be offered there.
 */
function documentDateAvailabilityValidator(input: ReportFilter): ValidationOutcome<true> {
  if (input.documentDateFrom === undefined && input.documentDateTo === undefined) {
    return validOutcome(true);
  }
  if (!(['monthly', 'incoming', 'outgoing', 'situation'] as readonly ReportType[])
    .includes(input.reportType)) {
    return invalidOutcome([
      issue('documentDateFrom', 'فلتر تاريخ الكتاب غير متاح لهذا التقرير.'),
    ]);
  }
  return validOutcome(true);
}

/** Reject filters that the approved repository source explicitly refuses.
 * This improves error locality while the repository continues to fail closed
 * for direct service calls. No new data-source mapping is inferred here.
 */
function reportFilterAvailabilityValidator(input: ReportFilter): ValidationOutcome<true> {
  const bookTypes: readonly ReportType[] = ['monthly', 'incoming', 'outgoing', 'situation'];
  if (bookTypes.includes(input.reportType)) {
    if (input.section !== undefined) {
      return invalidOutcome([issue('section', 'فلتر القسم غير متاح لهذا التقرير.')]);
    }
    if (input.source !== undefined) {
      return invalidOutcome([issue('source', 'فلتر المصدر غير متاح لهذا التقرير.')]);
    }
    return validOutcome(true);
  }
  if (['employees', 'requests', 'leaves', 'timePermissions', 'circularsAndAcknowledgements']
    .includes(input.reportType)) {
    if (input.source !== undefined) {
      return invalidOutcome([issue('source', 'فلتر المصدر غير متاح لهذا التقرير.')]);
    }
    if (input.section !== undefined && input.reportType !== 'employees') {
      return invalidOutcome([issue('section', 'فلتر القسم غير متاح لهذا التقرير.')]);
    }
    if (input.reportType === 'circularsAndAcknowledgements') {
      for (const field of ['employee', 'type'] as const) {
        if (input[field] !== undefined) {
          return invalidOutcome([issue(field, 'هذا الفلتر غير متاح لتقرير الإعمامات والاطلاع.')]);
        }
      }
    }
  }
  return validOutcome(true);
}

/** مُحقِّق فلتر التقرير. */
const reportFields = pipeline<Partial<ReportFilter>>([
  noUnknownFields([
    'reportType',
    'dateFrom',
    'dateTo',
    'documentDateFrom',
    'documentDateTo',
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
    documentDateFrom: optionalQuery(date('documentDateFrom')),
    documentDateTo: optionalQuery(date('documentDateTo')),
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
  for (const check of [
    dateRangeValidator, documentDateAvailabilityValidator,
    reportTypeValidator, reportStatusValidator, reportFilterAvailabilityValidator,
  ]) {
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
