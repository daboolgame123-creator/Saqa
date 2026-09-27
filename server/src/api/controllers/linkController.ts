/**
 * controller روابط الكتاب بالمنتسب (Phase 10 — بند 3، BR-05).
 *
 * `DELETE /api/transaction-employees/:id` يزيل سطر العلاقة فقط.
 * لا يحذف الكتاب ولا الموظف — وهذا هو السلوك المعتمد (Phase 5/9).
 *
 * القراءة بمسار واحد `/api/transaction-employees` يتصرّف حسب المُعامل
 * الحاضر (transactionId أو employeeId): مساران لنفس الـURL تعارض في
 * Express، وطلب الطرفين معاً طلب غير مفهوم فيرفضه التحقق.
 */
import type { RequestHandler } from 'express';
import { servicesOf } from '../serviceContext';
import {
  asyncHandler,
  created,
  noContent,
  ok,
  pathId,
  validatedBody,
  validatedQuery,
} from './shared';
import type {
  CreateTransactionEmployeeDto,
  UpdateTransactionEmployeeDto,
} from '../dto';

/** مُعامل النطاق: الطرف الذي تُقرأ روابطه (مطلوب واحد فقط). */
interface LinkScopeQuery {
  transactionId?: string;
  employeeId?: string;
}

/**
 * GET /api/transaction-employees?transactionId=… | ?employeeId=…
 * يعيد 400 إن غاب الطرفان معاً — لا «كل الروابط» بلا نطاق.
 */
export const listLinks: RequestHandler = asyncHandler(async (req, res) => {
  const query = validatedQuery<LinkScopeQuery>(req);
  const services = servicesOf(req);
  const links =
    query.transactionId !== undefined
      ? await services.transactionEmployees.listByTransaction(query.transactionId)
      : await services.transactionEmployees.listByEmployee(query.employeeId as string);
  ok(res, links);
});

/** POST /api/transaction-employees — إنشاء رابط. */
export const createLink: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<CreateTransactionEmployeeDto>(req);
  const services = servicesOf(req);
  created(res, await services.transactionEmployees.create(body));
});

/** PATCH /api/transaction-employees/:id — تعديل الدور/الملاحظات. */
export const updateLink: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<UpdateTransactionEmployeeDto>(req);
  const services = servicesOf(req);
  ok(res, await services.transactionEmployees.update(pathId(req), body));
});

/** DELETE /api/transaction-employees/:id — إزالة الرابط فقط (204). */
export const removeLink: RequestHandler = asyncHandler(async (req, res) => {
  const services = servicesOf(req);
  await services.transactionEmployees.remove(pathId(req));
  noContent(res);
});

