/**
 * سطح التحقق من المدخلات لطبقة الـAPI (Phase 10).
 *
 * البنية على ثلاث طبقات:
 * - `primitives.ts` / `objectValidators.ts`: أدوات تركيب عامة.
 * - `catalogs.ts`: القيم المسموحة، كل واحدة مرتبطة بمصدرها المعتمد.
 * - ملفات `*Validators.ts`: مُحقِّق كل مورد على حدة.
 *
 * كل مُحقِّق هنا نوع `Validator` من `validation/validationTypes.ts`، ويُركَّب
 * في المسار عبر `createValidationMiddleware` (Phase 8) فيتحول إلى 400 منظّم.
 */
export * from './catalogs';
export * from './fields';
export * from './employeeValidators';
export * from './transactionValidators';
export * from './availabilityValidators';
export * from './linkValidators';
export * from './dailySituationValidators';
/**
 * مُحقِّقات الأرصدة وسجل الحركات (Phase 18 — §7.9/§7.10/§15/§34).
 *
 * ثلاث عمليات كتابة فقط: **الافتتاح**، **التصحيح**، والقراءة. لا يوجد
 * مُحقِّق لـ«تعديل رقم الرصيد» — §15 يمنع تغيير الرصيد بلا حركة، وكل تغيير
 * يمرّ بواحدة من العمليتين.
 *
 * `year` يُفحص هنا بنمط `YYYY` لا `YYYY-MM`: رصيد السنة رقم واحد، والشهر
 * تاريخ حركة لا رصيد.
 */
import { invalidOutcome, issue, validOutcome } from '../../validation/validationTypes';
import type { Validator } from '../../validation/validationTypes';
import { pipeline } from './primitives';
import {
  noExplicitNulls,
  noUnknownFields,
  objectFields,
  requiredFields,
} from './objectValidators';
import { date, enumValue, id, integerCount, nonNegativeCount, optionalQuery, text } from './fields';
import { LEAVE_MOVEMENT_TYPES } from './catalogs';

/** سنة `YYYY` (رصيد السنة رقم واحد لا تاريخاً). */
const yearValue = (field: string): Validator<unknown, string> => (input) =>
  typeof input === 'string' && /^\d{4}$/.test(input)
    ? validOutcome(input)
    : invalidOutcome([issue(field, 'يجب أن تكون السنة بصيغة YYYY.')]);

/** سنة `YYYY` قادمة من `query string` (نص لا رقم). */
const yearQuery = (field: string): Validator<unknown, string | undefined> => (input) =>
  input === undefined || input === ''
    ? validOutcome(undefined)
    : typeof input === 'string' && /^\d{4}$/.test(input)
      ? validOutcome(input)
      : invalidOutcome([issue(field, 'يجب أن تكون السنة بصيغة YYYY.')]);

/** أنواع الرصيد القابلة للافتتاح/التصحيح — `annual` و`emergency` فقط. */
const BALANCE_LEAVE_TYPES = ['annual', 'emergency'] as const;

const BALANCE_QUERY_FIELDS = ['employeeId', 'year'] as const;

/** قراءة الأرصدة: منتسب وسنة، أو الكل. */
export const leaveBalanceListQuery = pipeline([
  noUnknownFields(BALANCE_QUERY_FIELDS),
  objectFields<Record<string, unknown>>({
    employeeId: optionalQuery(id('employeeId')),
    year: optionalQuery(yearQuery('year')),
  }),
]);

const LEDGER_QUERY_FIELDS = ['employeeId', 'year', 'leaveId', 'movementType'] as const;

/** قراءة سجل الحركات — فلاتر قراءة فقط، لا حقول كتابة. */
export const leaveLedgerListQuery = pipeline([
  noUnknownFields(LEDGER_QUERY_FIELDS),
  objectFields<Record<string, unknown>>({
    employeeId: optionalQuery(id('employeeId')),
    year: optionalQuery(yearQuery('year')),
    leaveId: optionalQuery(id('leaveId')),
    movementType: optionalQuery(enumValue(LEAVE_MOVEMENT_TYPES)),
  }),
]);

const OPENING_FIELDS = [
  'employeeId', 'year', 'leaveType', 'days', 'occurredOn', 'notes',
] as const;

const openingFields = objectFields<Record<string, unknown>>({
  employeeId: id('employeeId'),
  year: yearValue('year'),
  leaveType: enumValue(BALANCE_LEAVE_TYPES),
  // 0 = توثيق نقطة بداية بلا رصيد — فغير السالب مطلوب هنا.
  days: nonNegativeCount('days'),
  occurredOn: date('occurredOn'),
  // `notes` إلزامي: نقطة البداية تُوثَّق بمصدرها، لا رقم بلا بيان.
  notes: text('notes'),
});

/**
 * نقطة بداية افتتاحية (§34).
 *
 * `days` غير سالب (0 = توثيق نقطة بداية بلا رصيد)، و`notes` إلزامي،
 * و`occurredOn` تاريخ فعلي — تاريخ الافتتاح جزء من التوثيق لا سنة فقط.
 */
export const openingBalanceBody = pipeline([
  requiredFields(OPENING_FIELDS),
  noUnknownFields(OPENING_FIELDS),
  noExplicitNulls(OPENING_FIELDS),
  openingFields,
]);

const ADJUSTMENT_FIELDS = [
  'employeeId', 'year', 'leaveType', 'days', 'occurredOn', 'notes',
] as const;

const adjustmentFields = objectFields<Record<string, unknown>>({
  employeeId: id('employeeId'),
  year: yearValue('year'),
  leaveType: enumValue(BALANCE_LEAVE_TYPES),
  // سالب = ينقص الرصيد، موجب = يزيده (بلا سالب في المحرّك — قيد القاعدة).
  days: integerCount('days'),
  occurredOn: date('occurredOn'),
  notes: text('notes'),
});

/** تصحيح إداري موثّق (§15) — `notes` إلزامي بلا استثناء. */
export const leaveAdjustmentBody = pipeline([
  requiredFields(ADJUSTMENT_FIELDS),
  noUnknownFields(ADJUSTMENT_FIELDS),
  noExplicitNulls(ADJUSTMENT_FIELDS),
  adjustmentFields,
]);
export * from './queryValidators';
export {
  arrayOf,
  booleanValue,
  dateOnly,
  entityId,
  nonEmptyText,
  objectValue,
  oneOf,
  optionalText,
  pipeline,
  positiveInteger,
  nonNegativeInteger,
  timeOfDay,
} from './primitives';
export {
  atLeastOneField,
  noExplicitNulls,
  noUnknownFields,
  objectFields,
  requiredFields,
} from './objectValidators';
