/**
 * سياق خدمة المصادقة للطلب (Phase 11).
 *
 * نفس نمط `api/serviceContext.ts` في Phase 10: الإنتاج يضع خدمة على
 * `res.locals`، والاختبار تحقنها على Pool قاعدة الاختبار المعزولة،
 * فلا يُفتح `DATABASE_URL` ولا تتفرّع شيفرة الإنتاج.
 */
import type { NextFunction, Request, Response } from 'express';
import { getSharedAuthService, type AuthService } from './authService';

export type { AuthService };

/** يحقن خدمة المصادقة في كل طلب. */
export function useAuthService(service: AuthService) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.locals.authService = service;
    next();
  };
}

/** يعيد خدمة الطلب المحقونة، وإلا الخدمة المشتركة. */
export function authServiceOf(req: Request): AuthService {
  const injected = req.res?.locals?.authService as AuthService | undefined;
  return injected ?? getSharedAuthService();
}
