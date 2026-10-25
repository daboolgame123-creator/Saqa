/**
 * السطح العام لطبقة المصادقة (Phase 11).
 *
 * الترحيل يستورد من هنا فقط، فلا يعرف بقية المشروع تفاصيل المستودعات
 * أو التشفير أو المزوّد. `authorization/` (RBAC) منفَّذ في Phase 12
 * كطبقة مستقلة، و`audit/` و`storage/` تبقى محجوزتين — لاهما جزء من
 * Phase 11.
 */
export {
  AuthService,
  createAuthServiceOnPool,
  getSharedAuthService,
  type AccountSummary,
  type ActorRef,
  type ChangeOwnSecretRequest,
  type LoginRequest,
  type LoginResult,
  type OtpRequestAccepted,
  type RegistrationOtpRequest,
  type VerifyOtpRequest,
} from './authService';
export { authServiceOf, useAuthService } from './serviceContext';
export { createAuthRouter } from './authRoutes';
export { requireChangedSecret, requireSession, type AuthenticatedRequest } from './sessionMiddleware';
export {
  createOtpProvider,
  createLogOtpProvider,
  createTestOtpProvider,
  type OtpDelivery,
  type OtpProvider,
  type TestOtpProvider,
} from './otpProvider';
export {
  ACCOUNT_STATUS_VALUES,
  OTP_PURPOSE_VALUES,
  type AccountRecord,
  type AccountStatus,
  type AuthenticatedIdentity,
  type OtpPurpose,
  type OtpRecord,
  type SessionRecord,
} from './authTypes';
export { SECRET_KEY_ID, type EncryptedSecret } from './secretVault';
export * from './authErrors';
