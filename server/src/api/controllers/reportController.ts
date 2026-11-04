/**
 * متحكم تقارير المرحلة 23 — Reports + Statistics + Export.
 *
 * المرجع: `ALSQAYA_PLAN.md` §39.
 *
 * HTTP فقط: يقرأ من `req` (بعد التحقق والتفويض)، ينادي الخدمة، يكتب في `res`.
 * لا استعلام قاعدة ولا تحقق ولا صلاحية هنا (تفرضها middleware على المسار).
 */

import type { RequestHandler } from 'express';
import { servicesOf } from '../serviceContext';
import { transactionScopeOf } from '../../authorization';
import {
  asyncHandler,
  ok,
  validatedQuery,
} from './shared';
import type { ReportFilter } from '../dto/report';

/** GET /api/reports — تقرير ضمن نطاق الوصول والصلاحية. */
export const reportController: RequestHandler = asyncHandler(async (req, res) => {
  const filter = validatedQuery<ReportFilter>(req);
  const scope = transactionScopeOf(req) ?? null;
  const services = servicesOf(req);
  ok(res, await services.report.run(filter, scope));
});