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
  courseController,
  getTimeline,
  leaveController,
  timePermissionController,
} from '../controllers';
import { validateApiRequest } from '../validation/validateApiRequest';
import {
  createAssignmentBody,
  createCourseBody,
  createLeaveBody,
  createTimePermissionBody,
  personnelListQuery,
  updateAssignmentBody,
  updateCourseBody,
  updateLeaveBody,
  updateTimePermissionBody,
  timelineQuery,
} from '../validation';

/** راوتر سجلات الإجازات. */
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
  return router;
}

/** راوتر سجلات الزمنيات. */
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
