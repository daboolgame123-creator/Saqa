/**
 * مُحقِّقات الإشعارات والتذكيرات (Phase 21 · §20 · §21).
 *
 * ثلاث قواعد تحكم هذا الملف:
 *
 * 1. **`userId` غير مقبول في أي جسم**: قوائم الإشعارات تُقرأ بهوية الجلسة
 *    لا بمُعامل من العميل (§28). ولو قُبل قبل لكان كافياً أن يضيف
 *    `?userId=<غيره>` فيقرأ إشعارات غيره — وهو منع صريح.
 *
 * 2. **`status` غير مقبول في الإدخال**: قيم الحالة غير محددة في الخطة، فقبوله
 *    كان سيجعل العميل مؤلف قيم حالات مخترعة (TBD).
 *
 * 3. **`kind` في الاستعلام من `NOTIFICATION_KINDS` فقط** — وهو مرآة قيد
 *    CHECK في `notifications` (0004)، فأي قيمة أخرى 400 لا صمت.
 *
 * 4. **`relatedKind` تحقق بنيوي فقط (نص غير فارغ) بلا قائمة مغلقة**: §21
 *    «يمكن ربطه بسجل يحتاج متابعة» لا يحصر الأنواع، وحصرها كان افتراضاً
 *    غير مسنود بالخطة أُزيل بقرار إغلاق Phase 21. والباقٍ من التحقق
 *    (عدم القبول كحقل زائد، وشكل النص) يبقى.
 */
import { invalidOutcome, issue, validOutcome } from '../../validation/validationTypes';
import { NOTIFICATION_KINDS } from '../../../../src/core/models/notification';
import { noUnknownFields, objectFields } from './objectValidators';
import { pipeline } from './primitives';
import { date, enumValue, id, nonNegativeInt, positiveInt, text, time } from './fields';

/** `true`/`false` القادمة كنص من query string. */
const queryBoolean = (field: string) => (input: unknown) => {
  if (input === undefined || input === '') {
    return validOutcome(undefined);
  }
  if (input === 'true' || input === true) {
    return validOutcome(true);
  }
  if (input === 'false' || input === false) {
    return validOutcome(false);
  }
  return invalidOutcome([issue(field, 'القيمة يجب أن تكون true أو false.')]);
};

/** قائمة إشعارات المستخدم — فلاتر قراءة فقط، وبلا `userId` عمداً. */
export const notificationListQuery = pipeline([
  noUnknownFields(['isNew', 'kind', 'limit', 'offset']),
  objectFields<Record<string, unknown>>({
    isNew: queryBoolean('isNew'),
    kind: (input) =>
      input === undefined
        ? validOutcome(undefined)
        : enumValue([...NOTIFICATION_KINDS] as const)(input),
    limit: positiveInt('limit'),
    offset: nonNegativeInt('offset'),
  }),
]);

/** إنشاء تذكير (§21). `status` مرفوض كحقل زائد عبر `noUnknownFields`. */
export const createReminderBody = pipeline([
  noUnknownFields(['remindOn', 'remindAt', 'note', 'enabled', 'relatedKind', 'relatedId']),
  objectFields<Record<string, unknown>>({
    remindOn: date('remindOn'),
    remindAt: time('remindAt'),
    note: text('note'),
    enabled: (input) =>
      input === undefined ? validOutcome(undefined) : requireBoolean('enabled', input),
    relatedKind: (input) =>
      input === undefined ? validOutcome(undefined) : text('relatedKind')(input),
    relatedId: id('relatedId'),
  }),
]);

/**
 * تعديل تذكير — جزئي، وكل حقل اختياري. وبلا `expectedVersion`:
 * التذكير ليس مورداً متزامناً حساساً في نصّ الخطة (Phase 17 §33 لم يذكره)،
 * فإضافة قفل كانت ستخترع متطلباً.
 */
export const updateReminderBody = pipeline([
  noUnknownFields(['remindOn', 'remindAt', 'note', 'enabled', 'relatedKind', 'relatedId']),
  objectFields<Record<string, unknown>>({
    remindOn: (input) => (input === undefined ? validOutcome(undefined) : date('remindOn')(input)),
    remindAt: (input) => (input === undefined ? validOutcome(undefined) : time('remindAt')(input)),
    note: (input) => (input === undefined ? validOutcome(undefined) : text('note')(input)),
    enabled: (input) =>
      input === undefined ? validOutcome(undefined) : requireBoolean('enabled', input),
    relatedKind: (input) =>
      input === undefined ? validOutcome(undefined) : text('relatedKind')(input),
    relatedId: (input) => (input === undefined ? validOutcome(undefined) : id('relatedId')(input)),
  }),
]);

/** منطقي حقيقي (لا نص) — `enabled` يأتي من JSON كمедеول. */
function requireBoolean(field: string, input: unknown) {
  return typeof input === 'boolean'
    ? validOutcome(input)
    : invalidOutcome([issue(field, 'القيمة يجب أن تكون منطقية (true أو false).')]);
}