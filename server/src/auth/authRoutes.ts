/**
 * مسارات المصادقة (Phase 11) — تُركَّب على `/api/auth`.
 *
 * كل مسار يمرّ بالترتيب نفسه المستخدم في Phase 10:
 *   middleware التحقق ← controller ← معالج الأخطاء المركزي.
 *
 * المجموعات:
 * - **عامّة** (بلا جلسة): التسجيل والاستعادة والدخول — هي المداخل
 *   الوحيدة التي تعمل بلا هوية، لأن الهوية هي ما تعطيه.
 * - **محمية** (`requireSession`): الجلسات وتغيير الرمز.
 * - **إدارية** (`requireSession` + صلاحية Phase 12 لاحقاً): إعادة
 *   الضبط وكشف الرمز.
 */
import { Router } from 'express';
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

  // ── إدارية: جلسة + فحص الدور (Phase 12) ───────────────────────
  // `createValidationMiddleware` (لا `validateApiRequest`) لـ`params`:
  // المطلوب هناك رفض قيمة غير صالحة فقط، لا حمل قيمة مُنقّاة إلى
  // الـcontroller — `pathId` يقرأ `:id` مباشرةً بعد نجاح التحقق.
  const validAccountId = createValidationMiddleware({
    params: { validator: accountIdParam },
  });

  router.post('/accounts/:id/reset', requireSession(), validAccountId, adminResetAccount);
  router.get('/accounts/:id/secret', requireSession(), validAccountId, adminRevealSecret);

  return router;
}
