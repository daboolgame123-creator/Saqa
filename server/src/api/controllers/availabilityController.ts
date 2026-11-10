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
  // الصفوف **المنشأة فعلاً** — ما لم يُنشأ (إتاحة سارية قائمة) ليس تغيير وصول
  // فلا يُدّعى في السجل ولا يُنشأ منه إشعار (§19: لا تكرار تقني).
  const grantedEmployeeIds = records.map((record) => record.employeeId);
  await services.audit.recordAvailabilityGrant(auditActor(req), {
    transactionId,
    employeeIds: grantedEmployeeIds,
  });
  // Phase 21 (§9.3 «عند الإتاحة … ينشأ إشعار داخلي إذا كان الحدث جديدًا»):
  // إشعار لكل منتسب أُتيحت له الكتاب **فعلاً**، بعد نجاح العملية.
  await emitBookAvailableNotifications(services, transactionId, grantedEmployeeIds);
  created(res, records);
});

/**
 * المرحلة 21 — إشعارات الإتاحة، مع **حارس الاستيراد التاريخي** (§37).
 *
 * `importedAt` يُقرأ من الكتاب نفسه: أرشيف 2022–2026 يدخل عبر
 * `imported_at`، ومنحه إتاحة يجب ألّا يُنتج «إشعاراً حديثاً مصطنعاً»
 * لمجرد أن الملف المُستورد قديم (§37 «هذا يمنع: إشعار جديد»).
 *
 * `importedAt === null` ⇐ كتاب حيّ. يُقرأ بـ`findById` بلا نطاق لأن
 * المسار إداري بصلاحية `manage_availability` أصلاً (الفاعل المسؤول
 * يرى كل النطاقات، §10.1) — نفس نهج `availabilityService.requireTransaction`.
 */
async function emitBookAvailableNotifications(
  services: ReturnType<typeof servicesOf>,
  transactionId: string,
  employeeIds: readonly string[],
): Promise<void> {
  if (employeeIds.length === 0) {
    return;
  }
  const book = await services.transactions.getById(transactionId);
  await services.notificationEvents.emitBookAvailable(
    transactionId,
    book.number,
    employeeIds,
    book.importedAt !== undefined && book.importedAt !== null,
  );
}

/** POST /api/transactions/:id/availability/bulk — منح جماعي للمرتبطين (§9.4). */
export const grantAvailabilityToLinked: RequestHandler = asyncHandler(async (req, res) => {
  const services = servicesOf(req);
  const transactionId = pathId(req);
  const records = await services.availability.grantToLinked(transactionId);
  const grantedEmployeeIds = records.map((record) => record.employeeId);
  await services.audit.recordAvailabilityGrant(auditActor(req), {
    transactionId,
    employeeIds: grantedEmployeeIds,
  });
  // نفس حدث الإتاحة (§9.4) ⇒ نفس الإشعار، بنفس حارس التاريخ.
  await emitBookAvailableNotifications(services, transactionId, grantedEmployeeIds);
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
