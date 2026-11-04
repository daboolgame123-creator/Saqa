/**
 * أخطاء التفويض (Phase 12).
 *
 * الفصل بين 401 و403 هو قاعدة المرحلة:
 * - لا هوية/جلسة صالحة ⇒ `AuthenticationRequiredError` (401) من طبقة
 *   المصادقة `requireSession` — لا تتغير.
 * - هوية صالحة بلا صلاحية كافية ⇒ `PermissionDeniedError` (403) من هنا.
 * الرمز بالإنجليزية الثابت ليقرأه العميل برمجياً، والرسالة قابلة للعرض.
 */
import { AppError } from '../errors';
import type { Permission, Role } from './permissions';

/**
 * رفض تنفيذ عملية لعدم امتلاك الدور الصلاحية المطلوبة (403).
 *
 * التفاصيل تذكر الصلاحية المطلوبة فقط (لا دور الفاعل ولا معلومات عن
 * المورد) — مساعدة للعميل الشرعي دون إفشاء أعمق.
 */
export class PermissionDeniedError extends AppError {
  constructor(permission: Permission) {
    super(
      'ليس لديك صلاحية لتنفيذ هذه العملية.',
      403,
      'PERMISSION_DENIED',
      true,
      { requiredPermission: permission },
    );
  }
}

/**
 * رفض دور غير مسموح به لمسار إداري بعينه (403).
 *
 * منفصل عن `PermissionDeniedError` لأن المنع هنا **سياسة دور** لا نقص
 * عائلة صلاحية: دور `employee` يملك `view` العامة، لكنه ممنوع من
 * المواقف اليومية بنص السياسة المعتمدة (N1). التفاصيل تذكر الأدوار
 * المسموح بها فقط، لا هوية الفاعل ولا وجود المورد.
 */
export class RoleDeniedError extends AppError {
  constructor(roles: readonly Role[]) {
    super(
      'ليس لديك صلاحية لتنفيذ هذه العملية.',
      403,
      'PERMISSION_DENIED',
      true,
      { requiredRoles: [...roles] },
    );
  }
}
