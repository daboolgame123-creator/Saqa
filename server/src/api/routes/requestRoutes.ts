/**
 * راوتر الطلبات وسير الموافقة (Phase 19 · §35).
 *
 * `/api/requests` — بند مستقل على مسار مستقل صراحةً (بعد `/courses`).
 *
 * الفرض هنا **صريح لا موروث**، لأمرين في §35:
 * 1. **القرار ليس CRUD.** «اعتماد/رفض الطلب إجراءات Workflow خاص … وليس
 *    صلاحية CRUD عامة على بيانات المنتسب» (§10.2). لذلك `POST
 *    /:id/workflow` يحمل `requirePermission('approve_request')` صريحاً
 *    — نفس استثناء المسار المسجَّل في `requirePermission`،(Server-side)
 *    فالمدير ينفّذ القرار ولا يستطيع إنشاء/تعديل ملفات المنتسب (§10.2
 *    «لا يستطيع»).
 * 2. **لا استنتاج أمني من method.** `POST` = `create` عموماً، وهي
 *    `admin` وحده؛ لولا الاستثناء لما استطاع صاحب `approve_request`
 *    الاعتماد. فالفرق بين «ينشئ» و«يقرّر» صريح لا ضمني.
 *
 * القراءة `view` والتعديل `update` والإنشاء `create` من خريطة §28
 * القائمة بلا صلاحية جديدة. **بلا `DELETE`** (§32): الإلغاء حالة.
 *
 * **حدّ معلن (Business Rule Blocker):** لا مسار مستقل لـ«ردّ المنتسب»
 * ولا لـ«إرسال الطلب»؛ فالعملية الواحدة `/workflow` تمرّ كلها على
 * `approve_request` لأن الخطة لم تقرّر بعد أي صلاحية يملكها صاحب الطلب
 * (§10.3 `view` فقط مقابل «employee reply» في §35). موثّق في
 * `PHASE_19_REPORT.md` §5 ولا يُخترع له حل.
 */
import { Router } from 'express';
import { requireRequestWorkflowPermission } from '../../authorization';
import {
  createRequest,
  getRequest,
  listRequests,
  runRequestWorkflow,
  updateRequest,
} from '../controllers/requestController';
import { validateApiRequest } from '../validation/validateApiRequest';
import {
  createRequestBody,
  requestListQuery,
  requestTransitionBody,
  updateRequestBody,
} from '../validation';

/** راوتر الطلبات — قراءة + تعديل مسوّد + عملية Workflow واحدة. */
export function createRequestsRouter(): Router {
  const router = Router();
  router.get('/', validateApiRequest({ query: { validator: requestListQuery } }), listRequests);
  router.get('/:id', getRequest);
  router.post('/', validateApiRequest({ body: { validator: createRequestBody } }), createRequest);
  router.patch(
    '/:id',
    validateApiRequest({ body: { validator: updateRequestBody } }),
    updateRequest,
  );
  // كل عمليات §35 تمرّ هنا، والفرض **بحسب الإجراء**: أفعال المدير الثلاثة
  // تحتاج `approve_request` صراحةً (§10.2 · §28)، وأفعال صاحب الطلب تمرّ
  // على خريطة `method ← family` القائمة لأن الخطة لم تقرّر لها صلاحية
  // (Blocker موثّق في `PHASE_19_REPORT.md` §5). التحقق يسبق الوسيط حتى
  // يُقرأ الإجراء من جسم نظيف.
  router.post(
    '/:id/workflow',
    validateApiRequest({ body: { validator: requestTransitionBody } }),
    requireRequestWorkflowPermission(),
    runRequestWorkflow,
  );
  return router;
}