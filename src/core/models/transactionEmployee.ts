/**
 * علاقة الكتاب بالمنتسبين (BR-05) — Many-to-Many.
 * الرابط الأساسي: employeeId (Rule 7) — لا يعتمد النظام على employeeName كنقطة ربط.
 *
 * هذا الكيان هو البديل النهائي لحقلي employeeIds[]/employeeName التاريخيين داخل
 * Transaction. الانتقال الفعلي للاستخدام إليه مرحلة لاحقة (Phase 5 وفق خطة ALSQAYA)
 * حفاظاً على البيانات المخزنة الحالية (Rule 3) — النموذج يُعرَّف الآن فقط.
 */
export type TransactionEmployeeRole =
  | 'subject'      // موضوع المعاملة
  | 'recipient'    // المستلم
  | 'assigned'     // المكلف
  | 'beneficiary'; // المستفيد

export interface TransactionEmployee {
  id: string;
  transactionId: string;
  employeeId: string;
  relationshipType?: TransactionEmployeeRole;
  notes?: string;
  createdAt?: string;
}
