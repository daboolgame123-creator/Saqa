/**
 * مسارات الـAPI (Phase 10).
 *
 * كل مسار يتكوّن من ثلاث طبقات بالترتيب الإجباري:
 *   1) `validateApiRequest` — يتحقق ويُضع القيمة النظيفة على الطلب.
 *   2) الـcontroller — يقرأ `validatedBody/validatedQuery` وينادي الخدمة.
 *   3) معالج الأخطاء المركزي (في app.ts) يترجم الأخطاء إلى استجابة.
 *
 * لا صلاحيات داخل هذا الملف: الهوية (`requireSession`) وفرض الصلاحيات
 * (`requireResourcePermission` — Phase 12) يركّبان كوسيط في
 * `routes/index.ts` قبل هذه المسارات، وAccess Scope (Phase 13) سيأتي
 * بعدها، فتبقى هذه الطبقة نقلاً محايداً. هذا مقصود:Security لا يعتمد على إخفاء شيء في الواجهة،
 * وكل غياب فرض موثّق في مكانه لا مُخفى.
 *
 * لا مسار DELETE للموظفين أو الكتب: الخطة §32 تمنع حذف الموظف، والكتاب
 * لا يُحذف إدارياً (Soft Delete في Phase 16). الروابط وحدها لها DELETE
 * لإزالة سطر العلاقة لا طرفيه.
 */
import { Router } from 'express';
import {
  acknowledgeTransaction,
  changeEmployeeStatus,
  createDailySituation,
  createEmployee,
  createLink,
  createTransaction,
  getDailySituation,
  getEmployee,
  getEmployeeStatusHistory,
  getTimeline,
  getTransaction,
  grantAvailability,
  grantAvailabilityToLinked,
  inspectAvailability,
  listAttachments,
  listDailySituations,
  listEmployees,
  listLinks,
  listTransactions,
  assignmentController,
  archiveTransaction,
  courseController,
  downloadAttachmentContent,
  leaveController,
  listArchivedTransactions,
  removeLink,
  restoreTransaction,
  revokeAvailability,
  timePermissionController,
  updateDailySituation,
  updateEmployee,
  updateLink,
  updateTransaction,
  uploadAttachment,
  verifyAttachmentIntegrity,
} from '../controllers';
import { requirePermission } from '../../authorization';
import { rawAttachmentBody } from '../validation/attachmentUpload';
import { validateApiRequest } from '../validation/validateApiRequest';
import {
  archiveTransactionQuery,
  changeEmployeeStatusBody,
  createDailySituationBody,
  createEmployeeBody,
  createLeaveBody,
  createTimePermissionBody,
  createAssignmentBody,
  createCourseBody,
  createTransactionBody,
  createTransactionEmployeeBody,
  dailySituationListQuery,
  employeeListQuery,
  grantAvailabilityBody,
  linkListQuery,
  personnelListQuery,
  restoreTransactionQuery,
  timelineQuery,
  transactionListQuery,
  updateEmployeeBody,
  updateTransactionBody,
  updateTransactionEmployeeBody,
  updateDailySituationBody,
  updateLeaveBody,
  updateTimePermissionBody,
  updateAssignmentBody,
  updateCourseBody,
} from '../validation';

/** راوتر الموظفين — بند 1. */
export function createEmployeesRouter(): Router {
  const router = Router();
  router.get('/', validateApiRequest({ query: { validator: employeeListQuery } }), listEmployees);
  router.get('/:id', getEmployee);
  router.get('/:id/status-history', getEmployeeStatusHistory);
  router.post('/', validateApiRequest({ body: { validator: createEmployeeBody } }), createEmployee);
  router.patch(
    '/:id',
    validateApiRequest({ body: { validator: updateEmployeeBody } }),
    updateEmployee,
  );
  router.post(
    '/:id/status',
    validateApiRequest({ body: { validator: changeEmployeeStatusBody } }),
    changeEmployeeStatus,
  );
  return router;
}

