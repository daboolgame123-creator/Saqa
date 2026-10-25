/**
 * استقبال ملف مرفق خام في مسار الرفع (Phase 14).
 *
 * **لماذا `raw` لا `multipart`:** كل طلب يحمل ملفاً واحداً، و`express.json()`
 * لا يقبل البايتات الخام أصلاً. و`express.raw` بنمط «أي نوع» يقرأ الجسم
 * كما هو بلا تحليل ولا مكتبة خارجية، فيفحصه `validateAttachmentContent`.
 * النمط العام مقصود: لا نثق بتصفية مبنية على ترويسة العميل.
 *
 * تنبيه أمني: النمط العام يقرأ **أي** محتوى — وهذا مقصود لأن الرفض يقع في
 * فحص المحتوى لا في فلتر الترويسة. البديل (قبول `image/*` و`pdf` فقط) كان
 * سيدفعنا لتصفية بترويسة العميل، وهي التي نتحقق منها أصلاً. أمّا حد الحجم
 * فمطبَّق مرتين: هنا على البايتات الواردة، وفي الخدمة على المحتوى نفسه.
 */
import express, { type Request } from 'express';
import { config } from '../../config';
import { ATTACHMENT_TYPES } from './catalogs';
import { AttachmentValidationError, InvalidFilenameError } from '../../storage';

/** الحد الأقصى للبايتات المقروءة من الطلب — نفس حد التخزين. */
const RAW_LIMIT_BYTES = config.attachmentMaxFileSizeBytes;

/**
 * وسيط يقرأ جسم طلب الرفع كـBuffer خام.
 *
 * يركّب **على مسار الرفع وحده**، بعد `express.json()` العام. لو رُكّب
 * عالمياً لبتل الترويسات قراءة أجسام JSON كـBuffer وكسر كل مسارات الـAPI
 * القائمة — وهذا بالضبط سبببقائه في مسار واحد.
 */
export const rawAttachmentBody: express.RequestHandler = express.raw({
  type: '*/*',
  limit: RAW_LIMIT_BYTES,
});

/** ترويسة إرسال نوع المرفق (من كتالوج الخطة، لا قيمة حرة). */
const ATTACHMENT_TYPE_HEADER = 'x-attachment-type';

/** ترويسة الاسم الأصلي (تُرسل بترميز URI كما في ترويسة `Content-Disposition`). */
const ORIGINAL_FILENAME_HEADER = 'x-attachment-filename';

/** ترويسة تاريخ الإنشاء `YYYY-MM-DD` (اختيارية: الخادم يعطي تاريخ اليوم). */
const CREATED_DATE_HEADER = 'x-attachment-created-date';

/** ناتج قراءة ترويسات الرفع بعد التحقق منها. */
export interface UploadAttachmentHeaders {
  /** اسم الملف الأصلي كما أرسله العميل (قبل التنظيف). */
  originalFilename: string;
  /** نوع MIME المعلن (مطالبة تُقارَن بالمحتوى، أو `null`). */
  declaredMimeType: string | null;
  /** بايتات الملف كما وصلت. */
  content: Buffer;
  /** نوع المرفق من كتالوج الخطة. */
  attachmentType: string;
  /** تاريخ الإنشاء `YYYY-MM-DD`. */
  createdDate: string;
  /** الحجم كنص عرض المتوافق (مولَّد من البايتات لا من ترويسة العميل). */
  fileSize: string;
}

/** يقرأ ترويسة نصية واحدة بلا حساسية لحالة الأحرف، أو `null`. */
function readHeader(req: Request, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : null;
  }
  return value ?? null;
}

/** ترويسة تاريخ اليوم `YYYY-MM-DD` بتوقيت العملية. */
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * يفكّ ترميز قيمة ترويسة قُدِّمت بترميز URI.
 *
 * قيمة بترميز غير صالح تبقى كما وردت — والفحص الذي يليه (الانتماء للكتالوج)
 * هو الحَكَم، فلا يُبنى هنا رفض على أساس التخمين.
 */
function decodeHeaderValue(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** صيغة نصية للحجم بالبايت، متوافقة مع القيم القائمة («1.2 MB»). */
function formatSizeForDisplay(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** يقرأ ترويسات الرفع ويتحقق منها، فيضع النتيجة النظيفة على الطلب. */
export function readUploadHeaders(req: Request): UploadAttachmentHeaders {
  const content = req.body;
  if (!Buffer.isBuffer(content)) {
    // لم يقرأ الوسيط body، أو وصل الجسم بصيغة غير بايتات خام.
    throw new AttachmentValidationError(
      'جسم طلب الرفع يجب أن يكون بايتات الملف نفسها.',
      'ATTACHMENT_BODY_NOT_BINARY',
    );
  }

  // 1) الاسم: إجباري، ولا يُقبل فارغاً. التحقق العميق (محارف خطرة) في
  //    `sanitizeOriginalFilename`؛ هنا فقط نمنع الغياب والفارغ.
  const rawName = readHeader(req, ORIGINAL_FILENAME_HEADER);
  if (rawName === null || rawName.trim() === '') {
    throw new InvalidFilenameError(rawName ?? '');
  }
  let originalFilename: string;
  try {
    // العميل يرسل الاسم بترميز URI (كما في `Content-Disposition`)، لأن
    // الأسماء العربية لا تُنقل بترميز latin1 في الترويسات.
    originalFilename = decodeURIComponent(rawName);
  } catch {
    // اسم بترميز غير صالح: يُستخدم كما ورد، والفحص العميق هو الحَكَم.
    originalFilename = rawName;
  }
  // 2) نوع المرفق: من كتالوج الخطة. غياب الترويسة أو قيمة لا تنتمي
  //    للكتالوج ⇒ «أخرى» (قيمة قائمة، لا قيمة اخترعناها).
  //
  //    تُفكّ ترميز Tرويسة كما في الاسم: قيم الكتالوج عربية وترويسات HTTP
  //    محدودة بـByteString (latin1) فترفض العربية نصاً. لذلك يرمّزها
  //    المرسل؛ وبلا ذلك يستحيل تحديد نوع مرفق عربي إطلاقاً.
  const requestedType = decodeHeaderValue(readHeader(req, ATTACHMENT_TYPE_HEADER));
  const attachmentType =
    requestedType !== null && (ATTACHMENT_TYPES as readonly string[]).includes(requestedType)
      ? requestedType
      : 'أخرى';

  // 3) تاريخ الإنشاء: من الترويسة إن كان تاريخاً صالحاً، وإلا تاريخ اليوم.
  //    لا يُقبل تاريخ عشوائي يُفسد التصفية الشهرية.
  const requestedDate = readHeader(req, CREATED_DATE_HEADER);
  const createdDate =
    requestedDate !== null && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate.trim())
      ? requestedDate.trim()
      : todayIsoDate();

  const declaredMimeType = readHeader(req, 'content-type');

  return {
    originalFilename,
    // معاملات `Content-Type` (مثل `; charset=`) تُقصّ: المقارنة في طبقة
    // التخزين تتعامل معها، فلا داعي لتكراره هنا.
    declaredMimeType: declaredMimeType === null ? null : declaredMimeType.split(';')[0].trim(),
    content,
    attachmentType,
    createdDate,
    // الحجم يُقاس من البايتات الفعلية: ترويسة `Content-Length` من العميل
    // ادّعاء لا يُبنى عليه (§30 · integrity).
    fileSize: formatSizeForDisplay(content.length),
  };
}
