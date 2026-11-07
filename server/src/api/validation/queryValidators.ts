/**
 * ظ…ظڈط­ظ‚ظگظ‘ظ‚ط§طھ ظ…ظڈط¹ط§ظ…ظ„ط§طھ ط§ظ„ط§ط³طھط¹ظ„ط§ظ… (Phase 10).
 *
 * ظƒظ„ ط§ظ„ظپظ„ط§طھط± ط§ط®طھظٹط§ط±ظٹط©ط› ط§ظ„ط؛ظٹط§ط¨ ظٹط¹ظ†ظٹ آ«ط¨ظ„ط§ طھطµظپظٹط©آ». ط§ظ„ظپط§ط±ظ‚ ط§ظ„ظ…ظ‡ظ… ط¹ظ† ط§ظ„ط¬ط³ظ…:
 *Express ظٹط³ظ„ظ‘ظ… ظ…ظڈط¹ط§ظ…ظ„ط§طھ ط§ظ„ط§ط³طھط¹ظ„ط§ظ… ظƒظ†طµظˆطµطŒ ظˆط§ظ„ظ‚ظٹظ… ط§ظ„ظپط§ط±ط؛ط© طھظڈط·ط¨ظژظ‘ط¹ ط¥ظ„ظ‰
 * `undefined` (ظˆط¥ظ„ط§ ظپظڈط³ظگظ‘ط±طھ ظƒظپظ„طھط± ظپط¹ظ„ظٹ â€” ط§ظ†ط¸ط± `optionalQuery` ظپظٹ fields.ts).
 *
 * ظ„ط§ ظٹظڈظ‚ط¨ظ„ ط£ظٹ ظ…ظڈط¹ط§ظ…ظ„ ط؛ظٹط± ظ…ط¹ط±ظˆظپ: ظٹظ…ظ†ط¹ طھظ…ط±ظٹط± ط£ط®ط·ط§ط، ط§ظ„ط¥ظ…ظ„ط§ط، ط¨طµظ…طھ
 * (ظ…ط«ظ„ `?sta=ظ…ظƒطھظ…ظ„` ط¨ط¯ظ„ `status=ظ…ظƒطھظ…ظ„`) ط§ظ„طھظٹ طھط¹ط·ظٹ ظ†طھظٹط¬ط© ظ…ط¶ظ„ظ‘ظ„ط©.
 */
import { invalidOutcome, issue, validOutcome } from '../../validation/validationTypes';
import { objectFields, noUnknownFields, requiredFields } from './objectValidators';
import { pipeline } from './primitives';
import { TRANSACTION_PAGE_SIZE } from '../../../../src/core/models/transactionPaging';
import {
  date,
  enumValue,
  id,
  list,
  optionalQuery,
  positiveInt,
  queryPositiveInt,
  queryNonNegativeInt,
  text,
} from './fields';
import {
  DAILY_SITUATION_CATEGORIES,
  EMPLOYEE_STATUSES,
  TIMELINE_SOURCE_TYPES,
  TRANSACTION_DIRECTIONS,
  TRANSACTION_STATUSES,
} from './catalogs';

/** ظپظ„ط§طھط± ظ‚ط§ط¦ظ…ط© ط§ظ„ظ…ظˆط¸ظپظٹظ† (status/search). */
export const employeeListQuery = pipeline([
  noUnknownFields(['status', 'search']),
  objectFields<Record<string, unknown>>({
    status: optionalQuery(enumValue([...EMPLOYEE_STATUSES, 'all'] as const)),
    search: optionalQuery(text('search')),
  }),
]);

/** ظپظ„ط§طھط± ظ‚ط§ط¦ظ…ط© ط§ظ„ظƒطھط¨ (month/status/direction/limit/offset). */
/** Hard upper bound for a single active/archived SQL list response. */
const boundedTransactionLimit = (input: unknown) => {
  const parsed = queryPositiveInt('limit')(input);
  return parsed.kind === 'valid' && parsed.value > TRANSACTION_PAGE_SIZE
    ? invalidOutcome([issue('limit', 'حجم صفحة الكتب يتجاوز الحد المسموح.')])
    : parsed;
};

export const transactionListQuery = pipeline([
  noUnknownFields(['month', 'status', 'direction', 'limit', 'offset']),
  objectFields<Record<string, unknown>>({
    month: optionalQuery((input) =>
      typeof input === 'string' && /^\d{4}-\d{2}$/.test(input)
        ? validOutcome(input)
        : invalidOutcome([issue('month', 'ط§ظ„ط´ظ‡ط± ظ…ط·ظ„ظˆط¨ ط¨طµظٹط؛ط© YYYY-MM.')]),
    ),
    status: optionalQuery(enumValue(TRANSACTION_STATUSES)),
    direction: optionalQuery(enumValue(TRANSACTION_DIRECTIONS)),
    // Express supplies query params as strings; body-only numeric validators
    // reject every URL pagination request (including archived admin pages).
    limit: optionalQuery(boundedTransactionLimit),
    offset: optionalQuery(queryNonNegativeInt('offset')),
  }),
]);

/** ظپظ„ط§طھط± ط§ظ„ظ…ظˆظ‚ظپ ط§ظ„ظٹظˆظ…ظٹ (employeeId/date/category). */
/** Active-book keyset: a DB-issued UTC microsecond timestamp + UUID. */
const cursorCreatedAt = (input: unknown) =>
  typeof input === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(input) &&
    Number.isFinite(Date.parse(input))
    ? validOutcome(input)
    : invalidOutcome([issue('cursorCreatedAt', 'مؤشر وقت الكتاب غير صالح.')]);

