import { AppError } from './AppError';
import type { ValidationIssue } from '../validation/validationTypes';

/**
 * خطأ 400 — مدخلات الطلب غير صالحة.
 * يحمل قائمة المشاكل المنظمة، وتُعرض في حقل details بالاستجابة.
 *
 * استيراد ValidationIssue هنا نوعي فقط (import type) فلا ينشأ اعتماد وقت تنفيذ
 * من طبقة الأخطاء على طبقة التحقق.
 */
export class ValidationError extends AppError {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[], message = 'بيانات الطلب غير صالحة.') {
    super(message, 400, 'VALIDATION_ERROR', true, issues);
    this.issues = issues;
  }
}
