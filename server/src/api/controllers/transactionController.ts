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
  TransitionTransactionStatusDto,
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

/**
 * POST /api/transactions — إنشاء مع روابطه ومرفقاته في معاملة واحدة.
 *
 * Phase 20: الاستجابة 201 كما كانت **بلا تغيير في رمزها**، ومعها حقل
 * `duplicateWarning` تحذيراً (§36 «لا يمنع الإدخال تلقائياً»). الفحص
 * بعد الكتابة، فلا يملك هذا المسار أي قدرة تُنتج تنبيهاً يمنع
 * الإدخال. وحدث التدقيق `create` يُكتب بعد نجاح العملية (Phase 15).
 */
export const createTransaction: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<CreateTransactionDto>(req);
  const scope = transactionScopeOf(req) ?? undefined;
  const services = servicesOf(req);
  const actor = auditActor(req);
  const createdRecord = await services.transactions.create(body, scope);
  await services.audit.recordTransactionCreate(actor, {
    transactionId: createdRecord.id,
    direction: createdRecord.direction,
    number: createdRecord.number,
    status: createdRecord.status,
    importedAt: createdRecord.importedAt ?? null,
  });
  // Phase 21 (§9.1 + §20 «كتاب إعمام جديد»): إعمام عام = كتاب **وارد**
  // بنطاق `PublicToEmployees` (§9.1 حرفياً) — فليس كل كتاب وارد إعماماً،
  // والإشعار لا يُنشأ إلا لهذا التركيب لا لغيره.
  await emitNewBroadcastNotification(services, createdRecord);
  created(res, createdRecord);
});

/**
 * المرحلة 21 — هل الكتاب **إعمام عام** يستحق إشعار `new_broadcast`؟
 *
 * الشرط معاً من نصّ §9.1 لا اجتهاد:
 * - `direction === 'وارد'` — «الكتاب يصنّف كتاباً وارداً، ثم يُمنح نطاق
 *   رؤية `PublicToEmployees`»؛ فالصادر أو الداخلي ليس إعماماً.
 * - `visibility === 'PublicToEmployees'` — النطاق الذي يراه «كل المنتسبين»
 *   بلا إتاحة (§9.1)؛ وهو شرط **«إعمام عام»** بعينه في نصّ Phase 20.
 *
 * **وحارس التاريخ**: كتاب من أرشيف 2022–2026 يحمل `imported_at`، وإشعار
 * «إعمام جديد» عنه تنبيه حديث مصطنع لمجرّد أن الاستيراد تمّ الآن (§37
 * «تنبيه مصطنع»). فـ`importedAt` غير الفارغ يمنع الإنشاء **قبل** الكتابة.
 */
async function emitNewBroadcastNotification(
  services: ReturnType<typeof servicesOf>,
  record: { id: string; number: string; direction: string; visibility?: string; importedAt?: string | null },
): Promise<void> {
  const isGeneralCircular =
    record.direction === 'وارد' && record.visibility === 'PublicToEmployees';
  if (!isGeneralCircular) {
    return;
  }
  await services.notificationEvents.emitNewBroadcast(
    record.id,
    record.number,
    record.importedAt !== undefined && record.importedAt !== null,
  );
}

/**
 * PATCH /api/transactions/:id — تعديل جزئي (بلا روابط).
 *
 * Phase 20: حدث `update` يُكتب بعد النجاح. `status` يبقى قابلاً
 * للتعديل هنا (سلوك قائم منذ Phase 10 ولا تُلغيه)، لكن **مسار الانتقال
 * المخصّص** هو `POST /:id/status` لأنه حدث `status_change` مستقلّ
 * بالقيمة قبل/بعد — وفيه القفل نفسه إلزامياً.
 */
export const updateTransaction: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<UpdateTransactionDto>(req);
  const services = servicesOf(req);
  const id = pathId(req);
  const before = await services.transactions.getById(id);
  const { expectedVersion, ...patch } = body;
  const updated = await services.transactions.update(id, { ...patch, expectedVersion });
  await services.audit.recordTransactionUpdate(auditActor(req), {
    transactionId: id,
    fields: Object.keys(patch),
    fromStatus: before.status,
    toStatus: updated.status,
  });
  ok(res, updated);
});

/**
 * POST /api/transactions/:id/status — انتقال حالة الكتاب
 * (Phase 20 — §36).
 *
 * عائلة المسار `create` (خريطة §28) ⇒ `admin` وحده؛ المدير إشرافي لا
 * يُعدّل (§10.2) والمنتسب `view` (§10.3) فيُرفضان 403 من الخادم.
 *
 * `expectedVersion` إلزامية: الانتقال كتابة على `transactions` فلا
 * يتجاوز القفل التفاؤلي (Phase 17 — §33)؛ نسخة قديمة ⇒ 409 بلا كتابة،
 * وكتاب مؤرشف أو غير موجود ⇒ 404 (حجب وجود). الحدث `status_change`
 * يُكتب بعد النجاح فقط.
 */
export const transitionTransactionStatus: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<TransitionTransactionStatusDto>(req);
  const services = servicesOf(req);
  const result = await services.transactions.transitionStatus(pathId(req), body);
  await services.audit.recordTransactionStatusTransition(auditActor(req), {
    transactionId: result.transaction.id,
    fromStatus: result.fromStatus,
    toStatus: result.transaction.status,
  });
  ok(res, result.transaction);
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
