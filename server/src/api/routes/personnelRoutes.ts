/**
 * راوتر شؤون المنتسبين والخط الزمني (Phase 10 — بند 5 وبند 6).
 *
 * أربعة موارد بنفس العقد، وكلٌّ منها على مسار مستقل صراحةً:
 * /api/leaves, /api/time-permissions, /api/assignments, /api/courses.
 *
 * ملاحظة: لا مسار `delete` لأيٍّ منها في هذه المرحلة.
 */
import { Router } from 'express';
import {
  assignmentController,
  cancelLeave,
  courseController,
  getTimeline,
  leaveBalanceController,
  leaveController,
  timePermissionController,
} from '../controllers';
import { validateApiRequest } from '../validation/validateApiRequest';
import {
  createAssignmentBody,
  createCourseBody,
  createLeaveBody,
  createTimePermissionBody,
  leaveAdjustmentBody,
  leaveBalanceListQuery,
  leaveLedgerListQuery,
  openingBalanceBody,
  personnelListQuery,
  updateAssignmentBody,
  updateCourseBody,
  updateLeaveBody,
  updateTimePermissionBody,
  timelineQuery,
} from '../validation';

/** راوتر سجلات الإجازات — مع مسار الإلغاء ذي الأثر الرصيدي (§15). */
export function createLeavesRouter(): Router {
  const router = Router();
  router.get(
    '/',
    validateApiRequest({ query: { validator: personnelListQuery } }),
    leaveController.list,
  );
  router.get('/:id', leaveController.getById);
  router.post(
    '/',
    validateApiRequest({ body: { validator: createLeaveBody } }),
    leaveController.create,
  );
  router.patch(
    '/:id',
    validateApiRequest({ body: { validator: updateLeaveBody } }),
    leaveController.update,
  );
  // الإلغاء: حالة السجل تصبح `cancelled` + حركة عكسية مرتبطة (§15).
  // لا حذف ولا محو للتاريخ.
  router.post('/:id/cancel', cancelLeave);
  return router;
}

/**
 * راوتر سجلات الزمنيات.
 *
 * `POST /:id/cancel` هو مسار **الإلغاء** (§15): يغيّر حالة السجل إلى
 * `cancelled` وينشئ حركة عكسية مرتبطة — لا يحذف (§15/§32). منفصل عن
 * `PATCH /:id` لأن الإلغاء له أثر رصيدي لا مجرّد تعديل حقل.
 */
export function createTimePermissionsRouter(): Router {
  const router = Router();
  router.get(
    '/',
    validateApiRequest({ query: { validator: personnelListQuery } }),
    timePermissionController.list,
  );
  router.get('/:id', timePermissionController.getById);
  router.post(
    '/',
    validateApiRequest({ body: { validator: createTimePermissionBody } }),
    timePermissionController.create,
  );
  router.patch(
    '/:id',
    validateApiRequest({ body: { validator: updateTimePermissionBody } }),
    timePermissionController.update,
  );
  return router;
}

/**
 * راوتر الأرصدة وسجل الحركات (Phase 18).
 *
 * `/api/leave-balances` (قراءة الأرصدة) · `/api/leave-ledger` (قراءة
 * الحركات) · الكتابة عبر `POST /api/leave-balances/opening` و
 * `POST /api/leave-balances/adjustment` فقط.
 *
 * **لا مسار لتعديل رقم رصيد مباشرة**: §15 يشترط حركة لكل تغيير، فكل
 * عملية كتابة تمرّ بالمحرّك الذي ينشئ الحركة والرصيد في معاملة واحدة.
 *
 * الصلاحيات: `GET` ← `view` و`POST` ← `create` من خريطة §28 القائمة في
 * `requireResourcePermission` — **بلا صلاحية أو دور جديد**.
 */
export function createLeaveBalancesRouter(): Router {
  const router = Router();
  router.get(
    '/',
    validateApiRequest({ query: { validator: leaveBalanceListQuery } }),
    leaveBalanceController.listBalances,
  );
  router.post(
    '/opening',
    validateApiRequest({ body: { validator: openingBalanceBody } }),
    leaveBalanceController.opening,
  );
  router.post(
    '/adjustment',
    validateApiRequest({ body: { validator: leaveAdjustmentBody } }),
    leaveBalanceController.adjust,
  );
  return router;
}

/** راوتر سجل حركات الرصيد (قراءة فقط — الكتابة ضمن مسار الأرصدة). */
export function createLeaveLedgerRouter(): Router {
  const router = Router();
  router.get(
    '/',
    validateApiRequest({ query: { validator: leaveLedgerListQuery } }),
    leaveBalanceController.listLedger,
  );
  return router;
}

/** راوتر سجلات التكليفات. */
export function createAssignmentsRouter(): Router {
  const router = Router();
  router.get(
    '/',
    validateApiRequest({ query: { validator: personnelListQuery } }),
    assignmentController.list,
  );
  router.get('/:id', assignmentController.getById);
  router.post(
    '/',
    validateApiRequest({ body: { validator: createAssignmentBody } }),
    assignmentController.create,
  );
  router.patch(
    '/:id',
    validateApiRequest({ body: { validator: updateAssignmentBody } }),
    assignmentController.update,
  );
  return router;
}

/** راوتر سجلات الدورات. */
export function createCoursesRouter(): Router {
  const router = Router();
  router.get(
    '/',
    validateApiRequest({ query: { validator: personnelListQuery } }),
    courseController.list,
  );
  router.get('/:id', courseController.getById);
  router.post(
    '/',
    validateApiRequest({ body: { validator: createCourseBody } }),
    courseController.create,
  );
  router.patch(
    '/:id',
    validateApiRequest({ body: { validator: updateCourseBody } }),
    courseController.update,
  );
  return router;
}

// ══════════════════════════════════════════════════════════════════
// الخط الزمني — بند 6: قراءة فقط
// ══════════════════════════════════════════════════════════════════

/**
 * راوتر الخط الزمني.
 * لا POST/PATCH/DELETE: الناتج مشتق ولا يُخزَّن (الخطة §22 و§7.17).
 */
export function createTimelineRouter(): Router {
  const router = Router();
  router.get('/', validateApiRequest({ query: { validator: timelineQuery } }), getTimeline);
  return router;
}
