/**
 * خطأ «تعارض نسخة» على مستوى المورد (Phase 17 — §33).
 *
 * يعني: السجل تغيّر منذ أن قرأه العميل (نسخة قديمة)، فرُفضت الكتابة
 * **قبل** أن تكتب شيئاً — لا نجاح كاذب ولا كتمان. رمز 409 هو الدلالة
 * القياسية لـConflict في HTTP، ولم يكن هناك رمز آخر مثبتاً في المشروع؛
 * وبقية الأفعال (404 للمورد غير الموجود/غير المرئي) لم تتغيّر.
 *
 * الرمز `VERSION_CONFLICT` ثابت بالإنجليزية ليقرأه العميل برمجياً
 * (عقد الأخطاء Phase 8)، والرسالة عربية تشرح أن التحديث فشل بسبب
 * نسخة قديمة وأن إعادة تحميل السجل مطلوبة.
 */
import { AppError } from '../../errors';

export class VersionConflictError extends AppError {
  /** اسم المورد بالإنجليزية للتشخيص (مثل ResourceNotFoundError). */
  readonly resource: string;

  /** معرّف السجل المتعارض. */
  readonly resourceId: string;

  /** النسخة التي أرسلها العميل (ما قرأه سابقاً). */
  readonly expectedVersion: number;

  /** النسخة الحالية في القاعدة — تُعاد في `details` ليُعاد تحميل السجل. */
  readonly currentVersion: number;

  constructor(
    resource: string,
    resourceId: string,
    arabicLabel: string,
    expectedVersion: number,
    currentVersion: number,
  ) {
    super(
      `تعارض تحديث: ${arabicLabel} بالمعرّف «${resourceId}» تغيّر منذ قراءتك هذه النسخة ` +
        `(المتوقعة ${expectedVersion}، الحالية ${currentVersion}). ` +
        'لم تُكتب أي بيانات — أعد تحميل السجل ثم أعد المحاولة.',
      409,
      'VERSION_CONFLICT',
      true,
      { expectedVersion, currentVersion },
    );
    this.resource = resource;
    this.resourceId = resourceId;
    this.expectedVersion = expectedVersion;
    this.currentVersion = currentVersion;
  }
}