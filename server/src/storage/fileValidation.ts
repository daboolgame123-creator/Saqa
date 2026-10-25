/**
 * التحقق من ملفات المرفقات قبل حفظها في التخزين المركزي (Phase 14 — §30 «حماية»).
 *
 * كل فحص هنا **يفشل مغلقاً**: القيمة غير المقبولة تُرفض ولا تُصحَّح ولا
 * تُخترع لها قاعدة. الأنواع الأربعة التي تشترطها §30 مغطّاة هنا:
 *   1. منع path traversal — مرحلتان: تنظيف الاسم (لا محارف مسار ولا `..`)،
 *      ثم التأكد أن المسار المحسوب داخل الجذر.
 *   2. filename sanitization — الاسم الأصلي يُحفظ كما ورد من المصدر، لكن
 *      نسخة التنظيف هي ما يلمس القرص.
 *   3. MIME validation — النوع يُحدَّد من **محتوى الملف** (توقيعات بايتية)،
 *      لا من الامتداد. ترويسة `Content-Type` من العميل *مطالبة* تُقارَن
 *      بالمكتشَف، فالاختلاف رفض لا تصديق.
 *   4. size limits — حجم فعلي مقيس بالبايت مقابل حد مُعلن.
 *
 * ما لا يفعله هذا الملف: لا يلمس القرص ولا القاعدة. حساب البصمة في
 * `integrity.ts`، والحفظ الفعلي في `fileStorage.ts`.
 */
import { resolve, sep } from 'node:path';
import {
  AttachmentTooLargeError,
  AttachmentValidationError,
  InvalidFilenameError,
  MimeMismatchError,
  UnsupportedMediaTypeError,
} from './storageErrors';

/** عدد البايتات المفحوصة للمحتوى — يكفي لكل توقيعات الصيغ المعتمدة. */
const SIGNATURE_SCAN_LENGTH = 16;

/**
 * الصيغ المعتمدة: من النوع ← توقيعه البايتي.
 *
 * كل نوع هنا له توقيع محتوى ثابت يمكن فحصه فعلاً. أي صيغة لا يمكن التحقق
 * من محتواها (مثل `text/plain` أو `.docx` غير المضغوط) **ليست** في هذه
 * القائمة، فأي محتوى لا يطابق توقيعاً معروفاً يُرفض — وهذا fail-closed
 * مقصود: يُفضَّل رفض ملف على قبول ملف لم يُفحص محتواه.
 */
