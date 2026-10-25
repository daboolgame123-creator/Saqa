/**
 * أخطاء طبقة التخزين المركزي للمرفقات (Phase 14 — §30).
 *
 * كلها ترث `AppError` من الطبقة العامة، فيترجمها معالج الأخطاء المركزي
 * (Phase 8) إلى استجابات HTTP منظّمة بلا تسريب تفاصيل داخلية.
 *
 * قرار مشترك: أخطاء المرفقات **مفتوحة** (400/503) وليست `ResourceNotFoundError`
 * محجوباً، لأن الرفض هنا يخص **سلامة الملف المدخل** لا رؤية المورد. رؤية
 * الكتاب نفسه تبقى محكومة بقاعدة Phase 13 (404 عند خارج النطاق) قبل أي وصول
 * إلى هذه الطبقة.
 */
import { AppError } from '../errors';

/** خطأ عام في طبقة التخزين (خطأ تحقق مخصّص للملفات). */
export class AttachmentValidationError extends AppError {
  constructor(message: string, code = 'ATTACHMENT_VALIDATION_FAILED') {
    super(message, 400, code);
  }
}

/** اسم الملف غير صالح أو يصبح فارغاً بعد التنظيف. */
export class InvalidFilenameError extends AttachmentValidationError {
  constructor(rawFilename: string) {
    super(
      `اسم الملف غير صالح للاستخدام: «${rawFilename}». يجب أن يبقى اسم صالح بعد التنظيف.`,
      'ATTACHMENT_INVALID_FILENAME',
    );
  }
}

/** محتوى الملف لا يطابق أي نوع مسموح به. */
export class UnsupportedMediaTypeError extends AttachmentValidationError {
  constructor(declaredType: string | null, detectedType: string | null) {
    super(
      `نوع الملف غير مدعوم. المعلن: «${declaredType ?? 'غير محدد'}» والمكتشَف من المحتوى: «${detectedType ?? 'غير معروف'}».`,
      'ATTACHMENT_UNSUPPORTED_MEDIA_TYPE',
    );
  }
}

/** النوع المعلن من العميل يخالف ما اكتُشف من المحتوى الفعلي. */
export class MimeMismatchError extends AttachmentValidationError {
  constructor(declaredType: string, detectedType: string) {
    super(
      `نوع الملف المعلن «${declaredType}» لا يطابق المحتوى الفعلي «${detectedType}».`,
      'ATTACHMENT_MIME_MISMATCH',
    );
  }
}

/** حجم الملف يتجاوز الحد المسموح. */
export class AttachmentTooLargeError extends AttachmentValidationError {
  constructor(actualBytes: number, maxBytes: number) {
    super(
      `حجم الملف يتجاوز الحد المسموح (${actualBytes} بايت والحد ${maxBytes} بايت).`,
      'ATTACHMENT_TOO_LARGE',
    );
  }
}

/** التخزين المركزي غير مهيّأ (لا يوجد `ATTACHMENT_STORAGE_DIR`). */
export class AttachmentStorageNotConfiguredError extends AppError {
  constructor() {
    super(
      'التخزين المركزي للمرفقات غير مهيّأ: لم يُضبط المسار المطلوب (ATTACHMENT_STORAGE_DIR).',
      503,
      'ATTACHMENT_STORAGE_NOT_CONFIGURED',
    );
  }
}

/** الملف المطلوب غير موجود على القرص رغم وجود سجله في القاعدة. */
export class AttachmentFileMissingError extends AppError {
  constructor(storageKey: string) {
    super('ملف المرفق غير موجود في التخزين المركزي.', 404, 'ATTACHMENT_FILE_MISSING');
    this.storageKey = storageKey;
  }

  /** مفتاح التخزين المطلوب (للتشخيص الداخلي فقط). */
  readonly storageKey: string;
}

/** تعذّر قراءة الملف المحفوظ أو كان التلف يمنع قراءته. */
export class AttachmentUnreadableError extends AppError {
  constructor(message = 'تعذّرت قراءة ملف المرفق من التخزين المركزي.') {
    super(message, 500, 'ATTACHMENT_UNREADABLE');
  }
}
