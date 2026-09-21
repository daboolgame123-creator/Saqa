import { User, userHasPermission } from '../core/models/user';
import { RoleId, Permission } from '../core/models/permission';
import { canUserAccessTransaction } from '../core/models/accessScope';
import { Transaction } from '../core/models/transaction';
import { Employee } from '../core/models/employee';
import { splitEmployeeNames, isEmployeeMatch } from '../utils/employeeUtils';
import { MOCK_USERS } from '../data/mockUsers';

export class AuthService {
  /**
   * جلب كائن المستخدم النشط بناءً على الدور المحدد من ملف المستخدمين التجريبيين المعزول
   */
  static getUserForRole(roleId: RoleId): User {
    return MOCK_USERS[roleId] || MOCK_USERS.director;
  }

  /**
   * فحص الصلاحية الصريحة للمستخدم
   */
  static hasPermission(user: User | null | undefined, permission: Permission): boolean {
    return userHasPermission(user, permission);
  }

  /**
   * تصفية المعاملات بناءً على صلاحيات ونطاق رؤية المستخدم (Access Scope Filter)
   * هذه الدالة تطبق منطق التخويل الأمني (Authorization Logic) الجاهز للنقل المباشر إلى الـ Backend
   */
  static filterTransactionsForUser(user: User, transactions: Transaction[]): Transaction[] {
    if (!user || !user.isActive) return [];

    return transactions.filter((tr) => canUserAccessTransaction(user, tr));
  }

  /**
   * مزامنة وتطبيع العلاقات ونطاق الرؤية للمعاملة (Normalization & Data Enrichment)
   * يضمن:
   * 1. اعتماد employeeIds كعلاقة أساسية رئيسية
   * 2. مزامنة employeeName للتوافق التراجعي والعرض
   * 3. تعيين نطاق الرؤية الافتراضي (visibility) إن لم يكن محدداً
   */
  static normalizeTransaction(tr: Transaction, allEmployees: Employee[]): Transaction {
    const updated = { ...tr };

    // 1. إذا كانت مصفوفة employeeIds موجودة وممتلئة (العلاقة الأساسية):
    // نتأكد من ملء employeeName للعرض إن كان مفقوداً
    if (Array.isArray(updated.employeeIds) && updated.employeeIds.length > 0) {
      if (!updated.employeeName || !updated.employeeName.trim()) {
        const names = updated.employeeIds
          .map((id) => allEmployees.find((e) => e.id === id)?.name)
          .filter(Boolean);
        if (names.length > 0) {
          updated.employeeName = names.join(' ، ');
        }
      }
    } else if (updated.employeeName) {
      // 2. إذا كانت المعاملة قديمة ولا تحتوي على employeeIds، نقوم بربط المعرفات استناداً للأسماء
      const names = splitEmployeeNames(updated.employeeName);
      const matchedIds: string[] = [];

      for (const name of names) {
        const found = allEmployees.find((e) => isEmployeeMatch(e.name, name));
        if (found && !matchedIds.includes(found.id)) {
          matchedIds.push(found.id);
        }
      }

      if (matchedIds.length > 0) {
        updated.employeeIds = matchedIds;
      }
    }

    // 3. تعيين نطاق الرؤية الافتراضي (Default Access Scope) للبيانات السابقة غير المحددة
    if (!updated.visibility) {
      if (updated.priority === 'سري') {
        updated.visibility = 'DirectorOnly';
      } else if (updated.category === 'منتسبين' || (updated.employeeIds && updated.employeeIds.length > 0)) {
        updated.visibility = 'SpecificEmployees';
      } else if (updated.category === 'إدارية' || updated.category === 'مالية') {
        updated.visibility = 'Administrative';
      } else {
        updated.visibility = 'PublicToEmployees';
      }
    }

    return updated;
  }
}

