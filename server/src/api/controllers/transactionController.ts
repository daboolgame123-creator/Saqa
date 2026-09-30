/**
 * controller الكتاب (Phase 10 — بند 2؛ وُسّع في Phase 16).
 *
 * HTTP فقط. لا مسار `DELETE` فعلي: `DELETE /:id` هو **أرشفة ناعمة**
 * (§32) لا حذف — لا يمسّ الصف ولا علاقاته.
 *
 * الروابط لها controller مستقل لأن لها معرّفات ودورة حياة خاصة.
 */
import type { RequestHandler } from 'express';
import { servicesOf } from '../serviceContext';
import { transactionScopeOf } from '../../authorization';
import {
  asyncHandler,
  auditActor,
  created,
  ok,
  pathId,
  validatedBody,
  validatedQuery,
} from './shared';
import type {
  ArchiveTransactionQuery,
  CreateTransactionDto,
  RestoreTransactionQuery,
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

/**
 * DELETE /api/transactions/:id — **أرشفة** لا حذف (Phase 16 — §32).
 *
 * اسم `DELETE` يوحي بالحذف، وهو هنا مطابق لعائلة الصلاحية `delete_archive`
 * (§28)، أما الأثر فطوابع حالة على الصف نفسه. السبب اختياري في `?reason=`،
 * والفاعل من الجلسة لا من الطلب. حدث `archive` يُكتب بطبقة التدقيق
 * (Phase 15) لا هنا.
 */
export const archiveTransaction: RequestHandler = asyncHandler(async (req, res) => {
  const query = validatedQuery<ArchiveTransactionQuery>(req);
  const services = servicesOf(req);
  const id = pathId(req);
  const actor = auditActor(req);
  const archived = await services.transactions.archive(id, query, actor);
  await services.audit.recordTransactionArchive(actor, {
    transactionId: id,
    reason: archived.deleteReason ?? null,
    deletedAt: archived.deletedAt ?? '',
    deletedBy: archived.deletedBy ?? null,
  });
  ok(res, archived);
});

/**
 * POST /api/transactions/:id/restore — استعادة كتاب مؤرشف
 * (Phase 16 — §32، والنسخة المتوقعة Phase 17 — §33).
 * الكتاب نفسه يعود بهويته وروابطه ومرفقاته وسجلاته.
 * حدث التدقيق نوعه `update` مع `action: restore` (بلا نوع جديد)، وحالته
 * السابقة تأتي من معاملة الاستعادة نفسها لا من قراءة سابقة.
 */
export const restoreTransaction: RequestHandler = asyncHandler(async (req, res) => {
  const query = validatedQuery<RestoreTransactionQuery>(req);
  const services = servicesOf(req);
  const result = await services.transactions.restore(pathId(req), query.expectedVersion);
  await services.audit.recordTransactionRestore(auditActor(req), {
    transactionId: result.transaction.id,
    archivedAt: result.archivedAt,
    archivedBy: result.archivedBy,
    archiveReason: result.archiveReason,
  });
  ok(res, result.transaction);
});

/**
 * GET /api/transactions/archived — الاستعلام التاريخي الإداري
 * (Phase 16 — §32). خلف `delete_archive` في المسار: قراءة المؤرشف
 * مواكبة أرشفة لا رؤية عامة.
 */
export const listArchivedTransactions: RequestHandler = asyncHandler(async (req, res) => {
  const filter = validatedQuery<TransactionListQuery>(req);
  const scope = transactionScopeOf(req) ?? undefined;
  ok(res, await servicesOf(req).transactions.listArchived(filter, scope));
});
