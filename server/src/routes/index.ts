import { Router } from 'express';
import { createApiRouter } from '../api/routes';
import { createHealthRouter } from './healthRoutes';
import { createAuthRouter } from '../auth/authRoutes';

/**
 * الراوتر الأساسي للـBackend.
 *
 * Phase 8: /health فقط.
 * Phase 10: /api/* لطبقة البيانات (الموظفون، الكتب، الروابط، الموقف اليومي،
 * شؤون المنتسبين، الخط الزمني).
 * Phase 11: /api/auth/* للمصادقة (تسجيل، دخول، جلسات، OTP، استعادة،
 * إدارة الحسابات)، وربط `requireSession` بكل مسارات البيانات.
 */
export function createRoutes(): Router {
  const router = Router();

  router.use('/health', createHealthRouter());

  // المصادقة أول ما يُركَّب: مساراتها هي الوحيدة التي تعمل بلا هوية،
  // والعميل يحتاجها قبل أي قراءة بيانات.
  router.use('/api/auth', createAuthRouter());

  // طبقة البيانات: من هنا فصاعداً لا يمرّ طلب إلا بجلسة صالحة.
  router.use('/api', createApiRouter());

  return router;
}
