/**
 * controller البحث الموحد (Phase 22).
 *
 * HTTP فقط: يقرأ من req (بعد التحقق والتفويض)، ينادي الخدمة، يكتب في res.
 * لا استعلام قاعدة ولا تحقق ولا صلاحية هنا.
 */
import type { RequestHandler } from 'express';
import { servicesOf } from '../serviceContext';
import { transactionScopeOf } from '../../authorization';
import {
  asyncHandler,
  ok,
  validatedQuery,
} from './shared';
import type { SearchQuery } from '../dto';

/** GET /api/search — بحث موحد في المعاملات والمنتسبين ضمن نطاق الوصول. */
export const searchController: RequestHandler = asyncHandler(async (req, res) => {
  const query = validatedQuery<SearchQuery>(req);
  const scope = transactionScopeOf(req) ?? undefined;
  const services = servicesOf(req);
  ok(res, await services.search.run(query, scope));
});