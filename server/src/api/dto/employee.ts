/**
 * DTOs (Data Transfer Objects) لطبقة الـAPI — Phase 10.
 *
 * القاعدة الحاكمة: الـDTO هو **شكل النقل** (wire shape) لا نموذج المجال.
 * يُبنى من سجل المستودع (record) ويُقرأ في المتطلب (input) بعد التحقق.
 *
 * مبدأ لا يُخترق:
 * - لا تُضاف حقول عمل جديدة هنا. كل حقل له أصل في `src/core/models` أو
 *   في `server/src/repositories/contracts.ts`.
 * - الحقول الاختيارية تبقى `?` وتُحذف من الكائن (لا `null`) عند النقل،
 *   ليبقى العقد متسقاً مع `nullToUndefined` في طبقة المستودعات.
 * - الحقول التقنية (createdAt/updatedAt) جزء من عقد القراءة فقط؛
 *   لا تُقبل في أي Create/Update DTO.
 *
 * المرجع: ALSQAYA_PLAN §26 (Phase 10) و§52 (قواعد البيانات والاستيراد).
 */
import type { EmployeeCategory } from '../../../../src/core/models/employee';

/** DTO قراءة الموظف — مطابق لـEmployeeRecord في repositories/contracts. */
export interface EmployeeDto {
  id: string;
  name: string;
  title: string;
  department: string;
  badgeNumber?: string;
  joinedDate?: string;
  category?: EmployeeCategory;
  academicDegree?: string;
  specialization?: string;
  /** الحالة الراهنة (الخطة §7.3): 'active' | 'former'. */
  status: string;
  phone?: string;
  photo?: string;
  userId?: string;
  createdAt: string;
  updatedAt: string;
}

/** DTO إنشاء الموظف — بلا id وبلا توقيتات النظام (تولّدها القاعدة). */
export interface CreateEmployeeDto {
  name: string;
  title: string;
  department: string;
  badgeNumber?: string;
  joinedDate?: string;
  category?: EmployeeCategory;
  academicDegree?: string;
  specialization?: string;
  status?: string;
  phone?: string;
  photo?: string;
  userId?: string;
}

/** DTO تعديل جزئي — الحقول غير المذكورة تبقى كما هي (PATCH). */
export type UpdateEmployeeDto = Partial<CreateEmployeeDto>;

/**
 * DTO تغيير الحالة (نقل إلى 'former' مع سبب معتمد من القيم الأربع — الخطة §13).
 * ملاحظة: `serviceEndReason` إلزامي في القاعدة عند status='former'.
 */
export interface ChangeEmployeeStatusDto {
  status: string;
  serviceEndReason?: string;
  notes?: string;
}

/** DTO سطر من سجل تغييرات حالة الموظف. */
export interface EmployeeStatusHistoryDto {
  id: string;
  employeeId: string;
  status: string;
  /** null عند state='active' (العمود NOT NULL مطلوب فقط مع 'former'). */
  serviceEndReason: string | null;
  notes: string | null;
  changedAt: string;
}

/** فلترة قائمة الموظفين القادمة من الـquery string. */
export interface EmployeeListQuery {
  status?: 'active' | 'former' | 'all';
  search?: string;
}
