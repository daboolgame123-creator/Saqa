import { User } from './user';
import { userHasPermission } from './user';

/**
 * نطاق الرؤية والوصول للمستندات والكتب (Access Scope / Visibility)
 * يفصل تماماً بين "من يرتبط بالمعاملة؟" وبين "من يحق له الاطلاع عليها؟"
 */
export type AccessScope = 
  | 'PublicToEmployees'  // عام لكافة المنتسبين داخل النظام (مثل: إعلانات، دورات عامة، توجيهات عامة)
  | 'SpecificEmployees'  // مخصص لمنتسبين محددين (تظهر للمعنيين بالاسم فقط، بالإضافة للإدارة)
  | 'Administrative'     // كتاب إداري/مالي/توثيقي لا يظهر للمنتسبين العاديين، متاح للإدارة والذاتية فقط
  | 'DirectorOnly';      // سري للغاية أو خاص بالإدارة العليا / المدير فقط

export interface AccessScopeOption {
  id: AccessScope;
  label: string;
  description: string;
  badgeColor: string;
}

export const ACCESS_SCOPE_OPTIONS: Record<AccessScope, AccessScopeOption> = {
  PublicToEmployees: {
    id: 'PublicToEmployees',
    label: 'عام للمنتسبين',
    description: 'متاح للاطلاع لجميع الكوادر والمنتسبين داخل المنظومة الداخلية فقط (وليس متاحاً على الإنترنت أو خارج النظام)',
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  SpecificEmployees: {
    id: 'SpecificEmployees',
    label: 'خاص بالمعنيين',
    description: 'يظهر فقط للمنتسبين المرتبطين بهذا الكتاب (عبر معرفاتهم الرسمية employeeIds) بالإضافة للإدارة والأرشيف',
    badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  },
  Administrative: {
    id: 'Administrative',
    label: 'إداري / تنظيمي',
    description: 'محصور بمسؤولي الذاتية والأرشفة والإدارة، ولا يظهر في حسابات المنتسبين العاديين',
    badgeColor: 'bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-300 border-stone-200 dark:border-stone-700',
  },
  DirectorOnly: {
    id: 'DirectorOnly',
    label: 'خاص بالإدارة (سري)',
    description: 'لا يظهر إلا للسيد المدير والمخوّلين بصلاحية خاصة عليا',
    badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  },
};

/**
 * الكيان الوسيط لربط المعاملة بالمنتسبين (Transaction - Employee Relation)
 * مصمم ليكون مطابقاً لجدول العلاقة المستقبلي في قاعدة البيانات (e.g. TransactionEmployees table)
 */
export interface TransactionEmployeeRelation {
  transactionId: string;
  employeeId: string;
  employeeName?: string;
  relationshipType?: 'subject' | 'recipient' | 'assigned' | 'beneficiary'; // موضوع المعاملة، المستلم، المكلف، المستفيد
  notes?: string;
}

/**
 * دالة التحقق من أحقية وصول المستخدم إلى المعاملة بناءً على نطاق الرؤية والصلاحيات
 * (Server-Ready Access Control Logic)
 * مصممة لتكون دالة نقية (Pure Function) قابلة للنقل المباشر إلى الـ Backend
 * كـ Middleware أو Policy للتحقق من الأذونات على مستوى الخادم.
 */
export function canUserAccessTransaction(
  user: User | null | undefined,
  transaction: {
    visibility?: AccessScope;
    employeeIds?: string[];
    employeeName?: string;
    priority?: string;
  }
): boolean {
  if (!user || !user.isActive) return false;

  // مسؤول النظام (Admin): وصول كامل للمعاينة والإشراف الفني
  if (user.role === 'admin') return true;

  const visibility: AccessScope = transaction.visibility || 'Administrative';

  // 1. فحص نطاق 'DirectorOnly' (خاص بالإدارة والمدير)
  if (visibility === 'DirectorOnly') {
    return user.role === 'director' || userHasPermission(user, 'transactions.directive');
  }

  // 2. فحص المدير (Director): يرى جميع النطاقات الأخرى
  if (user.role === 'director') return true;

  // 3. فحص مسؤول الأرشيف (Archivist): يرى العام والمخصص والإداري (كل ما ليس محصوراً بالمدير فقط)
  if (user.role === 'archivist') return true;

  // 4. فحص المنتسب العادي (Employee)
  if (user.role === 'employee') {
    // أ. إذا كان الكتاب عاماً للمنتسبين داخل النظام (نظام داخلي محمي)
    if (visibility === 'PublicToEmployees') {
      return true;
    }

    // ب. إذا كان الكتاب خاصاً بالمعنيين:
    // القاعدة الأساسية: التحقق الصارم من وجود employeeId للمستخدم ضمن قائمة employeeIds للمعاملة
    if (visibility === 'SpecificEmployees') {
      if (Array.isArray(transaction.employeeIds) && transaction.employeeIds.length > 0) {
        return Boolean(user.employeeId && transaction.employeeIds.includes(user.employeeId));
      }

      // دعم التوافق التراجعي (Fallback) فقط إذا كانت المعاملة قديمة ولم يتم ربط employeeIds بها بعد
      if (user.displayName && transaction.employeeName && transaction.employeeName.includes(user.displayName)) {
        return true;
      }
    }

    // لا يستطيع المنتسب العادي رؤية الكتب الإدارية أو الخاصة بالمدير
    return false;
  }

  return false;
}
