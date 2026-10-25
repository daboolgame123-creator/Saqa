/**
 * مسارات المصادقة (Phase 11) — تُركَّب على `/api/auth`.
 *
 * كل مسار يمرّ بالترتيب نفسه المستخدم في Phase 10:
 *   middleware التحقق ← controller ← معالج الأخطاء المركزي.
 *
 * المجموعات:
 * - **عامّة** (بلا جلسة): التسجيل والاستعادة والدخول — هي المداخل
 *   الوحيدة التي تعمل بلا هوية، لأن الهوية هي ما تعطيه.
 * - **محمية** (`requireSession`): الجلسات وتغيير الرمز — خدمات ذاتية
 *   لا تحتاج عائلة صلاحية: كل حساب يدير جلسته وسرّه (§11.9 و§11.7).
 * - **إدارية** (`requireSession` + صلاحية Phase 12): إعادة الضبط
 *   (`manage accounts` §11.7) وكشف الرمز (`manage security` §11.8) —
 *   الفرض على الخادم قبل الـcontroller، فالرفض 403 لدور لا يملكها.
 */
import { Router } from 'express';
import { requirePermission } from '../authorization';
import { validateApiRequest } from '../api/validation/validateApiRequest';
import { createValidationMiddleware } from '../validation/validateRequest';
import { requireSession } from './sessionMiddleware';
import {
  adminRevealSecret,
  adminResetAccount,
  changeOwnSecret,
  login,
  logout,
  me,
  requestRecoveryOtp,
  requestRegistrationOtp,
  verifyRecovery,
  verifyRegistration,
} from './authController';
import {
  accountIdParam,
  changeSecretBody,
  loginBody,
  recoveryOtpBody,
  registrationOtpBody,
  verifyRecoveryBody,
  verifyRegistrationBody,
} from './authValidators';

/** يبني راوتر المصادقة كاملاً. */
export function createAuthRouter(): Router {
  const router = Router();

  // ── عامّة: لا تتطلّب جلسة ──────────────────────────────────────
  router.post(
    '/registration/otp',
    validateApiRequest({ body: { validator: registrationOtpBody } }),
    requestRegistrationOtp,
  );
  router.post(
    '/registration/verify',
    validateApiRequest({ body: { validator: verifyRegistrationBody } }),
    verifyRegistration,
  );
  router.post(
    '/recovery/otp',
    validateApiRequest({ body: { validator: recoveryOtpBody } }),
    requestRecoveryOtp,
  );
  router.post(
    '/recovery/verify',
    validateApiRequest({ body: { validator: verifyRecoveryBody } }),
    verifyRecovery,
  );
  router.post('/login', validateApiRequest({ body: { validator: loginBody } }), login);

  // ── محمية: تتطلّب جلسة صالحة ───────────────────────────────────
  // `requireSession()` **مُستدعاة** لأنها مصنع (factory) يُرجع الوسيط،
  // لا الوسيط نفسه. تمريرها بلا استدعاء يجعل Express يناديها كوسيط،
  // فتعيد وسيطاً جديداً دون `next()` ولا استجابة — فيتعلّق الطلب.
  router.get('/me', requireSession(), me);
  router.post('/logout', requireSession(), logout);
  router.post(
    '/secret',
    requireSession(),
    validateApiRequest({ body: { validator: changeSecretBody } }),
    changeOwnSecret,
  );

  // ── إدارية: جلسة + صلاحية (Phase 12) ────────────────────────────
  // الترتيب: الهوية (401) ← فرض العائلة (403 PERMISSION_DENIED) ←
  // تحقق `params`. `createValidationMiddleware` (لا `validateApiRequest`)
  // لأن المطلوب هناك رفض قيمة غير صالحة فقط، لا حمل قيمة مُنقّاة إلى
  // الـcontroller — `pathId` يقرأ `:id` مباشرةً بعد نجاح التحقق.
  //
  // الإسناد: إعادة الضبط الإدارية من عائلة `manage accounts` (§10.1
  // «إعادة ضبط الحسابات» و§11.7 «المسؤول الإداري»)، وكشف الرمز من
  // `manage security` (§11.8 «مسؤولو السقاية»). المدير لا يملكهما
  // صراحةً في §10.2 («لا يستطيع إدارة حسابات المستخدمين»).
  const validAccountId = createValidationMiddleware({
    params: { validator: accountIdParam },
  });

  router.post(
    '/accounts/:id/reset',
    requireSession(),
    requirePermission('manage_accounts'),
    validAccountId,
    adminResetAccount,
  );
  router.get(
    '/accounts/:id/secret',
    requireSession(),
    requirePermission('manage_security'),
    validAccountId,
    adminRevealSecret,
  );

  return router;
}
