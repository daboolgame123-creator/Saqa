/**
 * controller الكتاب (Phase 10 — بند 2).
 *
 * HTTP فقط. لا مسار `DELETE`: الكتاب لا يُحذف في الاستخدام الإداري
 * (§13/§32)، والحذف الناعم مرحلة لاحقة (Phase 16).
 *
 * الروابط لها controller مستقل لأن لها معرّفات ودورة حياة خاصة.
 */
import type { RequestHandler } from 'express';
import { servicesOf } from '../serviceContext';
import {
  asyncHandler,
  created,
  ok,
  pathId,
  validatedBody,
  validatedQuery,
} from './shared';
import type {
  CreateTransactionDto,
  TransactionListQuery,
  UpdateTransactionDto,
} from '../dto';

/** GET /api/transactions — قائمة مع تصفية وترقيم. */
export const listTransactions: RequestHandler = asyncHandler(async (req, res) => {
  const filter = validatedQuery<TransactionListQuery>(req);
  const services = servicesOf(req);
  ok(res, await services.transactions.list(filter));
});

/** GET /api/transactions/:id — كتاب مع employeeIds ومرفقاته. */
export const getTransaction: RequestHandler = asyncHandler(async (req, res) => {
  const services = servicesOf(req);
  ok(res, await services.transactions.getById(pathId(req)));
});

/** POST /api/transactions — إنشاء مع روابطه ومرفقاته في معاملة واحدة. */
export const createTransaction: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<CreateTransactionDto>(req);
  const services = servicesOf(req);
  created(res, await services.transactions.create(body));
});

/** PATCH /api/transactions/:id — تعديل جزئي (بلا روابط). */
export const updateTransaction: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<UpdateTransactionDto>(req);
  const services = servicesOf(req);
  ok(res, await services.transactions.update(pathId(req), body));
});
