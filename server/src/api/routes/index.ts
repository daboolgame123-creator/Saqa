/**
 * راوتر الـAPI الموحّد (Phase 10).
 *
 * يجمع راوترات الموارد الستة بترتيب النقل المعتمد في الخطة §26:
 *   1. Employees            → /api/employees
 *   2. Transactions         → /api/transactions
 *   3. TransactionEmployee  → /api/transaction-employees
 *   4. Daily Situation      → /api/daily-situations
 *   5. Personnel records    → /api/leaves | time-permissions | assignments | courses
 *   6. Timeline reads       → /api/timeline
 *
 * هذا الراوتر يُركَّب على `/api` من `routes/index.ts` (Phase 8).
 *
 * حدّ مهم: لا توجد مسارات مصادقة هنا. المصادقة والجلسات (Phase 11)
 * وRBAC (Phase 12) وAccess Scope (Phase 13) لم تُنفَّذ بعد، فأي طلب
 * يصل الآن يُعالَج بلا هوية. هذا موثّق صراحةً في PHASE_10_REPORT.md
 * وليس افتراضاً — المسارات جاهزة تستقبل طبقة التفويض قبلها لاحقاً.
 */
import { Router } from 'express';
import {
  createAssignmentsRouter,
  createCoursesRouter,
  createDailySituationsRouter,
  createEmployeesRouter,
  createLeavesRouter,
  createTimePermissionsRouter,
  createTimelineRouter,
  createTransactionEmployeesRouter,
  createTransactionsRouter,
} from './resourceRoutes';

/** يبني راوتر الـAPI كاملاً (تُركَّب أسماؤه تحت `/api`). */
export function createApiRouter(): Router {
  const router = Router();

  // 1) الموظفون
  router.use('/employees', createEmployeesRouter());
  // 2) الكتب
  router.use('/transactions', createTransactionsRouter());
  // 3) روابط الكتاب بالمنتسب
  router.use('/transaction-employees', createTransactionEmployeesRouter());
  // 4) الموقف اليومي المستقل
  router.use('/daily-situations', createDailySituationsRouter());
  // 5) شؤون المنتسبين
  router.use('/leaves', createLeavesRouter());
  router.use('/time-permissions', createTimePermissionsRouter());
  router.use('/assignments', createAssignmentsRouter());
  router.use('/courses', createCoursesRouter());
  // 6) الخط الزمني (قراءة مشتقة)
  router.use('/timeline', createTimelineRouter());

  return router;
}
