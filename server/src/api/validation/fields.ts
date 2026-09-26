/**
 * مُحقِّقات مشتركة تُعاد بين ملفات الموارد (Phase 10).
 *
 * الهدف: عدم تكرار تعريف «نص غير فارغ» أو «تاريخ» أو «قائمة اختيارية»
 * في كل ملف موارد، مع بقاء القيم نفسها مرتبطة بمصدرها في `catalogs.ts`.
 */
import { isValidDateOnly, isValidTimeOfDay } from '../../database/dateTime';
import { invalidOutcome, issue, validOutcome } from '../../validation/validationTypes';
import type { Validator } from '../../validation/validationTypes';
import {
  arrayOf,
  dateOnly,
  entityId,
  nonEmptyText,
  objectValue,
  oneOf,
  optionalText,
  positiveInteger,
  nonNegativeInteger,
  timeOfDay,
} from './primitives';

/** تاريخ عمل YYYY-MM-DD (نفس دالة Phase 9). */
export const date = (field: string) => dateOnly(field, isValidDateOnly);

/** وقت HH:mm بنظام 24 ساعة (نفس دالة Phase 9). */
export const time = (field: string) => timeOfDay(field, isValidTimeOfDay);

/** عدد صحيح موجب. */
export const positiveInt = positiveInteger;

/** عدد صحيح غير سالب. */
export const nonNegativeInt = nonNegativeInteger;

/** معرّف كيان (نص غير فارغ) — أساس كل العلاقات (القاعدة 7). */
export const id = entityId;

/** نص إلزامي. */
export const text = nonEmptyText;

/** نص اختياري. */
export const optText = optionalText;

/** كائن JSON. */
export const jsonObject = objectValue;

/** قائمة من مُحقِّق. */
export const list = arrayOf;

/** قيم من مجموعة مغلقة. */
export const enumValue = oneOf;

/** عدد صحيح موجب (أيام الإجازة) — أو غائب فيجب أن يبقى غائباً. */
export const positiveCount = (field: string) => (input: unknown) =>
  typeof input === 'number' && Number.isInteger(input) && input > 0
    ? validOutcome(input)
    : invalidOutcome([issue(field, 'يجب أن يكون عدداً صحيحاً موجباً.')]);

/** عدد صحيح غير سالب (مدة الزمنية بالدقائق — الخطة §14.3). */
export const nonNegativeCount = (field: string) => (input: unknown) =>
  typeof input === 'number' && Number.isInteger(input) && input >= 0
    ? validOutcome(input)
    : invalidOutcome([issue(field, 'يجب أن يكون عدداً صحيحاً غير سالب.')]);

/**
 * غلاف لمُحقِّق يستقبل قيمة من مُعاملات الاستعلام (query string).
 * يطبِّع السلسلة الفارغة إلى `undefined` — وإلا مرَّرها Express كقيمة
 * وفسّرها كفلتر فعلي (`search=` تعني «ابحث عن فراغ» لا «بلا بحث»).
 */
export const optionalQuery = <TValue>(
  validator: Validator<unknown, TValue>,
): Validator<unknown, TValue | undefined> => (input) =>
  input === undefined || input === '' ? validOutcome(undefined) : validator(input);
