/**
 * الصلاحيات والأدوار (Phase 12 — RBAC) — مصدر الحقيقة على الخادم.
 *
 * المراجع:
 * - `ALSQAYA_PLAN.md` §28: الأدوار الثلاثة وعائلات الصلاحيات (Permission families).
 * - `ALSQAYA_PLAN.md` §10: توزيع القدرات الفعلي لكل دور (§10.1 المسؤول،
 *   §10.2 المدير، §10.3 المنتسب).
 *
 * قواعد هذا الملف:
 * - **لا يُصدَّر من الواجهة**: `src/core/models/permission.ts` نموذج أولي
 *   في العميل ولا يُعتمد عليه في الفرض الأمني إطلاقاً (§28: «لا يعتمد
 *   الأمن على إخفاء زر في React»). المصفوفة هنا مكتوبة من الخطة حرفياً.
 * - **لا تكرار لشروط الدور في الـcontrollers**: كل فحص يمرّ عبر
 *   `requirePermission` في هذه الطبقة، فتبقى سياسة واحدة قابلة للاختبار.
 * - **Fail-closed**: أي دور غير مدرَج في مصفوفة الخطة لا يملك صلاحية
 *   شيئاً (لا تخمين ولا افتراض ارث من نموذج أولي).
 *
 * عائلات غير مفروضة بعد لأن مساراتها لم تُبنَ بعد (لا سلوك لها اليوم):
 * `manage_availability` (Phase 13)، `approve_request` (سير موافقة
 * الطلبات)، `view_audit_logs` (Phase 15)، `backup_restore` (Phase 24).
 * إدراجها في التمثيل ليس سلوكاً — ولا يُنشأ لها Workflow قبل مراحلها.
 */

/**
 * عائلات الصلاحيات — أسماء الخطة §28 بالترتيب، بترميز ثابت يقرأه الكود.
 * `delete_archive` تمثيل لعائلة «delete/archive».
 */
export type Permission =
  | 'view'
  | 'create'
  | 'update'
  | 'delete_archive'
  | 'manage_availability'
  | 'manage_accounts'
  | 'manage_security'
  | 'approve_request'
  | 'view_audit_logs'
  | 'backup_restore';

/** كل العائلات المعرَّفة في §28 — تُستخدم في اختبارات اكتمال المصفوفة. */
export const PERMISSION_VALUES: readonly Permission[] = [
  'view',
  'create',
  'update',
  'delete_archive',
  'manage_availability',
  'manage_accounts',
  'manage_security',
  'approve_request',
  'view_audit_logs',
  'backup_restore',
];

/**
 * أدوار الخطة §28: admin/responsible Saqa · director · employee.
 *
 * ملاحظة البيانات: قيد CHECK في `users` (Phase 9) يسمح أيضاً بقيمة
 * موروثة `archivist` من النموذج الأولي. القيمة **لا تُحذف** (لا migration
 * هنا)، لكنها خارج مصفوفة الخطة فلا تمنح صلاحية شيئاً — ومعالجة مصيرها
 * قرار وظيفي يبقى موثّقاً في تقرير المرحلة.
 */
export type Role = 'admin' | 'director' | 'employee';

/** أدوار الخطة كما تُقارن مع قيمة `users.role`. */
export const ROLE_VALUES: readonly Role[] = ['admin', 'director', 'employee'];

/**
 * مصفوفة الرخص: الدور ← عائلات الصلاحيات المسموحة له.
 *
 * كل إسناد هنا منقول من §10 ولا شيء غيره:
 * - **admin** (§10.1): إدارة المنتسبين والكتب والمرفقات والإتاحة والحالات
 *   والحسابات (تجميد/حظر/إعادة ضبط)، رؤية سجلات الدخول، البيانات الوظيفية،
 *   النسخ الاحتياطي، إعدادات النظام، متابعة Audit Log — أي كل العائلات
 *   ما عدا `approve_request` التي لم يمنحها النص للمسؤول.
 * - **director** (§10.2): «دوره إشرافي واطلاعي» — رؤية ما يلزم للإشراف،
 *   و Workflow موافقة الطلب («اعتماد/رفض الطلب إجراء خاص إذا اتُّصف نوعه
 *   بالمدير»). الصراحة في «لا يستطيع»: إنشاء/تعديل/حذف كتاب، إدارة الحسابات،
 *   الحظر والتجميد، سجلات الدخول الأمنية، إدارة الإتاحة.
 * - **employee** (§10.3): رؤية بياناته وسجلاته المسموح بها فقط.
 *   تصفية **ما يراه فعلاً** من سجلات هي Access Scope — Phase 13.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: [
    'view',
    'create',
    'update',
    'delete_archive',
    'manage_availability',
    'manage_accounts',
    'manage_security',
    'view_audit_logs',
    'backup_restore',
  ],
  director: ['view', 'approve_request'],
  employee: ['view'],
};

/** هل القيمة واحدة من أدوار الخطة الثلاثة؟ */
export function isPlanRole(value: string | null | undefined): value is Role {
  return value !== null && value !== undefined && (ROLE_VALUES as readonly string[]).includes(value);
}

/**
 * هل يملك الدور هذه الصلاحية؟
 *
 * Fail-closed: دور مفقود/موروث خارج المصفوفة (`archivist`، قيمة محرَّفة،
 * فارغ، null) ⇒ `false` مهما كانت قيمته في القاعدة.
 */
export function roleHasPermission(
  role: string | null | undefined,
  permission: Permission,
): boolean {
  if (!isPlanRole(role)) {
    return false;
  }
  return ROLE_PERMISSIONS[role].includes(permission);
}
