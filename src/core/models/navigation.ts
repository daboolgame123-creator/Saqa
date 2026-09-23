import { TransactionDirection, TransactionCategory } from './transaction';
import { EmployeeCategory } from './employee';
import { RoleId } from './permission';

/**
 * أدوار المستخدمين في النظام:
 * 'director': السيد مدير المركز
 * 'archivist': مسؤول الذاتية والأرشفة
 * 'employee': المنتسب / الباحث (عرض محدود ومخصص)
 * 'admin': مدير النظام الشامل
 */
export type UserRole = RoleId;

export interface NavigationTarget {
  view?: 'transactions' | 'employees' | 'daily-situations' | 'report' | 'archivist-studio';
  direction?: TransactionDirection | 'الكل';
  category?: TransactionCategory | 'الكل';
  subType?: string;
  /** الرابط الأساسي للمنتسب (Rule 7) — يُفضَّل على الاسم النصي عند توفره */
  employeeId?: string;
  employeeName?: string;
  entity?: string;
  searchTerm?: string;
  employeeCategory?: EmployeeCategory;
}
