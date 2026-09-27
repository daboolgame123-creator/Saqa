/**
 * controller إتاحة الكتاب (Phase 13 — §9.3/§9.4 و§29).
 *
 * HTTP فقط: لا قرار صلاحية (المسارات تحمل `manage_availability`) ولا قرار
 * نطاق. `POST …/availability` هو المنح لمنتسب أو أكثر، و`…/availability/bulk`
 * هو المنح الجماعي للمرتبطين (§9.4)، و`DELETE …/availability/:employeeId`
 * يسحب إتاحة واحدة ويردّ 204 (لا حذف لكتاب ولا لمنتسب).
 */
import type { RequestHandler } from 'express';
import { servicesOf } from '../serviceContext';
import { asyncHandler, created, noContent, ok, pathId, validatedBody } from './shared';
import type { GrantAvailabilityDto } from '../dto';

/** GET /api/transactions/:id/availability — فحص السجل (ساري + مسحوب). */
export const inspectAvailability: RequestHandler = asyncHandler(async (req, res) => {
  const services = servicesOf(req);
  ok(res, await services.availability.inspect(pathId(req)));
});

/** POST /api/transactions/:id/availability — منح لمنتسب واحد أو عدة منتسبين. */
export const grantAvailability: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<GrantAvailabilityDto>(req);
  const services = servicesOf(req);
  created(res, await services.availability.grant(pathId(req), body.employeeIds));
});

/** POST /api/transactions/:id/availability/bulk — منح جماعي للمرتبطين (§9.4). */
export const grantAvailabilityToLinked: RequestHandler = asyncHandler(async (req, res) => {
  const services = servicesOf(req);
  created(res, await services.availability.grantToLinked(pathId(req)));
});

/** DELETE /api/transactions/:id/availability/:employeeId — سحب إتاحة. */
export const revokeAvailability: RequestHandler = asyncHandler(async (req, res) => {
  const services = servicesOf(req);
  await services.availability.revoke(pathId(req), pathId(req, 'employeeId'));
  noContent(res);
});
