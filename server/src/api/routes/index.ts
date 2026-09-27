/**
 * راوتر الـAPI الموحّد (Phase 10؛ وُسّع في Phase 11 بالمصادقة).
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
 * Phase 11 — تغيير مقصود: `requireSession` يركَّب على **كل** راوتر
 * بيانات هنا، فأي طلب بلا جلسة صالحة يُرفض بـ401 قبل الوصول إلى
 * الـcontroller. مسارات المصادقة نفسها ليست هنا (في `../auth`)، حتى
 * يبقى هناك طريق للدخول.
 *
 * ما لا يزال لاحقاً: RBAC (Phase 12) وAccess Scope (Phase 13) — فتحديد
 * «من يحق له هذا المورد تحديداً» غير منفَّذ، والمصادقة تثبت الهوية فقط.
 */
import { Router } from 'express';
import { requireChangedSecret, requireSession } from '../../auth/sessionMiddleware';
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

  // نقطة واحدة تفرض الهوية على كل ما تحتها (Phase 11).
  router.use(requireSession());
  // ثم تُقيَّد **الموارد** على تبديل الرمز المؤقت (§11.7). الترتيب مهم:
  // `requireChangedSecret` يقرأ `req.auth` الذي يضعه `requireSession`.
  // وهذا الفرض هنا لا في طبقة المصادقة، كي يبقى
  // `POST /api/auth/secret` مفتوحاً لمستخدم له جلسة صالحة
  // يغيّر بها الرمز الذي طُلب منه تغييره.
  router.use(requireChangedSecret());

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
