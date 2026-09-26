/**
 * DTO علاقة الكتاب بالمنتسب (BR-05) — Phase 10.
 *
 * M:N حقيقية؛ الرابط الأساسي employeeId لا الاسم (القاعدة 7 / §7.6).
 */
export interface TransactionEmployeeDto {
  id: string;
  transactionId: string;
  employeeId: string;
  relationshipType?: string;
  notes?: string;
  createdAt?: string;
}

export interface CreateTransactionEmployeeDto {
  transactionId: string;
  employeeId: string;
  relationshipType?: string;
  notes?: string;
}

export type UpdateTransactionEmployeeDto = {
  relationshipType?: string;
  notes?: string;
};