/** راوتر الكتب — بند 2 (وإتاحة الكتب §9.3/§9.4 Phase 13، وأرشفة Phase 16). */
export function createTransactionsRouter(): Router {
  const router = Router();
  // **قبل** `GET /:id`: كلمة `archived` ليست معرّفاً، فلا يجوز أن يبتلعها
  // مسار المعرّف العام.
  router.get(
    '/archived',
    requirePermission('delete_archive'),
    validateApiRequest({ query: { validator: transactionListQuery } }),
    listArchivedTransactions,
  );
  router.get(
    '/',
    validateApiRequest({ query: { validator: transactionListQuery } }),
    listTransactions,
  );
  router.get('/:id', getTransaction);
  // الاطلاع الرسمي (Phase 15 — §9.1/§9.2): ضغطة «اطلعت» صريحة وحدها
  // تنشئ/تُختم سجل الاطلاع، idempotent للفاعل نفسه. عائلة المسار
  // `view` لا `create` — استثناء موثّق في `requiredPermissionForMethod`
  // لأن المنتسب (view فقط §10.3) هو المستخدم الأساسي للزر.
  router.post('/:id/acknowledge', acknowledgeTransaction);
  router.post(
    '/',
    validateApiRequest({ body: { validator: createTransactionBody } }),
    createTransaction,
  );
  router.patch(
    '/:id',
    validateApiRequest({ body: { validator: updateTransactionBody } }),
    updateTransaction,
  );

  // Phase 16 — Soft Delete (§32): أرشفة ناعمة واستعادة، لا حذف فعلي.
  //
  // `DELETE /:id` مُسنَد إلى عائلة `delete_archive` بخريطة الـmethod نفسها
  // (Phase 12)، والحارس الصريح يثبّته ويوثّقه: **مسؤول السقاية فقط** —
  // المشرف (`view` فقط §10.2) والمنتسب (`view` §10.3) يُرفضان 403 من
  // الخادم، لا من الواجهة.
  //
  // `POST /:id/restore` خريطة الـmethod تجعله `create`، وهو مناسب هنا
  // (إنشاء حالة نشطة)؛ حارس `delete_archive` يضيف القيد الإداري نفسه
  // فلا يمرّ الاستعادة إلا بمسؤول السقاية أيضاً.
  const archiveGuard = requirePermission('delete_archive');
  router.delete(
    '/:id',
    archiveGuard,
    validateApiRequest({ query: { validator: archiveTransactionQuery } }),
    archiveTransaction,
  );
  // الاستعادة تحمل شرط النسخة في الاستعلام كذلك (Phase 17): `POST` بلا
  // جسم في هذا المشروع، فلا يبقى مسار كتابة بلا قفل.
  router.post(
    '/:id/restore',
    archiveGuard,
    validateApiRequest({ query: { validator: restoreTransactionQuery } }),
    restoreTransaction,
  );

  // إتاحة الكتب (§9.3 و§9.4 و§29).
  // فرض الصلاحية: `manage_availability` إدارية بحتة (§9.5 و§10.1 و§10.2).
  // المدير يملك `view` فقط فيرفضه الوسيط بـ403 (المنع على الخادم لا في الواجهة).
  // GET inspection يتطلب `manage_availability` أيضاً، لأن كشف سجل الإتاحة
  // (الساري والمسحوب) كشف إداري خاص لا قراءة كتاب عادية.
  const availabilityGuard = requirePermission('manage_availability');

  router.get('/:id/availability', availabilityGuard, inspectAvailability);
  router.post(
    '/:id/availability',
    availabilityGuard,
    validateApiRequest({ body: { validator: grantAvailabilityBody } }),
    grantAvailability,
  );
  router.post('/:id/availability/bulk', availabilityGuard, grantAvailabilityToLinked);
  router.delete('/:id/availability/:employeeId', availabilityGuard, revokeAvailability);

  // المرفقات والتخزين المركزي (Phase 14 — §30).
  //
  // **الترتيب مقصود** ويقفل الفجوة التي تنشأ لو عُكس:
  //   1. `rawAttachmentBody` أولاً — يجب أن يقرأ البايتات **قبل** أي
  //      معالجات المسار، وإلا لكان `express.json()` قد التهم الجسم.
  //   2. الصلاحية (من `requireResourcePermission` في `routes/index.ts`):
  //      GET←`view` · POST←`create`.
  //   3. النطاق (من `attachAccessScope`): تمريره في الخدمة يجعل **الكتاب
  //      نفسه** هو نقطة الفحص، فلا يُقرأ ملف كتاب خارج النطاق.
  //
  // `attachments` في مسار `/transactions` لا مورد مستقل: رؤية المرفق رؤية
  // كتابه، وكتاب غير مرئي ⇒ مرفقاته غير مرئية بلا استثناء.
  router.get('/:id/attachments', listAttachments);
  router.post('/:id/attachments', rawAttachmentBody, uploadAttachment);
  router.get('/:id/attachments/:attachmentId/content', downloadAttachmentContent);
  router.get('/:id/attachments/:attachmentId/integrity', verifyAttachmentIntegrity);

  return router;
}

/** راوتر روابط الكتاب بالمنتسب — بند 3. */
export function createTransactionEmployeesRouter(): Router {
  const router = Router();
  router.get('/', validateApiRequest({ query: { validator: linkListQuery } }), listLinks);
  router.post(
    '/',
    validateApiRequest({ body: { validator: createTransactionEmployeeBody } }),
    createLink,
  );
  router.patch(
    '/:id',
    validateApiRequest({ body: { validator: updateTransactionEmployeeBody } }),
    updateLink,
  );
  // إزالة سطر العلاقة فقط: لا الكتاب ولا الموظف.
  router.delete('/:id', removeLink);
  return router;
}

/** راوتر الموقف اليومي — بند 4. */
export function createDailySituationsRouter(): Router {
  const router = Router();
  router.get(
    '/',
    validateApiRequest({ query: { validator: dailySituationListQuery } }),
    listDailySituations,
  );
  router.get('/:id', getDailySituation);
  router.post(
    '/',
    validateApiRequest({ body: { validator: createDailySituationBody } }),
    createDailySituation,
  );
  router.patch(
    '/:id',
    validateApiRequest({ body: { validator: updateDailySituationBody } }),
    updateDailySituation,
  );
  return router;
}
