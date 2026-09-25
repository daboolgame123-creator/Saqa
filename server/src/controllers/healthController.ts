import type { RequestHandler } from 'express';
import { HealthService, ReadinessService } from '../health';

/** GET /health — هل عملية الـBackend تعمل؟ */
export const getHealth: RequestHandler = (_req, res) => {
  res.status(200).json(HealthService.getStatus());
};

/**
 * GET /health/ready — هل الـBackend جاهز لاستقبال الطلبات؟
 * يعيد 200 عند الجاهزية، و503 مع استجابة منظمة عند عدمها.
 */
export const getReadiness: RequestHandler = (_req, res) => {
  const status = ReadinessService.getStatus();
  res.status(status.status === 'ready' ? 200 : 503).json(status);
};

