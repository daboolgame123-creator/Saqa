/**
 * طبقة التخزين المركزي للمرفقات (Phase 14 — §30).
 *
 * واجهة الطبقة. بقية المشروع يستورد من هنا فقط، فلا يعرف أحد تفاصيل القرص
 * ولا قواعد التنظيف ولا صيغ البصمة. التقسيم الداخلي:
 *   - `fileValidation`   — MIME من المحتوى، التنظيف، الحدود، path traversal.
 *   - `fileStorage`      — البناء والحذف على القرص، ومفتاح مشتقّ من stable ID.
 *   - `integrity`        — بصمة SHA-256 والتحقق منها وحالة السلامة.
 *   - `integrityState`   — تعريف الحالات (مع قيود CHECK في الترحيل 0007).
 *   - `storageErrors`    — أخطاء تشغيلية تدخل معالج الأخطاء المركزي.
 *   - `historicalArchiveImport` — مطابقة أرشيف الجود وتقرير الاستيراد.
 *
 * **`audit/` تبقى محجوزة** لسجل التدقيق والاطلاع (Phase 15) — لا شيء من
 * تلك المرحلة هنا.
 */

// قيمة مجلد المرفقات داخل حزمة تصدير الجود، وتصدير أدوات المطابقة.
export {
  ARCHIVE_ATTACHMENTS_DIRNAME,
  inspectArchiveFolder,
  mapArchiveReferencesToFiles,
  verifyImportedFile,
  type ArchiveAttachmentReference,
  type ArchiveImportReport,
  type InspectedArchiveFile,
} from './historicalArchiveImport';

// فحص المحتوى وتنظيف الاسم وحدود الحجم.
export {
  assertPathWithinRoot,
  detectMimeType,
  isAllowedMimeType,
  sanitizeOriginalFilename,
  validateAttachmentContent,
  type DetectedMime,
  type SanitizedFilename,
} from './fileValidation';

// الوصول إلى القرص وبناء مفتاح التخزين.
export { buildStorageKey, FileStorage, getFileStorage, type FileStorageOptions } from './fileStorage';

// البصمة والتحقق وحالة السلامة.
export {
  computeContentHash,
  isVerifiableHash,
  resolveIntegrityState,
  verifyContentHash,
} from './integrity';
export { isStoredIntegrityState, STORED_INTEGRITY_STATES, type IntegrityState } from './integrityState';

// أخطاء الطبقة.
export {
  AttachmentFileMissingError,
  AttachmentStorageNotConfiguredError,
  AttachmentTooLargeError,
  AttachmentUnreadableError,
  AttachmentValidationError,
  InvalidFilenameError,
  MimeMismatchError,
  UnsupportedMediaTypeError,
} from './storageErrors';
