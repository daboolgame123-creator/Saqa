/**
 * مسار تقارير المرحلة 23 — Reports + Statistics + Export.
 *
 * المرجع: `ALSQAYA_PLAN.md` §39.
 *
 * الطبقات الإلزامية:
 *   1) validateApiRequest — يتحقق من reportType والفلتر.
 *   2) controller — يقرأ validatedQuery وينادي الخدمة.
 *
 * الهوية (`requireSession`)، فرض الصلاحية (`requireResourcePermission` ← view)،
 * ونطاق الوصول (`attachAccessScope`) تُركّب كلها عالمياً في routes/index.ts
 * قبل هذا الراوتر، فتبقى هذه الطبقة نقلاً محايداً.
 */
import { Router } from 'express';
import { validateApiRequest } from '../validation/validateApiRequest';
import { reportQuery } from '../validation/reportValidators';
import { reportController } from '../controllers';

export function createReportRouter(): Router {
  const router = Router();
  // P0: SQL/ownership remain incomplete. Keep every report path unavailable.
  // See PHASE_23_DECISIONS.md; restoring wiring must not enable these queries.
  router.use((_req, res) => {
    res.status(503).json({
      error: { code: 'REPORTS_UNAVAILABLE', message: 'التقارير غير متاحة حالياً.' },
    });
  });
  router.get(
    '/',
    validateApiRequest({ query: { validator: reportQuery } }),
    reportController,
  );
  return router;
}
