/**
 * أسباب انتهاء الخدمة المعتمدة (الخطة §13 / قيد CHECK في migration 0001).
 * معرَّفة هنا ليقرأ منها الخادم (catalogs.ts) والواجهة (حذف الموظف)
 * مصدراً واحداً، فلا تختلف القيم بين جهتين.
 */
export const SERVICE_END_REASONS = [
  'انتهت خدمته',
  'تقاعد',
  'انفصال',
  'استقالة',
] as const;

/** نوع أحد أسباب انتهاء الخدمة المعتمدة. */
export type ServiceEndReason = (typeof SERVICE_END_REASONS)[number];

export type EmployeeCategory = 'منتسب' | 'باحث';

export interface Employee {
  id: string;
  name: string;
  title: string;
  department: string;
  badgeNumber?: string;
  joinedDate?: string;
  category?: EmployeeCategory; // 'منتسب' (كادر إداري/فني) أو 'باحث' (أستاذ/باحث)
  academicDegree?: string;      // اللقب العلمي للأساتذة (أ.د، دكتور، باحث...)
  specialization?: string;      // الاختصاص أو الشعبة البحثية
  userId?: string;              // معرف حساب المستخدم المرتبط (إن وجد) لتسجيل الدخول والصلاحيات
}
