/**
 * طبقة التفويض (RBAC) — Phase 12.
 *
 * الترحيل يستورد من هنا فقط، فلا يعرف بقية المشروع تفاصيل المصفوفة.
 * الترتيب المتوقع على المسارات (انظر `Architecture.md` §5.2):
 *   requireSession → requireChangedSecret → requirePermission* → controller
 */
export {
  PERMISSION_VALUES,
  ROLE_PERMISSIONS,
  ROLE_VALUES,
  isPlanRole,
  roleHasPermission,
  type Permission,
  type Role,
} from './permissions';
export { PermissionDeniedError } from './authorizationErrors';
export {
  requirePermission,
  requireResourcePermission,
  requiredPermissionForMethod,
} from './requirePermission';
