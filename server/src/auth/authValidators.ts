/**
 * مُحقِّقات مدخلات المصادقة (Phase 11).
 *
 * تركيب على أدوات Phase 10 (`primitives` / `objectValidators`) بلا
 * تكرار. لا تُكتب هنا أي قاعدة أعمال — الشكل فقط، ومطابقة الأرقام
 * لحقول §11.
 *
 * قيود الأرقام السرية: 6 أرقام بالضبط (§11.5) — «000000» مسموح لأنه
 * مُخرَج عشوائي لا مُدخل منظَّم.
 */
import { nonEmptyText, pipeline } from '../api/validation';
import { noExplicitNulls, objectFields, requiredFields } from '../api/validation/objectValidators';
import { OTP_LENGTH, SECRET_MAX_LENGTH, SECRET_MIN_LENGTH } from './authTypes';
import { invalidOutcome, validOutcome, type Validator } from '../validation/validationTypes';
import type {
  AccountTargetDto,
  ChangeSecretDto,
  LoginDto,
  RecoveryOtpDto,
  RegistrationOtpDto,
  VerifyOtpDto,
} from './authDto';

/** رمز OTP: 6 أرقام بلا مسافات (§11.5). */
function otpCode(field: string): Validator<unknown, string> {
  return (input) =>
    typeof input === 'string' && new RegExp(`^\\d{${OTP_LENGTH}}$`).test(input)
      ? validOutcome(input)
      : invalidOutcome([{ field, message: `رمز التحقق يجب أن يكون ${OTP_LENGTH} أرقام.` }]);
}

/** رقم هاتف: نص غير فارغ (لا نمط تفرضه الخطة على الصيغة). */
const phoneField = (field: string): Validator<unknown, string> => nonEmptyText(field);

/** رمز سري: غير فارغ ضمن حدَّي الطول التقنيين. */
function secretField(field: string): Validator<unknown, string> {
  return (input) =>
    typeof input === 'string' &&
    input.trim().length >= SECRET_MIN_LENGTH &&
    input.length <= SECRET_MAX_LENGTH
      ? validOutcome(input)
      : invalidOutcome([
          {
            field,
            message: `الرمز السري مطلوب بطول بين ${SECRET_MIN_LENGTH} و${SECRET_MAX_LENGTH} محرفاً.`,
          },
        ]);
}

/** POST /api/auth/registration/otp */
export const registrationOtpBody: Validator<unknown, RegistrationOtpDto> = pipeline([
  noExplicitNulls(['badgeNumber', 'phone']),
  requiredFields(['badgeNumber', 'phone']),
  objectFields<RegistrationOtpDto>({
    badgeNumber: nonEmptyText('badgeNumber'),
    phone: phoneField('phone'),
  }),
]);

/** POST /api/auth/registration/verify */
export const verifyRegistrationBody: Validator<unknown, VerifyOtpDto> = pipeline([
  noExplicitNulls(['phone', 'code', 'secret']),
  requiredFields(['phone', 'code', 'secret']),
  objectFields<VerifyOtpDto>({
    phone: phoneField('phone'),
    code: otpCode('code'),
    secret: secretField('secret'),
  }),
]);

/** POST /api/auth/recovery/otp */
export const recoveryOtpBody: Validator<unknown, RecoveryOtpDto> = pipeline([
  noExplicitNulls(['phone']),
  requiredFields(['phone']),
  objectFields<RecoveryOtpDto>({ phone: phoneField('phone') }),
]);

/** POST /api/auth/recovery/verify */
export const verifyRecoveryBody: Validator<unknown, VerifyOtpDto> = pipeline([
  noExplicitNulls(['phone', 'code', 'secret']),
  requiredFields(['phone', 'code', 'secret']),
  objectFields<VerifyOtpDto>({
    phone: phoneField('phone'),
    code: otpCode('code'),
    secret: secretField('secret'),
  }),
]);

/** POST /api/auth/login */
export const loginBody: Validator<unknown, LoginDto> = pipeline([
  noExplicitNulls(['identifier', 'secret']),
  requiredFields(['identifier', 'secret']),
  objectFields<LoginDto>({
    identifier: nonEmptyText('identifier'),
    secret: secretField('secret'),
  }),
]);

/** POST /api/auth/secret */
export const changeSecretBody: Validator<unknown, ChangeSecretDto> = pipeline([
  noExplicitNulls(['currentSecret', 'newSecret']),
  requiredFields(['currentSecret', 'newSecret']),
  objectFields<ChangeSecretDto>({
    currentSecret: secretField('currentSecret'),
    newSecret: secretField('newSecret'),
  }),
]);

/**
 * مسار `:id` — يتحقق أنه UUID قبل استخدامه في استعلام.
 *
 * `createValidationMiddleware` يمرّر `req.params` كاملاً (كائن `{ id }`)
 * لا قيمة المسار نفسها، فيقرأ هذا المُحقِّق الحقل `id` من الكائن.
 */
export const accountIdParam: Validator<unknown, string> = (input) => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const value =
    typeof input === 'string'
      ? input
      : input !== null && typeof input === 'object'
        ? (input as { id?: unknown }).id
        : undefined;
  return typeof value === 'string' && uuidPattern.test(value)
    ? validOutcome(value)
    : invalidOutcome([{ field: 'id', message: 'معرّف الحساب يجب أن يكون UUID صالحاً.' }]);
};
