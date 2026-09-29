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
import { auditActor, asyncHandler, created, noContent, ok, pathId, validatedBody } from './shared';
import type { GrantAvailabilityDto } from '../dto';

/** GET /api/transactions/:id/availability — فحص السجل (ساري + مسحوب). */
export const inspectAvailability: RequestHandler = asyncHandler(async (req, res) => {
  const services = servicesOf(req);
  ok(res, await services.availability.inspect(pathId(req)));
});

/**
 * POST /api/transactions/:id/availability — منح لمنتسب واحد أو عدة منتسبين.
 *
 * بعد نجاح المنح يُسجَّل حدث تدقيق (§31): تغيير وصول حسّاس بعائلة
 * `create` وفاعله من الجلسة. المسار خلف `manage_availability` أصلاً.
 */
export const grantAvailability: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<GrantAvailabilityDto>(req);
  const services = servicesOf(req);
  const transactionId = pathId(req);
  const records = await services.availability.grant(transactionId, body.employeeIds);
  await services.audit.recordAvailabilityGrant(auditActor(req), {
    transactionId,
    // الصفوف **المنشأة فعلاً** — ما لم يُنشأ (إتاحة سارية قائمة) ليس
    // تغيير وصول فلا يُدّعى في السجل.
    employeeIds: records.map((record) => record.employeeId),
  });
  created(res, records);
});

/** POST /api/transactions/:id/availability/bulk — منح جماعي للمرتبطين (§9.4). */
export const grantAvailabilityToLinked: RequestHandler = asyncHandler(async (req, res) => {
  const services = servicesOf(req);
  const transactionId = pathId(req);
  const records = await services.availability.grantToLinked(transactionId);
  await services.audit.recordAvailabilityGrant(auditActor(req), {
    transactionId,
    employeeIds: records.map((record) => record.employeeId),
  });
  created(res, records);
});

/**
 * DELETE /api/transactions/:id/availability/:employeeId — سحب إتاحة.
 *
 * سحب تحديث لا حذف (§9.3): الكتاب وسجل الاطلاع السابق لا يُمسّان،
 * والحدث يُسجَّل بقيمته قبل/بعد كتغيير وصول.
 */
export const revokeAvailability: RequestHandler = asyncHandler(async (req, res) => {
  const services = servicesOf(req);
  const transactionId = pathId(req);
  const employeeId = pathId(req, 'employeeId');
  await services.availability.revoke(transactionId, employeeId);
  await services.audit.recordAvailabilityRevoke(auditActor(req), { transactionId, employeeId });
  noContent(res);
});
