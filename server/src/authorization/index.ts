/**
 * طبقة التفويض (RBAC + نطاق الرؤية) — Phase 12 وPhase 13.
 *
 * الترحيل يستورد من هنا فقط، فلا يعرف بقية المشروع تفاصيل المصفوفة ولا
 * تفاصيل قاعدة النطاق. الترتيب المتوقع على المسارات (انظر `Architecture.md` §5.2/§5.3):
 *   requireSession → requireChangedSecret → requirePermission*
 *   → attachAccessScope → controller → service → repository (قيد النطاق في الاستعلام)
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
  requireRequestWorkflowPermission,
  requireResourcePermission,
  requiredPermissionForMethod,
} from './requirePermission';
export {
  attachRequestScope,
  requestScopeFilterFor,
  requestScopeOf,
} from './requestScope';
export {
  ACCESS_SCOPE_VALUES,
  AVAILABILITY_SCOPE,
  DEFAULT_ACCESS_SCOPE,
  EMPLOYEE_DIRECT_SCOPES,
  attachAccessScope,
  isAccessScope,
  transactionScopeFilterFor,
  transactionScopeOf,
  type AccessScope,
  type ScopeViewer,
} from './accessScope';

