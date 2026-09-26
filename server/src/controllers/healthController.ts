import type { RequestHandler } from 'express';
import { HealthService, ReadinessService } from '../health';

/** GET /health — هل عملية الـBackend تعمل؟ */
export const getHealth: RequestHandler = (_req, res) => {
  res.status(200).json(HealthService.getStatus());
};

/**
 * GET /health/ready — هل الـBackend جاهز لاستقبال الطلبات؟
 * يعيد 200 عند الجاهزية، و503 مع استجابة منظمة عند عدمها.
 * الفحص غير متزامن في Phase 10 (فحص قاعدة البيانات بمهلة).
 */
export const getReadiness: RequestHandler = (_req, res, next) => {
  ReadinessService.getStatus().then(
    (status) => {
      res.status(status.status === 'ready' ? 200 : 503).json(status);
    },
    (error: unknown) => {
      next(error);
    },
  );
};