const SIGNATURE_TYPES: readonly {
  mime: string;
  extension: string;
  test: (bytes: Buffer) => boolean;
}[] = [
  {
    mime: 'application/pdf',
    extension: '.pdf',
    test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  },
  {
    mime: 'image/png',
    extension: '.png',
    test: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    mime: 'image/jpeg',
    extension: '.jpg',
    test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/gif',
    extension: '.gif',
    test: (b) => b.length >= 6 && b.subarray(0, 6).toString('latin1').startsWith('GIF8'),
  },
  {
    mime: 'image/tiff',
    extension: '.tif',
    test: (b) => {
      const head = b.subarray(0, 4).toString('latin1');
      return head === 'II*\u0000' || head === 'MM\u0000*';
    },
  },
  {
    mime: 'image/webp',
    extension: '.webp',
    test: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/** الأنواع المسموح بها: هي المكتشَفة من التوقيعات، لا قائمة مفتوحة. */
const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set(SIGNATURE_TYPES.map((e) => e.mime));

/** نتيجة فحص محتوى: النوع المكتشَف والامتداد المقابل له. */
export interface DetectedMime {
  /** نوع MIME المستنتج من البايتات، أو `null` إن لم يطابق توقيعاً. */
  mime: string | null;
  /** الامتداد المقابل (مع نقطة)، أو `null`. */
  extension: string | null;
}

/**
 * يكتشف نوع الملف من **محتواه** بفحص التوقيع البايتي (§30).
 *
 * لا يُرجع `application/octet-stream` حلاً وسطاً: إمّا توقيع معروف أو
 * `null`. هذا بالضبط ما يجعل الامتداد غير قادر على الانفراد بالقرار.
 */
export function detectMimeType(content: Buffer): DetectedMime {
  if (content.length === 0) {
    return { mime: null, extension: null };
  }
  const head = content.subarray(0, SIGNATURE_SCAN_LENGTH);
  for (const entry of SIGNATURE_TYPES) {
    if (entry.test(head)) {
      return { mime: entry.mime, extension: entry.extension };
    }
  }
  return { mime: null, extension: null };
}

/** هل النوع المكتشَف ضمن الأنواع المسموح بها؟ */
export function isAllowedMimeType(mime: string): boolean {
  return ALLOWED_MIME_TYPES.has(mime);
}

/** نتيجة فحص اسم الملف الأصلي. */
export interface SanitizedFilename {
  /**
   * الاسم الأصلي القادم من المصدر، محفوظاً كما ورد (عربية، مسافات، وعلامات
   * الترقيم) — يُخزَّن في `original_filename` ولا يُستخدم للتخزين على القرص.
   */
  original: string;
  /**
   * نسخة آمنة للقرص: بلا محارف مسار، بلا `..`، بلا محارف تحكم.
   * هذه وحدها تدخل مفتاح التخزين (بجانب الـstable ID).
   */
  safe: string;
  /** الامتداد (مع نقطة) كما في الأصل بحروف صغيرة، أو سلسلة فارغة. */
  extension: string;
}

/** المقطع الأخير من قيمة قد تحوي محارف مسار. */
function basenameOnly(value: string): string {
  const cut = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
  return cut >= 0 ? value.slice(cut + 1) : value;
}

/** الامتداد إن وُجد في آخر الاسم (نقطة تليها حروف، لا مجرد نقطة أخيرة). */
function extractExtension(value: string): string {
  const dotIndex = value.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === value.length - 1) {
    return '';
  }
  return value.slice(dotIndex);
}

/**
 * ينظّف اسم الملف الأصلي إلى اسم آمن للقرص (filename sanitization — §30).
 *
 * الخطوات (كل واحدة تُبقي الاسم صالحاً):
 *   1. `basenameOnly` يُسقط أي مجلد مسار فيرد (`..\..\x.pdf` ⇒ `x.pdf`)،
 *      فلا يبقى في الاسم إلا المقطع الأخير.
 *   2. حذف المحارف الخطرة (مسار، تحكم، Unicode غير مرئية) من الجذع.
 *   3. رفض الاسم الذي لا يبقى منه شيء صالح.
 *
 * **الاسم الأصلي لا يُعدَّل ولا يُفقد**: الدالة تُنتج نسختين، و`original`
 * هي ما يُحفظ في `original_filename` كما ورد من المصدر (§30).
 */
export function sanitizeOriginalFilename(rawFilename: string): SanitizedFilename {
  const original = rawFilename;
  const withoutPath = basenameOnly(rawFilename);
  const extension = extractExtension(withoutPath);
  const stem = extension === '' ? withoutPath : withoutPath.slice(0, -extension.length);

  let safeStem = '';
  for (const char of stem) {
    const code = char.codePointAt(0) ?? 0;
    const forbidden =
      char === '/' ||
      char === '\\' ||
      char === ':' ||
      char === '*' ||
      char === '?' ||
      char === '"' ||
      char === '<' ||
      char === '>' ||
      char === '|' ||
      char === '.' ||
      code < 0x20 ||
      code === 0x7f ||
      // محارف Unicode غير مرئية أو موجّهة تُخفي ما بعدها (Overwrite RTL).
      (code >= 0x200b && code <= 0x200f) ||
      code === 0x202e ||
      code === 0xfeff;
    if (!forbidden) {
      safeStem += char;
    }
  }
  safeStem = safeStem.trim();

  if (safeStem === '') {
    throw new InvalidFilenameError(original);
  }

  return { original, safe: `${safeStem}${extension.toLowerCase()}`, extension: extension.toLowerCase() };
}

/**
 * يتحقق أن المسار المحسوب داخل جذر التخزين (منع path traversal — §30).
 *
 * هذه الطبقة الثانية من الحماية: بعد تنظيف الاسم، قد يبقى خلل في تركيب
 * المفتاح نفسه أو في قيمة `storage_key` قادمة من القاعدة. هنا يُقاس
 * المسار الفعلي ويُقارن بالجذر، فأي محاولة خروج تُرفض مهما كان مصدرها.
 */
export function assertPathWithinRoot(rootDir: string, candidatePath: string): string {
  const resolvedRoot = resolve(rootDir);
  const resolvedCandidate = resolve(candidatePath);
  const rootWithSep = resolvedRoot.endsWith(sep) ? resolvedRoot : resolvedRoot + sep;
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(rootWithSep)) {
    throw new AttachmentValidationError(
      'المسار المطلوب خارج جذر تخزين المرفقات (محاولة path traversal مرفوضة).',
      'ATTACHMENT_PATH_TRAVERSAL',
    );
  }
  return resolvedCandidate;
}

/** يطابق النوع المعلن من العميل مع المكتشَف من المحتوى. */
function mimeMatchesDeclared(declaredType: string, detectedMime: string): boolean {
  const normalized = declaredType.split(';')[0].trim().toLowerCase();
  if (normalized === detectedMime) {
    return true;
  }
  // تساهلان مقصودان على الأسماء البديلة الشائعة لنفس الصيغة، لا على الصيغة.
  return (
    (normalized === 'image/jpg' && detectedMime === 'image/jpeg') ||
    (normalized === 'application/x-pdf' && detectedMime === 'application/pdf')
  );
}

/**
 * يتحقق من محتوى مرفق ويحدّد نوعه (MIME validation + size limits — §30).
 *
 * الترتيب مقصود: الحجم أولاً (رفض مبكر لملف ضخم قبل أي معالجة)، ثم التوقيع
 * من المحتوى، ثم مطابقة المطالب **إن وُجدت**. الاختلاف رفض لا تفضيل.
 *
 * @param content بايتات الملف كما وصلت.
 * @param declaredType نوع MIME معلن (`Content-Type`)، أو `null` إن لم يُرسل.
 * @param maxSizeBytes الحد الأقصى المسموح بالبايت.
 * @returns النوع المكتشَف من المحتوى، وهو ما يُخزَّن في `mime_type`.
 */
export function validateAttachmentContent(
  content: Buffer,
  declaredType: string | null,
  maxSizeBytes: number,
): string {
  if (content.length > maxSizeBytes) {
    throw new AttachmentTooLargeError(content.length, maxSizeBytes);
  }

  const detected = detectMimeType(content);
  if (detected.mime === null || !isAllowedMimeType(detected.mime)) {
    throw new UnsupportedMediaTypeError(declaredType, detected.mime);
  }
  if (declaredType !== null && declaredType !== '' && !mimeMatchesDeclared(declaredType, detected.mime)) {
    throw new MimeMismatchError(declaredType, detected.mime);
  }
  return detected.mime;
}
