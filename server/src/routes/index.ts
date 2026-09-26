import { Router } from 'express';
import { createApiRouter } from '../api/routes';
import { createHealthRouter } from './healthRoutes';

/**
 * الراوتر الأساسي للـBackend.
 *
 * Phase 8: /health فقط.
 * Phase 10: /api/* لطبقة البيانات (الموظفون، الكتب، الروابط، الموقف اليومي،
 * شؤون المنتسبين، الخط الزمني).
 *
 * لا مسارات المصادقة: Accounts/JWT/OTP مرحلة 11، وRBAC مرحلة 12،
 * وAccess Scope مرحلة 13 — لا شيء منها مُنفَّذ في هذه المرحلة.
 */
export function createRoutes(): Router {
  const router = Router();

  router.use('/health', createHealthRouter());
  router.use('/api', createApiRouter());

  return router;
}
