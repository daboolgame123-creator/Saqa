/**
 * نطاق رؤية **الطلبات** (Phase 19 · §12 · §10.2/§10.3).
 *
 * الفصل نفسه مع Phase 13، لكن مطبَّقاً على الطلبات لا الكتب:
 * `Identity → Permission → Access Scope → Resource` — فوجود صلاحية `view`
 * لا يعني رؤية **كل** الطلبات.
 *
 * - **admin** (§10.1) يدير السجل ⇒ كل الطلبات.
 * - **director** (§10.2) «يرى … الطلبات في نطاق سير الموافقة المعتمد»
 *   ⇒ كل الطلبات التي تخصّ سير الموافقة، وهي كل الطلبات.
 * - **employee** (§10.3) «الطلبات الخاصة به» ⇒ طلباته وحدها.
 * - حساب بلا منتسب مرتبط، أو دور خارج §28 ⇒ `empty` (fail-closed، لا
 *   رؤية ولا استنتاج وجود بطلب الغير).
 *
 * **حدّ مقصود (Business Rule Blocker):** الخطة لم تقرر هل يحقّ
 * للمنتسب إرسال الطلب بنفسه ولا إنشاء الطلبات — §10.3 يمنحه `view` فقط
 * و§35 يذكر «employee reply» كعملية. لذلك الفرض على القراءة هنا، وأفعال
 * الكتابة تبقى على خريطة §28 القائمة بلا صلاحية جديدة. موثّق في
 * `PHASE_19_REPORT.md` §5.
 */
import type { Request, RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../auth/sessionMiddleware';
import type { RequestScopeFilter } from '../repositories/contracts';

/** القيد المخزَّن على الطلب (نفس نمط `accessScope`). */
const REQUEST_SCOPE_LOCALS_KEY = 'requestScope';

/** نفس عارض النطاق في Phase 13: `{role, employeeId}` من هوية الجلسة. */
function viewerOf(req: Request): { role: string; employeeId: string | null } | undefined {
  const identity = (req as AuthenticatedRequest).auth;
  if (identity === undefined) {
    return undefined;
  }
  return { role: identity.role, employeeId: identity.employeeId };
}

/** يحسب قيد نطاق الطلبات لهذا الفاعل (§10.2/§10.3). */
export function requestScopeFilterFor(
  viewer: { role: string; employeeId: string | null },
): RequestScopeFilter {
  switch (viewer.role) {
    case 'admin':
    case 'director':
      return { kind: 'all' };
    case 'employee':
      // بلا منتسب مرتبط ⇒ لا طلبات: صفر رؤية بلا استثناء.
      return viewer.employeeId === null
        ? { kind: 'empty' }
        : { kind: 'owner', ownerEmployeeId: viewer.employeeId };
    default:
      return { kind: 'empty' };
  }
}

/**
 * يثبّت قيد نطاق الطلبات على الطلب مرة واحدة (نفس `attachAccessScope`).
 * لا يرفض طلباً: هو تصفية، والـ404 يأتي من المستودع/الخدمة.
 */
export function attachRequestScope(): RequestHandler {
  return (req, res, next): void => {
    const viewer = viewerOf(req);
    res.locals[REQUEST_SCOPE_LOCALS_KEY] =
      viewer === undefined ? { kind: 'empty' } : requestScopeFilterFor(viewer);
    next();
  };
}

/** القيد المحسوب لهذا الطلب — تقرؤه controllers الطلبات فقط. */
export function requestScopeOf(req: Request): RequestScopeFilter {
  const stored = req.res?.locals?.[REQUEST_SCOPE_LOCALS_KEY] as
    | RequestScopeFilter
    | undefined;
  if (stored !== undefined) {
    return stored;
  }
  const viewer = viewerOf(req);
  return viewer === undefined ? { kind: 'empty' } : requestScopeFilterFor(viewer);
}