const cursorId = (input: unknown) =>
  typeof input === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input)
    ? validOutcome(input)
    : invalidOutcome([issue('cursorId', 'معرّف مؤشر الكتاب غير صالح.')]);

export const transactionCursorQuery = pipeline([
  noUnknownFields(['month', 'status', 'direction', 'limit', 'cursorCreatedAt', 'cursorId']),
  (input) => {
    const raw = input as Record<string, unknown>;
    return Object.hasOwn(raw, 'cursorCreatedAt') === Object.hasOwn(raw, 'cursorId')
      ? validOutcome(true)
      : invalidOutcome([issue('cursor', 'مؤشر الكتاب يتطلب الوقت والمعرّف معاً.')]);
  },
  objectFields<Record<string, unknown>>({
    month: optionalQuery((input) =>
      typeof input === 'string' && /^\d{4}-\d{2}$/.test(input)
        ? validOutcome(input)
        : invalidOutcome([issue('month', 'الشهر مطلوب بصيغة YYYY-MM.')]),
    ),
    status: optionalQuery(enumValue(TRANSACTION_STATUSES)),
    direction: optionalQuery(enumValue(TRANSACTION_DIRECTIONS)),
    limit: optionalQuery(boundedTransactionLimit),
    cursorCreatedAt,
    cursorId,
  }),
]);

export const dailySituationListQuery = pipeline([
  noUnknownFields(['employeeId', 'date', 'category']),
  objectFields<Record<string, unknown>>({
    employeeId: optionalQuery(id('employeeId')),
    date: optionalQuery(date('date')),
    category: optionalQuery(enumValue(DAILY_SITUATION_CATEGORIES)),
  }),
]);

/** ظپظ„ط§طھط± ط³ط¬ظ„ط§طھ ط´ط¤ظˆظ† ط§ظ„ظ…ظ†طھط³ط¨ظٹظ† (employeeId ظپظ‚ط· ظپظٹ ظ‡ط°ظ‡ ط§ظ„ظ…ط±ط­ظ„ط©). */
export const personnelListQuery = pipeline([
  noUnknownFields(['employeeId']),
  objectFields<Record<string, unknown>>({
    employeeId: optionalQuery(id('employeeId')),
  }),
]);

/** ظپظ„ط§طھط± ط±ظˆط§ط¨ط· ط§ظ„ظƒطھط§ط¨ ط¨ط§ظ„ظ…ظ†طھط³ط¨ (ط·ط±ظپ ظˆط§ط­ط¯ ط¥ظ„ط²ط§ظ…ظٹ ظ„ظƒظ„ ط§ط³طھط¹ظ„ط§ظ…). */
export const linkListQuery = pipeline([
  noUnknownFields(['transactionId', 'employeeId']),
  (input) => {
    // يُطلب طرف واحد بالضبط: وجودهما معاً أو غيابهما معاً طلب غير مفهوم،
    // و«كل الروابط بلا نطاق» ليست نتيجة مقبولة في هذه المرحلة.
    const source = (input ?? {}) as Record<string, unknown>;
    const hasTransaction = source.transactionId !== undefined && source.transactionId !== '';
    const hasEmployee = source.employeeId !== undefined && source.employeeId !== '';
    if (hasTransaction === hasEmployee) {
      return invalidOutcome([
        issue('scope', 'أرسل طرفاً واحداً بالضبط: transactionId أو employeeId.'),
      ]);
    }
    return validOutcome(true);
  },
  objectFields<Record<string, unknown>>({
    transactionId: id('transactionId'),
    employeeId: id('employeeId'),
  }),
]);

/** ط±ظˆط§ط¨ط· ظ…ظ†طھط³ط¨ ظˆط§ط­ط¯: ط§ظ„ط·ط±ظپ ط§ظ„ط¢ط®ط± ط¥ظ„ط²ط§ظ…ظٹ. */
/**
 * ظپظ„ط§طھط± ط§ظ„ط®ط· ط§ظ„ط²ظ…ظ†ظٹ.
 * `employeeId` ط¥ظ„ط²ط§ظ…ظٹ: ط§ظ„ط®ط· ط§ظ„ط²ظ…ظ†ظٹ ظٹظڈط¨ظ†ظ‰ ظ„ظ…ظ†طھط³ط¨ ظˆط§ط­ط¯ (Phase 7)طŒ
 * ظˆظ„ط§ ظٹظˆط¬ط¯ ظ…ط³ط§ط± آ«ظƒظ„ ط§ظ„ظ…ظ†طھط³ط¨ظٹظ†آ» ظپظٹ ظ‡ط°ظ‡ ط§ظ„ظ…ط±ط­ظ„ط©.
 */
export const timelineQuery = pipeline([
  noUnknownFields([
    'employeeId', 'sourceTypes', 'dateFrom', 'dateTo', 'searchText', 'limit',
  ]),
  requiredFields(['employeeId']),
  objectFields<Record<string, unknown>>({
    employeeId: id('employeeId'),
    sourceTypes: list('sourceTypes', enumValue(TIMELINE_SOURCE_TYPES)),
    dateFrom: optionalQuery(date('dateFrom')),
    dateTo: optionalQuery(date('dateTo')),
    searchText: optionalQuery(text('searchText')),
    limit: optionalQuery(positiveInt('limit')),
  }),
]);
