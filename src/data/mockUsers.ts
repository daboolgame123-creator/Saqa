import { User } from '../core/models/user';
import { RoleId } from '../core/models/permission';

/**
 * TEST DATA ONLY — all names are fictional.
 * المستخدمون الافتراضيون لبيئة الاختبار والتطوير (Isolated Mock Users)
 * هذا الملف معزول تماماً عن السجلات الحقيقية للمنتسبين، ويستخدم فقط لاختبار
 * الأدوار والصلاحيات (RBAC & Access Scopes) في بيئة النموذج الأولي (Prototype).
 */
export const MOCK_USERS: Record<RoleId, User> = {
  director: {
    id: 'usr-director',
    username: 'director',
    displayName: 'السيد مدير المركز (اسم وهمي)',
    role: 'director',
    department: 'إدارة المركز',
    isActive: true,
    createdAt: '2024-01-01',
  },
  archivist: {
    id: 'usr-archivist',
    username: 'archivist',
    displayName: 'مسؤول شعبة الذاتية والأرشفة',
    role: 'archivist',
    department: 'شعبة الذاتية والأرشفة',
    isActive: true,
    createdAt: '2024-01-01',
  },
  employee: {
    id: 'usr-mock-employee',
    username: 'test_employee',
    displayName: 'منتسب تجريبي (للاختبار)',
    role: 'employee',
    employeeId: 'emp-1', // مرتبط بالمنتسب التجريبي رقم 1 (موظف-تجريبي-1)
    department: 'شعبة الخدمات',
    isActive: true,
    createdAt: '2024-01-01',
  },
  admin: {
    id: 'usr-admin',
    username: 'admin',
    displayName: 'مدير المنظومة (المشرف العام)',
    role: 'admin',
    department: 'إدارة تكنولوجيا المعلومات',
    isActive: true,
    createdAt: '2024-01-01',
  },
};
