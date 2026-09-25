import { Router } from 'express';
import { createHealthRouter } from './healthRoutes';

/**
 * الراوتر الأساسي للـBackend.
 *
 * يُركَّب فيه كل راوتر فرعي في مكان واحد.
 * لا تُضاف في هذه المرحلة أي مسارات للموظفين أو الكتب أو الطلبات أو المصادقة
 * (تلك مسؤولية مراحل لاحقة).
 */
export function createRoutes(): Router {
  const router = Router();

  router.use('/health', createHealthRouter());

  return router;
}
