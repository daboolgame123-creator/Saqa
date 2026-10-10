/**
 * controller الخط الزمني (Phase 10 — بند 6: قراءة فقط).
 *
 * لا يوجد create/update/delete: الخط الزمني ناتج مشتق (الخطة §22 و§7.17)
 * ولا جدول له. القراءة تحسب من المصادر الأصلية في القاعدة.
 */
import type { RequestHandler } from 'express';
import { servicesOf } from '../serviceContext';
import { transactionScopeOf } from '../../authorization';
import { asyncHandler, ok, validatedQuery } from './shared';
import type { TimelineQuery } from '../dto';

/**
 * GET /api/timeline?employeeId=… — أحداث منتسب واحد مع إحصاءاتها.
 * `scope` (Phase 13) يمنع تسرّب الكتب المحجوبة عبر أحداث الخط الزمني.
 */
export const getTimeline: RequestHandler = asyncHandler(async (req, res) => {
  const query = validatedQuery<TimelineQuery>(req);
  const scope = transactionScopeOf(req) ?? undefined;
  const services = servicesOf(req);
  ok(res, await services.timeline.forEmployee(query, scope));
});
