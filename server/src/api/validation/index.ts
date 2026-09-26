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
export * from './linkValidators';
export * from './dailySituationValidators';
export * from './personnelValidators';
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
