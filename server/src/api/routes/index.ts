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
 * Phase 12 — تغيير مقصود: `requireResourcePermission` يركَّب بعدها نقطة
 * واحدة تفرض عائلة الصلاحية المقابلة لmethod (§28) على كل موارد `/api/*`،
 * فالرفض 403 PERMISSION_DENIED لدور لا يملك العائلة — المنع على الخادم
 * لا في الواجهة.
 *
 * Phase 13 — نطاق الرؤية: `attachAccessScope()` يركَّب بعد وسيط الصلاحية،
 * فيحسب قيد النطاق (`TransactionScopeFilter`) من هوية الجلسة ويُسجّله
 * على الطلب (`res.locals.accessScope`) لتقرأه مسارات الكتب والروابط
 * والخط الزمني. ترتيب الحُصَر:
 *   requireSession (401)
 *   ← requireChangedSecret (403 للرمز المؤقت)
 *   ← requireResourcePermission (403 لنقص الصلاحية)
 *   ← attachAccessScope (حساب نطاق الرؤية قبل الموارد).
 *
 * Phase 15 — سجل التدقيق: `/api/audit-logs` يُركَّب بعدها كلها ويحمل
 * حارسه الخاص `view_audit_logs` — القراءة العامة `view` لا تكفي لفتح
 * سجل التدقيق (§28 عائلة مستقلة، ومتابعتها في §10.1 للمسؤول وحده)،
 * ولا وجود لمسار كتابة فيه إطلاقاً (§31 Audit Integrity).
 */
import { Router } from 'express';
import {
  attachAccessScope,
  attachRequestScope,
  requirePermission,
  requireResourcePermission,
} from '../../authorization';
import { requireChangedSecret, requireSession } from '../../auth/sessionMiddleware';
import { createAuditRouter } from './auditRoutes';
import {
  createNotificationsRouter,
  createRemindersRouter,
} from './notificationRoutes';
import {
  createAssignmentsRouter,
  createCoursesRouter,
  createDailySituationsRouter,
  createEmployeesRouter,
  createLeaveBalancesRouter,
  createLeaveLedgerRouter,
  createLeavesRouter,
  createRequestsRouter,
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
  // ثم فرض الصلاحيات (Phase 12) نقطة واحدة قبل كل راوترات الموارد:
  // method ← عائلة §28، والرفض 403 PERMISSION_DENIED لمن لا يملكها.
  router.use(requireResourcePermission());
  // ثم حساب نطاق الرؤية (Phase 13) لنفس الهوية المؤكدة، فيصبح متاحاً
  // لكل الـcontrollers تحتها بلا إعادة فحص ولا تكرار شرط.
  router.use(attachAccessScope());
  // Phase 19 — نطاق الطلبات (نوعه مختلف: «طلبات» لا «كتب») بنفس
  // المبدأ: `Identity → Permission → Access Scope → Resource`، والمنتسب
  // يرى «الطلبات الخاصة به» وحدها (§10.3).
  router.use(attachRequestScope());

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
  // Phase 18 — الأرصدة وسجل الحركات. قراءة الأرصدة والحركات، والكتابة
  // عبر الافتتاح والتصحيح فقط (§15). نفس خريطة الصلاحيات القائمة:
  // GET←view · POST←create — بلا دور أو صلاحية جديدة.
  router.use('/leave-balances', createLeaveBalancesRouter());
  router.use('/leave-ledger', createLeaveLedgerRouter());
  // Phase 19 — الطلبات وسير الموافقة (§18/§35). القراءة `view` ·
  // الإنشاء `create` · التعديل `update` من خريطة §28 القائمة، أما
  // `POST /requests/:id/workflow` فـ`approve_request` صراحةً داخل راوتره
  // (قرارٌ لا CRUD — §10.2). بلا `DELETE`: الإلغاء حالة (§32).
  router.use('/requests', createRequestsRouter());
  // 6) الخط الزمني (قراءة مشتقة)
  router.use('/timeline', createTimelineRouter());

  // Phase 21 — الإشعارات والتذكيرات (§20/§21). مساران مستقلان لأنهما
  // موردان مختلفان: الحدث الموجَّه للمستخدم، والموعد الذي يحتاج متابعة.
  // الصلاحيات من خريطة §28 القائمة (GET←view · POST←create · PATCH←update)
  // بلا Role ولا Permission جديدة؛ والاستثناء الوحيد `POST /:id/read`
  // بعائلة `view` في `requirePermission.ts` (كـ«اطلعت» في Phase 15).
  //
  // ولا مسار لإنشاء إشعار: الإنشاء من الحدث فقط
  // (`services/notificationEvents.ts`) — فمن قبل POST لأصنع إشعاراً لأي.
  router.use('/notifications', createNotificationsRouter());
  router.use('/reminders', createRemindersRouter());

  // 7) سجل التدقيق (Phase 15) — قراءة فقط، بحارس `view_audit_logs`
  //    صراحةً على المسار: لا يفتحه `view` العامة ولا وجود له لمسار كتابة.
  router.use('/audit-logs', requirePermission('view_audit_logs'), createAuditRouter());

  return router;
}
