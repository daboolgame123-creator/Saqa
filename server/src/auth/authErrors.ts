/**
 * أخطاء المصادقة (Phase 11).
 *
 * قواعد ثابتة عبر هذه الأخطاء:
 * - **عدم الكشف**: خطأ الاعتماد لا يميّز بين «الرقم غير موجود» و«الرقم
 *   صحيح والرمز خطأ» (§11.4: «لا يكشف النظام هل الخطأ في الرقم أم الرمز»)،
 *   فكلاهما `InvalidCredentialsError` برسالة واحدة.
 * - **عدم تجاوز الفشل**: تعذّر فك الرمز لا يُعالَج كـ«دخول ناجح»؛
 *   المسار الوحيد البديل هو إعادة الضبط الإداري (§11.8).
 * - الرموز بالإنجليزية الثابتة ليقرأها العميل برمجياً، والرسائل
 *   قابلة للعرض.
 */
import { AppError } from '../errors';

/** لا توجد جلسة صالحة على الطلب (401). */
export class AuthenticationRequiredError extends AppError {
  constructor(message = 'يلزم تسجيل الدخول للوصول إلى هذا المورد.') {
    super(message, 401, 'AUTHENTICATION_REQUIRED');
  }
}

/**
 * بيانات اعتماد غير صحيحة (401) — نفس الرسالة والرمز سواء أخطأ الرقم
 * أو الرمز، فلا يخرج النظام بمعلومة عن أيّهما (§11.4).
 */
export class InvalidCredentialsError extends AppError {
  constructor() {
    super('بيانات الاعتماد غير صحيحة.', 401, 'INVALID_CREDENTIALS');
  }
}

/** الحساب محظور (§11.3) — الحظر يمنع الدخول نهائياً. */
export class AccountBlockedError extends AppError {
  constructor() {
    super('الحساب محظور ولا يسمح بالدخول.', 403, 'ACCOUNT_BLOCKED');
  }
}

/** الحساب مجمّد مؤقتاً بعد محاولات دخول فاشلة (§11.4). */
export class AccountFrozenError extends AppError {
  constructor(untilIso: string) {
    super(`الحساب مجمّد مؤقتاً حتى ${untilIso} بسبب محاولات دخول فاشلة.`, 403, 'ACCOUNT_FROZEN');
  }
}

/**
 * الرمز السري OTP غير صالح — موحّد عمداً بين حالاته المختلفة
 * (انتهاء الصلاحية، الاستخدام المكرر، الرمز الخاطئ، الإبطال بعد
 * خمس محاولات) حتى لا تكشف الرسالة أيّها، اتساقاً مع قاعدة «لا تكشف»
 * في §11.1 و§11.4.
 */
export class OtpInvalidError extends AppError {
  constructor() {
    super('الرمز السري غير صالح أو منتهي الصلاحية. اطلب رمزاً جديداً.', 400, 'OTP_INVALID');
  }
}

/** تجاوز حد طلبات OTP وحظر مؤقت (§11.5). */
export class OtpRateLimitedError extends AppError {
  constructor(untilIso: string) {
    super(`تم تجاوز حد طلبات الرموز السرية. أعد المحاولة بعد ${untilIso}.`, 429, 'OTP_RATE_LIMITED');
  }
}

/** الحساب مفعّل بلا سر مكتمل — خطأ داخلي في القاعدة لا مدخل من العميل. */
export class AccountIntegrityError extends AppError {
  constructor() {
    super('بيانات الحساب غير مكتملة.', 500, 'ACCOUNT_INTEGRITY', false);
  }
}

/**
 * تعذّر فك الرمز السري (مفتاح خاطئ/مفقود أو عبث بالقيمة) (503).
 *
 * §11.8: «أي تسريب أو فشل في المفتاح يؤدي إلى استخدام إعادة الضبط،
 * لا إلى تجاوز التشفير» — لذلك لا مسار احتياطي في هذا الخطأ.
 */
export class SecretUnavailableError extends AppError {
  constructor() {
    super(
      'تعذّر فك الرمز السري. استخدم إعادة الضبط الإداري، ولا يتم تجاوز التشفير.',
      503,
      'SECRET_UNAVAILABLE',
    );
  }
}

/** الحساب يحمل رمزاً مؤقتاً يجب تغييره قبل أي استخدام آخر (§11.7). */
export class SecretChangeRequiredError extends AppError {
  constructor() {
    super('يجب تغيير الرمز السري المؤقت قبل متابعة الاستخدام.', 403, 'SECRET_CHANGE_REQUIRED');
  }
}

/** الحساب المطلوب غير موجود (404) — في مسار إدارة الحسابات. */
export class AccountNotFoundError extends AppError {
  constructor(userId: string) {
    super(`الحساب بالمعرّف «${userId}» غير موجود.`, 404, 'RESOURCE_NOT_FOUND');
  }
}