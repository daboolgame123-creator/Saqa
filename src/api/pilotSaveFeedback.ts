/** Safe, non-sensitive error messages for official pilot save forms. */
import { ApiError } from './apiError';

export function pilotSaveFailureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'تغيّر السجل على الخادم. أعد تحميل الصفحة قبل إعادة الحفظ.';
    if (error.status === 403 || error.status === 404) return 'رفض الخادم العملية أو لم يعد السجل متاحًا ضمن صلاحياتك.';
    if (error.status === 401) return 'انتهت جلسة الدخول. سجّل الدخول مجددًا.';
    if (error.status === 400) return 'رفض الخادم بيانات النموذج. راجع الحقول المطلوبة وصيغتها.';
    return 'تعذّر تأكيد الحفظ في الخادم. تحقق من السجل قبل المحاولة مجددًا.';
  }
  if (error instanceof Error) {
    switch (error.message) {
      case 'OFFICIAL_ATTACHMENTS_REQUIRE_UPLOAD':
        return 'لا يمكن حفظ مرفق من بيانات العرض فقط. احفظ الكتاب دون مرفقات؛ يلزم رفع الملفات عبر المسار الرسمي.';
      case 'OFFICIAL_DAILY_CREATION_NOT_ATOMIC':
        return 'استمارة الموقف اليومي الموروثة لا تدعم حفظًا رسميًا موحدًا. استخدم المسار المستقل المعتمد.';
      case 'OFFICIAL_LINKS_NEED_SEPARATE_WORKFLOW':
        return 'تغيير ارتباطات المنتسبين يحتاج مسار الربط الرسمي المنفصل. ألغِ تغيير القائمة ثم أعد الحفظ.';
      case 'VERSION_CONFLICT_LOCAL':
        return 'تغيّرت نسخة الكتاب في القائمة. أعد تحميل السجل قبل الحفظ.';
      case 'INVALID_TRANSACTION':
      case 'INVALID_EMPLOYEE':
      case 'INVALID_EMPLOYEE_LINK':
        return 'بيانات الكتاب غير مكتملة أو غير صالحة. راجع النموذج قبل الحفظ.';
    }
  }
  return 'لم يؤكد الخادم حفظ الكتاب. لم نغلق النموذج ولم نعلن نجاح العملية.';
}
