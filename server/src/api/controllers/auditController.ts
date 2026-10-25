/**
 * controller سجل التدقيق وسجل الاطلاع (Phase 15 — §31 و§9.2).
 *
 * HTTP فقط، وبترتيب مقصود:
 * - `listAuditLogs` يصل بعد `requireSession` ← خريطة method (`view`)
 *   ← `requirePermission('view_audit_logs')` على المسار. لا مسار كتابة
 *   إطلاقاً: لا تعديل ولا حذف ولا إنشاء حدث من العميل (§31 Audit
 *   Integrity) — والفاعل في أي حدث يُكتب يأتي من العمليات وحدها.
 * - `acknowledgeTransaction` يبني الفاعل من هوية الجلسة فقط؛ جسم الطلب
 *   متجاهَل إن حمل `employeeId` أو `userId` — التزوير لا يغيّر الفاعل.
 */
import type { RequestHandler } from 'express';
import { servicesOf } from '../serviceContext';
import { transactionScopeOf } from '../../authorization';
import type { AuthenticatedRequest } from '../../auth/sessionMiddleware';
import { asyncHandler, ok, pathId } from './shared';

/** GET /api/audit-logs — آخر الأحداث (محميّ بـ`view_audit_logs`). */
export const listAuditLogs: RequestHandler = asyncHandler(async (req, res) => {
  ok(res, await servicesOf(req).audit.list());
});

/**
 * POST /api/transactions/:id/acknowledge — ختم «اطلعت» صريح.
 *
 * لا جسم مُعتمد: كل ما يُرسل يُتجاهل. الفاعل `userId/employeeId/
 * sessionId` من الجلسة المصادق عليها، والكتاب يجب أن يكون مرئياً
 * لنطاق الفاعل (وإلا 404 حجب الوجود كما في القراءة العادية §12).
 */
export const acknowledgeTransaction: RequestHandler = asyncHandler(async (req, res) => {
  const identity = (req as AuthenticatedRequest).auth;
  if (identity === undefined) {
    // احتياطي ترتيبي: المسار خلف requireSession دائماً.
    throw new Error('مسار الاطلاع بلا هوية جلسة — ترتيب الوسيطات مكسور.');
  }
  const scope = transactionScopeOf(req) ?? undefined;
  ok(
    res,
    await servicesOf(req).viewLogs.acknowledge(
      pathId(req),
      {
        userId: identity.userId,
        employeeId: identity.employeeId,
        sessionId: identity.sessionId,
      },
      scope,
    ),
  );
});
