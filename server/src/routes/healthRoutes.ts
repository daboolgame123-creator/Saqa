import { Router } from 'express';
import { getHealth, getReadiness } from '../controllers';

/**
 * راوتر فحص الصحة والجاهزية — منفصل عن باقي راوترات الـAPI
 * حتى تبقى مسارات /health و/health/ready بسيطة ومستقلة.
 */
export function createHealthRouter(): Router {
  const router = Router();
  router.get('/', getHealth);
  router.get('/ready', getReadiness);
  return router;
}
