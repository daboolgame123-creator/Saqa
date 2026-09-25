/**
 * الخطأ الأساسي لأخطاء الـBackend التشغيلية (Phase 8).
 *
 * يمثّل خطأً متوقعًا (operational) له رمز حالة HTTP ورمز خطأ ثابت،
 * ويُترجم إلى استجابة منظمة داخل middleware معالجة الأخطاء المركزية.
 *
 * لا يُبنى هنا نظام أخطاء خاص بقواعد الأعمال (Business Domain)؛
 * فذلك خارج نطاق هذه المرحلة.
 */
export class AppError extends Error {
  /** رمز حالة HTTP الذي ستُعاد به الاستجابة. */
  readonly statusCode: number;

  /** رمز خطأ ثابت (بالإنجليزية) يسهّل التعامل البرمجي مع الخطأ. */
  readonly code: string;

  /**
   * true عندما يكون الخطأ متوقعًا (مثل 404) وقابلًا لإظهار رسالته للعميل،
   * وfalse للأخطاء غير المتوقعة التي تُترجم إلى 500 عام.
   */
  readonly isOperational: boolean;

  /**
   * تفاصيل إضافية آمنة للعرض على العميل (مثل قائمة مشاكل التحقق).
   * لا تُعرض أبدًا للأخطاء غير التشغيلية.
   */
  readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    isOperational = true,
    details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
  }
}
