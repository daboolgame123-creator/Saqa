/**
 * نظام الصلاحيات المبني على الأدوار (RBAC - Role-Based Access Control)
 * يحدد هذا الملف الصلاحيات الدقيقة في النظام والربط بين الأدوار والصلاحيات.
 */

export type Permission =
  // صلاحيات المعاملات والكتب
  | 'transactions.view'
  | 'transactions.view.all'
  | 'transactions.create'
  | 'transactions.edit'
  | 'transactions.delete'
  | 'transactions.directive'      // إصدار الهوامش والتوجيهات
  | 'transactions.export'
  
  // صلاحيات شؤون المنتسبين والباحثين
  | 'employees.view'
  | 'employees.view.personal'     // عرض الملف الشخصي فقط
  | 'employees.edit'
  | 'employees.manage'            // إضافة وحذف ونقل وتكليف
  
  // صلاحيات الأرشيف والبحث
  | 'archive.search'
  | 'archive.manage'
  
  // صلاحيات التقارير والمواقف
  | 'reports.view'
  | 'reports.create'
  | 'daily_situation.view'
  | 'daily_situation.manage'
  
  // صلاحيات الحضور والانصراف (للمراحل القادمة)
  | 'attendance.view'
  | 'attendance.manage'
  
  // صلاحيات إدارة النظام والمستخدمين (للمراحل القادمة)
  | 'users.view'
  | 'users.manage'
  | 'settings.manage';

export type RoleId = 'employee' | 'archivist' | 'director' | 'admin';

export interface Role {
  id: RoleId;
  name: string;
  description: string;
  permissions: Permission[];
}

/**
 * مصفوفة الصلاحيات الافتراضية لكل دور في النظام (Role -> Permissions Mapping)
 * هذا التصميم يتيح إضافة أدوار جديدة مستقبلاً (مثل: نائب المدير، مدقق، مسؤول الحضور)
 * دون الحاجة لتعديل شروط الكود البرمجي في كل مكان.
 */
export const ROLE_PERMISSIONS: Record<RoleId, Permission[]> = {
  admin: [
    'transactions.view',
    'transactions.view.all',
    'transactions.create',
    'transactions.edit',
    'transactions.delete',
    'transactions.directive',
    'transactions.export',
    'employees.view',
    'employees.edit',
    'employees.manage',
    'archive.search',
    'archive.manage',
    'reports.view',
    'reports.create',
    'daily_situation.view',
    'daily_situation.manage',
    'attendance.view',
    'attendance.manage',
    'users.view',
    'users.manage',
    'settings.manage',
  ],

  director: [
    'transactions.view',
    'transactions.view.all',
    'transactions.create',
    'transactions.edit',
    'transactions.directive',
    'transactions.export',
    'employees.view',
    'archive.search',
    'reports.view',
    'daily_situation.view',
    'attendance.view',
  ],

  archivist: [
    'transactions.view',
    'transactions.view.all',
    'transactions.create',
    'transactions.edit',
    'transactions.delete',
    'transactions.export',
    'employees.view',
    'employees.edit',
    'employees.manage',
    'archive.search',
    'archive.manage',
    'reports.view',
    'reports.create',
    'daily_situation.view',
    'daily_situation.manage',
    'attendance.view',
  ],

  employee: [
    'transactions.view',
    'employees.view.personal',
    'archive.search',
    'daily_situation.view',
    'attendance.view',
  ],
};

/**
 * فحص امتلاك الدور لصلاحية محددة
 */
export function roleHasPermission(roleId: RoleId | string | null | undefined, permission: Permission): boolean {
  if (!roleId) return false;
  const permissions = ROLE_PERMISSIONS[roleId as RoleId];
  return permissions ? permissions.includes(permission) : false;
}

/**
 * فحص امتلاك الدور لأي من الصلاحيات الممررة
 */
export function roleHasAnyPermission(roleId: RoleId | string | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((p) => roleHasPermission(roleId, p));
}

/**
 * فحص امتلاك الدور لجميع الصلاحيات الممررة
 */
export function roleHasAllPermissions(roleId: RoleId | string | null | undefined, permissions: Permission[]): boolean {
  return permissions.every((p) => roleHasPermission(roleId, p));
}
