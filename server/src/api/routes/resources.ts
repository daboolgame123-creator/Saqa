/**
 * مسارات الـAPI (Phase 10).
 *
 * كل مسار يتكوّن من ثلاث طبقات بالترتيب الإجباري:
 *   1) `validateApiRequest` — يتحقق ويُضع القيمة النظيفة على الطلب.
 *   2) الـcontroller — يقرأ `validatedBody/validatedQuery` وينادي الخدمة.
 *   3) معالج الأخطاء المركزي (في app.ts) يترجم الأخطاء إلى استجابة.
 *
 * لا صلاحيات هنا: التحقق من الهوية والصلاحية (Phase 11/12) وAccess Scope
 * (Phase 13) تأتي لاحقاً وتُركَّب كوسيط قبل الـcontroller، فتبقى هذه
 * الطبقة نقلاً محايداً. هذا مقصود:Security لا يعتمد على إخفاء شيء في الواجهة،
 * وغياب التفويض الآن موثّق لا مُخفى.
 *
 * لا مسار DELETE للموظفين أو الكتب: الخطة §32 تمنع حذف الموظف، والكتاب
 * لا يُحذف إدارياً (Soft Delete في Phase 16). الروابط وحدها لها DELETE
 * لإزالة سطر العلاقة لا طرفيه.
 */
import { Router } from 'express';
import {
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
  listDailySituations,
  listEmployees,
  listLinks,
  listTransactions,
  assignmentController,
  courseController,
  leaveController,
  removeLink,
  timePermissionController,
  updateDailySituation,
  updateEmployee,
  updateLink,
  updateTransaction,
} from '../controllers';
import { validateApiRequest } from '../validation/validateApiRequest';
import {
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
  linkListQuery,
  personnelListQuery,
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

/** راوتر الكتب — بند 2. */
export function createTransactionsRouter(): Router {
  const router = Router();
  router.get(
    '/',
    validateApiRequest({ query: { validator: transactionListQuery } }),
    listTransactions,
  );
  router.get('/:id', getTransaction);
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
