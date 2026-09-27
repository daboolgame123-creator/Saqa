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
import { transactionScopeOf } from '../../authorization';
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

/** GET /api/transactions — قائمة مع تصفية وترقيم ونطاق الرؤية (§12/§29). */
export const listTransactions: RequestHandler = asyncHandler(async (req, res) => {
  const filter = validatedQuery<TransactionListQuery>(req);
  const scope = transactionScopeOf(req) ?? undefined;
  const services = servicesOf(req);
  ok(res, await services.transactions.list(filter, scope));
});

/** GET /api/transactions/:id — كتاب مع employeeIds ومرفقاته ضمن النطاق (§12/§29). */
export const getTransaction: RequestHandler = asyncHandler(async (req, res) => {
  const scope = transactionScopeOf(req) ?? undefined;
  const services = servicesOf(req);
  ok(res, await services.transactions.getById(pathId(req), scope));
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
