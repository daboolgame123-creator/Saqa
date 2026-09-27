/**
 * مُحقِّقات إتاحة الكتاب (Phase 13 — §9.3/§9.4).
 *
 * الشكل فقط: لا قاعدة أعمال هنا. القائمة غير الفارغة شرطها نصّي في §9.3
 * («منتسب واحد أو عدة منتسبين») — والإتاحة بلا منتسب ليست عملية.
 *
 * مُحقِّقات المسار تستعمل `createValidationMiddleware` (Phase 8) لا
 * `validateApiRequest` (Phase 10): الثاني يضع النتيجة النظيفة على
 * `validatedBody/validatedQuery`، و`params` لا هدف له فيه، والمطلوب هنا
 * رفض معرّف غير صالح قبل وصوله إلى الاستعلام (وإلا صار خطأ قاعدة 500).
 */
import { invalidOutcome, issue, validOutcome, type Validator } from '../../validation/validationTypes';
import { pipeline } from './primitives';
import { noExplicitNulls, noUnknownFields, objectFields, requiredFields } from './objectValidators';
import { id, list } from './fields';

/** نمط UUID — نفس النمط المستعمل في `authValidators.accountIdParam` (Phase 11). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** يبني مُحقِّقاً يقرأ حقلاً من كائن `req.params` ويتحقق أنه UUID. */
function uuidParam(field: string, label: string): Validator<unknown, string> {
  return (input) => {
    const value =
      typeof input === 'string'
        ? input
        : input !== null && typeof input === 'object'
          ? (input as Record<string, unknown>)[field]
          : undefined;
    return typeof value === 'string' && UUID_PATTERN.test(value)
      ? validOutcome(value)
      : invalidOutcome([issue(field, `${label} يجب أن يكون UUID صالحاً.`)]);
  };
}

/** `:id` في مسارات الكتاب. */
export const transactionIdParam = uuidParam('id', 'معرّف الكتاب');

/** `:employeeId` في مسار السحب. */
export const availabilityEmployeeIdParam = uuidParam('employeeId', 'معرّف المنتسب');

/** جسم المنح: قائمة معرّفات منتسبين غير فارغة. */
export const grantAvailabilityBody = pipeline([
  noUnknownFields(['employeeIds']),
  noExplicitNulls(['employeeIds']),
  requiredFields(['employeeIds']),
  objectFields<{ employeeIds: string[] }>({
    employeeIds: list('employeeIds', id('employeeIds')),
  }),
  (input) => {
    const ids = (input as { employeeIds: string[] }).employeeIds;
    return ids.length > 0
      ? validOutcome(input)
      : invalidOutcome([issue('employeeIds', 'يجب اختيار منتسب واحد على الأقل.')]);
  },
]);
