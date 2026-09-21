import { RoleId, Permission, roleHasPermission } from './permission';

/**
 * نموذج المستخدم (User Model)
 * يمثل الحساب النشط في النظام، سواء كان مديراً أو مسؤول أرشيف أو منتسباً عادياً أو مسؤول نظام.
 * مهيأ بالكامل للانتقال إلى خادم وقاعدة بيانات مركزية (Backend / Database).
 */
export interface User {
  id: string;
  username: string;
  displayName: string;
  role: RoleId;
  
  /**
   * ربط حساب المستخدم بسجل المنتسب (Employee.id)
   * هذا الحقل جوهري لدور 'employee'، حيث يتيح له رؤية معاملاته وإجازاته وسجلاته الخاصة فقط
   */
  employeeId?: string;
  
  email?: string;
  avatar?: string;
  department?: string;
  isActive: boolean;
  createdAt?: string;
  lastLoginAt?: string;

  /**
   * صلاحيات إضافية مخصصة تتجاوز صلاحيات الدور الافتراضية
   * يتيح تخصيص الصلاحيات الفردية مستقبلاً دون تكرار الأدوار
   */
  customPermissions?: Permission[];
}

/**
 * فحص امتلاك المستخدم لصلاحية معينة
 * يفحص أولاً الصلاحيات المخصصة (إن وجدت)، ثم يعود لصلاحيات الدور
 */
export function userHasPermission(user: User | null | undefined, permission: Permission): boolean {
  if (!user || !user.isActive) return false;

  // 1. فحص الصلاحيات المخصصة للمستخدم
  if (user.customPermissions && user.customPermissions.includes(permission)) {
    return true;
  }

  // 2. فحص صلاحيات الدور
  return roleHasPermission(user.role, permission);
}

/**
 * فحص امتلاك المستخدم لأي من الصلاحيات المحددة
 */
export function userHasAnyPermission(user: User | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((p) => userHasPermission(user, p));
}

/**
 * فحص امتلاك المستخدم لجميع الصلاحيات المحددة
 */
export function userHasAllPermissions(user: User | null | undefined, permissions: Permission[]): boolean {
  return permissions.every((p) => userHasPermission(user, p));
}
