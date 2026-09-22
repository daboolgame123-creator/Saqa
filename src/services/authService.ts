import { User, userHasPermission } from '../core/models/user';
import { RoleId, Permission } from '../core/models/permission';
import { canUserAccessTransaction } from '../core/models/accessScope';
import { Transaction } from '../core/models/transaction';
import { Employee } from '../core/models/employee';
import { splitEmployeeNames } from '../utils/employeeUtils';
import { MOCK_USERS } from '../data/mockUsers';
import { TransactionService } from './transactionService';
import { TransactionEmployeeService } from './transactionEmployeeService';

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
   * مزامنة علاقات النموذج الأولي ونطاق الرؤية للمعاملة.
   * يضمن:
   * 1. اعتماد TransactionEmployee (PHASE 5) كعلاقة domain — وemployeeIds كمرآة توافق منها.
   * 2. مزامنة employeeName للعرض والبيانات القديمة.
   * 3. تحويل آمن للأسماء القديمة إلى معرّفات بالتطابق الفريد فقط (Rule 7 — بلا تخمين).
   * 4. تعيين نطاق الرؤية الافتراضي (visibility) إن لم يكن محدداً.
   * تطبيع Transaction Domain الأساسي (الحالة وmonth) مسؤولية TransactionService.
   */
  static normalizeTransaction(tr: Transaction, allEmployees: Employee[]): Transaction {
    const updated = TransactionService.normalize(tr);

    // 1. employeeIds هو مرآة التوافق (compatibility mirror) للعلاقة domain (PHASE 5):
    // إذا كانت موجودة وممتلئة نملأ employeeName للعرض إن كان مفقوداً.
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
      // 2. legacy: تحويل الأسماء القديمة إلى معرّفات — عبر آلية التحويل الآمنة في
      // TransactionEmployeeService (تطابق فريد فقط؛ لا تخمين عند تعدّد التطابق أو غيابه).
      const matchedIds = TransactionEmployeeService.resolveEmployeeIds(
        splitEmployeeNames(updated.employeeName),
        allEmployees
      );

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

