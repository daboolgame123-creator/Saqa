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
