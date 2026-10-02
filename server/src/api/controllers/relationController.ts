/**
 * controller ارتباط الكتب (Phase 20 — §36 «Related Books»).
 *
 * HTTP فقط. ثلاث عمليات على `/api/transactions/:id/relations`:
 * - `GET`    — قراءة الاتجاهين ضمن نطاق الرؤية.
 * - `POST`   — «كتاب A يشير إلى كتاب B».
 * - `DELETE` — إزالة **سطر** العلاقة (لا كتاب ولا طرف؛ §32).
 *
 * Families الصلاحية من خريطة الـmethod (§28) بلا استثناء جديد:
 * `GET ← view` · `POST ← create` · `DELETE ← delete_archive`.
 * `DELETE` هنا **لا يعني حذف كتاب**: عائلة `delete_archive` هي عائلة
 * «delete/archive» في §28، وموضوعها سطر العلاقة. وكونها `admin` وحده
 * متّسق مع §10.1 (المسؤول يدير الكتب)؛ المدير إشرافي لا يُعدّل
 * (§10.2) والمنتسب `view` فقط (§10.3) — فيُرفضان 403 من الخادم.
 *
 * **النطاق** (Phase 13) يقرأه `transactionScopeOf` ويمرّره للخدمة، فهو
 * مقروء هنا بلا حساب ولا تكرار شرط.
 */
import type { RequestHandler } from 'express';
import { servicesOf } from '../serviceContext';
import { transactionScopeOf } from '../../authorization';
import { asyncHandler, auditActor, created, noContent, ok, pathId, validatedBody } from './shared';
import type { CreateTransactionRelationDto } from '../dto';

/** GET /api/transactions/:id/relations — الكتب المرتبطة (الاتجاهان). */
export const listTransactionRelations: RequestHandler = asyncHandler(async (req, res) => {
  const scope = transactionScopeOf(req) ?? undefined;
  ok(res, await servicesOf(req).transactionRelations.list(pathId(req), scope));
});

/**
 * POST /api/transactions/:id/relations — إنشاء ارتباط.
 *
 * الفاعل في `createdBy` من هوية الجلسة لا من الجسم، ويُسجَّل حدث تدقيق
 * `create` على كيان الكتاب بعد نجاح العملية (Phase 15 — §31).
 */
export const createTransactionRelation: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<CreateTransactionRelationDto>(req);
  const services = servicesOf(req);
  const actor = auditActor(req);
  const transactionId = pathId(req);
  const relation = await services.transactionRelations.create(
    transactionId,
    body,
    actor.userId,
  );
  await services.audit.recordRelationCreate(actor, {
    transactionId,
    relatedTransactionId: relation.relatedTransactionId,
    relationId: relation.id,
  });
  created(res, relation);
});

/** DELETE /api/transactions/:id/relations/:relationId — إزالة سطر العلاقة (204). */
export const removeTransactionRelation: RequestHandler = asyncHandler(async (req, res) => {
  const services = servicesOf(req);
  const transactionId = pathId(req);
  const relationId = pathId(req, 'relationId');
  await services.transactionRelations.remove(relationId);
  await services.audit.recordRelationRemove(auditActor(req), {
    transactionId,
    relationId,
  });
  noContent(res);
});