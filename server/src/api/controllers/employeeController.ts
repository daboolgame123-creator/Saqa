/**
 * controller الموظف (Phase 10 — بند 1).
 *
 * HTTP فقط: يقرأ من `req` (بعد التحقق) وينادي الخدمة ويكتب في `res`.
 * لا استعلام قاعدة ولا تحقق ولا صلاحية هنا.
 *
 * لا مسار `DELETE`: الخطة §32 تمنع حذف الموظف؛ المتاح هو
 * `POST /:id/status` لنقله إلى «موظف سابق» مع سبب معتمد.
 */
import type { RequestHandler } from 'express';
import { servicesOf } from '../serviceContext';
import {
  auditActor,
  asyncHandler,
  created,
  ok,
  pathId,
  validatedBody,
  validatedQuery,
} from './shared';
import type {
  ChangeEmployeeStatusDto,
  CreateEmployeeDto,
  EmployeeListQuery,
  UpdateEmployeeDto,
} from '../dto';

/** GET /api/employees — قائمة مع تصفية status/search. */
export const listEmployees: RequestHandler = asyncHandler(async (req, res) => {
  const filter = validatedQuery<EmployeeListQuery>(req);
  ok(res, await servicesOf(req).employees.list(filter));
});

/** GET /api/employees/:id — موظف واحد أو 404. */
export const getEmployee: RequestHandler = asyncHandler(async (req, res) => {
  const services = servicesOf(req);
  ok(res, await services.employees.getById(pathId(req)));
});

/** POST /api/employees — إنشاء؛ المعرّف تولّده القاعدة. */
export const createEmployee: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<CreateEmployeeDto>(req);
  const services = servicesOf(req);
  created(res, await services.employees.create(body));
});

/** PATCH /api/employees/:id — تعديل جزئي. */
export const updateEmployee: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<UpdateEmployeeDto>(req);
  const services = servicesOf(req);
  ok(res, await services.employees.update(pathId(req), body));
});

/**
 * POST /api/employees/:id/status — نقل الحالة (لا حذف).
 *
 * Phase 15: الحالة تغيير حسّاس (§31 `status_change`)، فيُسجَّل بقيمتيه
 * old/new بعد نجاح النقل — والحالة السابقة تُقرأ **قبل** التغيير من
 * الخدمة نفسها لا من العميل. الفاعل من الجلسة (§31).
 */
export const changeEmployeeStatus: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<ChangeEmployeeStatusDto>(req);
  const services = servicesOf(req);
  const id = pathId(req);
  const previous = await services.employees.getById(id);
  const updated = await services.employees.changeStatus(id, body);
  await services.audit.recordEmployeeStatusChange(auditActor(req), {
    employeeId: id,
    previousStatus: previous.status,
    nextStatus: updated.status,
    ...(body.serviceEndReason === undefined ? {} : { serviceEndReason: body.serviceEndReason }),
  });
  ok(res, updated);
});

/** GET /api/employees/:id/status-history — سجل التغييرات. */
export const getEmployeeStatusHistory: RequestHandler = asyncHandler(async (req, res) => {
  const services = servicesOf(req);
  ok(res, await services.employees.statusHistory(pathId(req)));
});
