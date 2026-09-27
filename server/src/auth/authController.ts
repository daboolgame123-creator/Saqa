/**
 * controller المصادقة (Phase 11) — HTTP فقط.
 *
 * يقرأ من `req` بعد التحقق، وينادي `AuthService`، ويكتب في `res`.
 * لا استعلام قاعدة ولا تحقق ولا منطق أعمال هنا — كل شيء في الخدمة.
 *
 * الرفعة (sessionToken) تُسلَّم في **جسم الاستجابة** لا في ترويسة
 * مخصّصة، وتُعدّ قيمة سرّية: العميل مسؤول عن الاحتفاظ بها في ذاكرة
 * الجلسة. لا يوجد Remember Me (§11.9).
 */
import type { Request, RequestHandler, Response } from 'express';
import { asyncHandler, created, ok, pathId, validatedBody } from '../api/controllers/shared';
import { authServiceOf } from './serviceContext';
import type { AuthenticatedIdentity } from './authTypes';
import type {
  AccountTargetDto,
  ChangeSecretDto,
  LoginDto,
  RecoveryOtpDto,
  RegistrationOtpDto,
  VerifyOtpDto,
} from './authDto';

/** يقرأ هوية الجلسة من الحقل الذي يركّبه `requireSession`. */
function identityOf(req: Request): AuthenticatedIdentity {
  return (req as Request & { auth?: AuthenticatedIdentity }).auth as AuthenticatedIdentity;
}

/** POST /api/auth/registration/otp — محايد: لا يكشف نجاح المطابقة. */
export const requestRegistrationOtp: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<RegistrationOtpDto>(req);
  ok(res, await authServiceOf(req).requestRegistrationOtp(body));
});

/** POST /api/auth/registration/verify — يتحقق ويُنشئ الرمز ويُفعّل الحساب. */
export const verifyRegistration: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<VerifyOtpDto>(req);
  const account = await authServiceOf(req).verifyRegistrationOtp(body);
  created(res, { account });
});

/** POST /api/auth/recovery/otp — محايد تماماً. */
export const requestRecoveryOtp: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<RecoveryOtpDto>(req);
  ok(res, await authServiceOf(req).requestRecoveryOtp(body.phone));
});

/** POST /api/auth/recovery/verify — يستبدل الرمز السري. */
export const verifyRecovery: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<VerifyOtpDto>(req);
  const account = await authServiceOf(req).verifyRecoveryOtp(body);
  ok(res, { account });
});

/** POST /api/auth/login — يُنشئ الجلسة ويُعيد الرفعة. */
export const login: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<LoginDto>(req);
  const result = await authServiceOf(req).login(body);
  ok(res, {
    account: result.account,
    sessionToken: result.sessionToken,
    mustChangeSecret: result.mustChangeSecret,
  });
});

/** GET /api/auth/me — هوية الجلسة الحالية. */
export const me: RequestHandler = (req: Request, res: Response) => {
  const identity = identityOf(req);
  ok(res, {
    userId: identity.userId,
    employeeId: identity.employeeId,
    username: identity.username,
    displayName: identity.displayName,
    role: identity.role,
  });
};

/** POST /api/auth/logout — يهدم الجلسة الحالية فقط (§11.9). */
export const logout: RequestHandler = asyncHandler(async (req, res) => {
  await authServiceOf(req).logout(identityOf(req));
  res.status(204).send();
});

/** POST /api/auth/secret — تغيير الرمز السري للحساب نفسه (§11.7). */
export const changeOwnSecret: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<ChangeSecretDto>(req);
  const account = await authServiceOf(req).changeOwnSecret(identityOf(req), body);
  ok(res, { account });
});

/** POST /api/auth/accounts/:id/reset — إعادة ضبط إدارية (§11.7). */
export const adminResetAccount: RequestHandler = asyncHandler(async (req, res) => {
  const target = pathId(req, 'id') as AccountTargetDto['userId'];
  const identity = identityOf(req);
  const result = await authServiceOf(req).adminResetAccountSecret(
    { userId: identity.userId, employeeId: identity.employeeId },
    target,
  );
  ok(res, { account: result.account, temporarySecret: result.temporarySecret });
});

/** GET /api/auth/accounts/:id/secret — كشف الرمز الحالي (§11.8). */
export const adminRevealSecret: RequestHandler = asyncHandler(async (req, res) => {
  const target = pathId(req, 'id') as AccountTargetDto['userId'];
  const identity = identityOf(req);
  const result = await authServiceOf(req).revealAccountSecret(
    { userId: identity.userId, employeeId: identity.employeeId },
    target,
  );
  ok(res, { account: result.account, secret: result.secret });
});
