/**
 * controller الطلبات وسير الموافقة (Phase 19 · §35) — HTTP فقط.
 *
 * لا قاعدة أعمال هنا ولا في هذا الملف: الفرض على المسار
 * (`requestRoutes.ts`) والصلاحية `approve_request` على مسار الـworkflow،
 * والتحقق من الشكل قبل المسار، ونطاق الطلبات من `requestScopeOf`.
 * هذا الملف يقرأ `req` وينادي الخدمة ويكتب في `res` فقط.
 *
 * **بلا مسار DELETE** (§32): الإلغاء حالة `cancelled` عبر عملية
 * workflow، فلا يُحذف صف طلب ولا صف من تاريخه.
 */
import type { RequestHandler } from 'express';
import { servicesOf } from '../serviceContext';
import { requestScopeOf } from '../../authorization';
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
  CreateRequestDto,
  RequestListQuery,
  RequestWorkflowBody,
  UpdateRequestDto,
} from '../dto/request';

/** GET /api/requests — قائمة الطلبات ضمن نطاق الفاعل (§10.2/§10.3). */
export const listRequests: RequestHandler = asyncHandler(async (req, res) => {
  const filter = validatedQuery<RequestListQuery>(req);
  ok(res, await servicesOf(req).requests.list(filter, requestScopeOf(req)));
});

/** GET /api/requests/:id — طلب بتاريخ تغييرات الحالة وإجراءاته المتاحة. */
export const getRequest: RequestHandler = asyncHandler(async (req, res) => {
  ok(res, await servicesOf(req).requests.getById(pathId(req), requestScopeOf(req)));
});

/** POST /api/requests — إنشاء مسوّد (الحالة `draft` من الخادم لا من العميل). */
export const createRequest: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<CreateRequestDto>(req);
  const services = servicesOf(req);
  const actor = auditActor(req);
  const createdRequest = await services.requests.create(body, actor);
  // حدث التدقيق بعد نجاح العملية لا داخلها (§31: الترتيب الأمني
  // Authentication → Authorization → Scope → Resource → Audit).
  await services.audit.recordRequestCreate(actor, {
    requestId: createdRequest.id,
    employeeId: createdRequest.employeeId,
    kind: createdRequest.kind,
  });
  created(res, createdRequest);
});

/** PATCH /api/requests/:id — تعديل مسوّد بقفل تفاؤلي (`expectedVersion`). */
export const updateRequest: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<UpdateRequestDto>(req);
  const services = servicesOf(req);
  const id = pathId(req);
  const actor = auditActor(req);
  const updated = await services.requests.update(id, body, requestScopeOf(req));
  await services.audit.recordRequestUpdate(actor, {
    requestId: id,
    fields: Object.keys(body).filter((field) => field !== 'expectedVersion'),
  });
  ok(res, updated);
});

/**
 * POST /api/requests/:id/workflow — عملية واحدة من عمليات §35.
 *
 * **مسار واحد لكل الأفعال** لا مسار لكل فعل: الإجراء في الجسم ويقرأه
 * الخادم من `REQUEST_TRANSITIONS`؛ فالفرق بين `approve` و`reject` و
 * `employee_reply` فرق في **القاعدة** لا في المسار، وقاعدتها مكان واحد.
 * والصلاحيات تُفرض على المسار نفسه (`approve_request` للاستثناء في
 * `requirePermission`) لأن كل قرارات المدير تمرّ من هنا.
 *
 * الحارسون (409) يأتيان من الخدمة بعد نجاح الفرض: حالة لا تقبل الإجراء
 * ⇒ `REQUEST_TRANSITION_NOT_ALLOWED`، ونسخة قديمة ⇒ `VERSION_CONFLICT`.
 */
export const runRequestWorkflow: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<RequestWorkflowBody>(req);
  const services = servicesOf(req);
  const id = pathId(req);
  const actor = auditActor(req);
  // `previousStatus` ترجعها الخدمة من **الصفّ المقروء قبل الكتابة** —
  // لا من إعادة اشتقاق ولا من قراءة ثانية قد تتغيّر: نفس مصدر الحقيقة
  // الذي كتب `request_status_history` (§31 old/new).
  const outcome = await services.requests.workflow(id, body, requestScopeOf(req), actor);
  await services.audit.recordRequestTransition(actor, {
    requestId: id,
    action: body.action,
    fromStatus: outcome.previousStatus,
    toStatus: outcome.request.status,
    ...(body.comment !== undefined && { comment: body.comment }),
  });
  // Phase 21 (§20) — الحدث هنا هو **الانتقال نفسه**، لا كل كتابة:
  // `submit` ⇒ «طلب جديد للجهة التي يجب أن تتابعه» (المدير · §18)،
  // وأفعال قرار المدير ⇒ «تحديث طلب» لصاحب الطلب. أما `employee_reply`
  // و`cancel` فبلا إشعار: نصّ §20 لا يذكرهما، وإصدارهما كان سيخترع حدثاً.
  await emitRequestTransitionNotifications(services, body.action, outcome.request, id);
  ok(res, outcome.request);
});

/**
 * المرحلة 21 — إشعارات انتقال حالة الطلب (§20).
 *
 * الخريطة الحرفية، وكل حالة لها سندها:
 *
 * | الإجراء | الإشعار | المستلم | السند |
 * |---|---|---|---|
 * | `submit` | `new_request` | المدير | §18 «المنتسب يرسل الطلب» + §20 «طلب جديد للجهة التي يجب أن تتابعه» |
 * | `approve` · `reject` · `request_clarification` | `request_update` | صاحب الطلب | §18 «موافقة / رفض / طلب توضيح» + §20 «تحديث طلب» |
 * | `employee_reply` · `cancel` | **لا شيء** | — | لا نصّ في §20 · §18 |
 *
 * **`cancel` بلا إشعار قرار مقصود**: الإلغاء حالة نهائية من فعل صاحب
 * الطلب نفسه (§18)، فإشعار «تحديث طلب» له كان تنبيهاً لغيره بلا سند.
 *
 * **بلا حارس تاريخ هنا عمداً**: `requests` لا تحمل `imported_at`
 * (علم الاستيراد التاريخي المعتمد يخصّ `transactions`، 0002)، ولا يوجد في
 * النظام مسار يستورد طلبات (§30 يستورد الكتب والمرفقات فقط). فإضافة علم
 * تاريخي للطلبات كان سيخترع بنية لغير سبب — والحارس يبقى حيث سنده. (انظر
 * `PHASE_21_REPORT.md` §4.)
 */
async function emitRequestTransitionNotifications(
  services: ReturnType<typeof servicesOf>,
  action: RequestWorkflowBody['action'],
  request: { id: string; employeeId: string; kind: string },
  requestId: string,
): Promise<void> {
  const summary = `طلب ${request.kind}`;
  if (action === 'submit') {
    await services.notificationEvents.emitNewRequest(requestId, summary);
    return;
  }
  if (action === 'approve' || action === 'reject' || action === 'request_clarification') {
    await services.notificationEvents.emitRequestUpdate(
      requestId,
      summary,
      request.employeeId,
    );
  }
}