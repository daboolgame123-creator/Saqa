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
import type { Permission } from './permissions';

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
