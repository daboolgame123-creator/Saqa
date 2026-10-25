/**
 * مطابقة أرشيف الجود التاريخي بالمرفقات (Phase 14 — §30 «دعم استيراد الأرشيف
 * التاريخي» و«الملفات غير المرتبطة» و«سلامة المرفق أثناء الاستيراد»).
 *
 * البنية التي يجب دعمها كما هي (§30):
 *
 * ```text
 * [Export Folder]
 * ├── Excel file
 * └── attachfile/
 *     ├── file...
 *     └── ...
 * ```
 *
 * **قاعدة الربط الوحيدة المقبولة: المطابقة الفعلية للاسم/المرجع.** صف Excel
 * يشير إلى مرجع، والمرجع يطابق اسم ملف داخل `attachfile`، فيُربط ذلك الملف
 * بالكتاب. ولا شيء غير ذلك:
 *   - **لا** رقم الصف.
 *   - **لا** ترتيب الملفات داخل المجلد.
 *   - **لا** تشابه الاسم ولا «أقرب مرشّح» ولا بادئة مشتركة.
 *
 * ولذلك فإن ثلاث حالات تُبلّغ صراحةً بدل ابتلاعها (§30):
 *   1. مرجع في Excel بلا ملف مقابل ⇒ **مرفق مرجعي مفقود** (missing).
 *   2. ملف في `attachfile` بلا مرجع في Excel ⇒ **غير مرتبط** (unreferenced):
 *      لا يُربط تلقائياً، **ولا يُحذف**، **ولا يُهمل بصمت**، بل يظهر في التقرير.
 *   3. ملف موجود لكنه تالف أو غير قابل للقراءة ⇒ **تالف** (unreadable/corrupt).
 *
 * ما لا يفعله هذا الملف: لا يقرأ Excel (تركيبه يحدّده Phase 30/31)، ولا
 * يكتب في القاعدة، ولا ينفّذ عملية استيراد فعلية. هو **طبقة مطابقة وتقرير
 * فقط**، وتُستهلك من تنفيذ الاستيراد في مرحلة لاحقة. تنفيذه التشغيلي
 * (Phase 31) خارج نطاق هذه المرحلة ولا يُحاكى هنا.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { computeContentHash, resolveIntegrityState } from './integrity';
import { detectMimeType, sanitizeOriginalFilename } from './fileValidation';

/**
 * يبني جرداً لملفات `attachfile` مع فحص كل ملف (الوجود، القراءة، MIME، الحجم،
 * hash) كما تشترط §30 «سلامة المرفق أثناء الاستيراد».
 *
 * ملاحظة على التسلسل: **الجرد يسبق الربط**، ويستهلك المطابقةَ جرداً. فملف
 * لا مرج له لا يُفحص مرتين، والقرار يُبنى على بيانات مقيسة لا على أسماء.
 *
 * @param attachFileDir مسار مجلد `attachfile` من حزمة التصدير.
 * @returns قائمة ملفات مفحوصة (بترتيب الاسم، لا بترتيب قرص غير مضمون).
 */
export async function inspectArchiveFolder(attachFileDir: string): Promise<InspectedArchiveFile[]> {
  let entries: string[];
  try {
    entries = await readdir(attachFileDir);
  } catch {
    // مجلد المرفقات غير موجود: لا ملفات ⇒ لا مراجع مطابقة. يُبلَّغ ذلك
    // للمُستدعي عبر تقرير فارغ، لا بصمت.
    return [];
  }

  const inspected: InspectedArchiveFile[] = [];
  // الترتيب المعجمي للاسم: لأجل **قابلية إعادة الإنتاج** للتقرير فقط،
  // لا للربط — الربط بالاسم المطابق لا بالموضع (§30).
  for (const filename of [...entries].sort()) {
    const absolutePath = join(attachFileDir, filename);
    const fileStat = await stat(absolutePath).catch(() => null);
    if (fileStat === null || !fileStat.isFile()) {
      continue;
    }

    const sanitized = sanitizeOriginalFilename(filename);
    const inspectedFile: InspectedArchiveFile = {
      filename,
      absolutePath,
      sizeBytes: fileStat.size,
      detectedMimeType: null,
      contentHash: '',
      readable: false,
      originalFilename: sanitized.original,
      safeFilename: sanitized.safe,
    };

    try {
      const content = await readFile(absolutePath);
      inspectedFile.detectedMimeType = detectMimeType(content).mime;
      inspectedFile.contentHash = computeContentHash(content);
      inspectedFile.readable = true;
    } catch {
      // تعذّرت القراءة (صلاحيات، تلف، المجلد مشغول): يبقى `readable: false`
      // ويدخل تقرير `unreadable` — لا يُربط ولا يُحذف.
      inspectedFile.readable = false;
    }

    inspected.push(inspectedFile);
  }
  return inspected;
}

/**
 * يربط المراجع بملفات `attachfile` بالمطابقة الفعلية للاسم/المرجع.
 *
 * المطابقة **حرفية تماماً** بعد توحيد شكل المجلد فقط: `\` ← `/`، وقص
 * محارف المسار من الطرفين. لا تُطبَّع حالة الأحرف ولا المسافات ولا التطبيع
 * العربي ولا تُقارَن الأجزاء — لأن أي تساهل هنا يعني ربطاً خاطئاً صامتاً
 * (§30: «ليس التخمين… أو تشابه الاسم»).
 *
 * @param references المراجع المقروءة من Excel.
 * @param files الجرد المفحوص من `attachfile`.
 * @returns تقريراً كاملاً: matched / missing / unreferenced / unreadable / ambiguous.
 */
export function mapArchiveReferencesToFiles(
  references: readonly ArchiveAttachmentReference[],
  files: readonly InspectedArchiveFile[],
): ArchiveImportReport {
  // الفهرس بالاسم الحرفي. نبقي كل الملفات المطابقة لنفس الاسم في قائمة
  // فتعارض الاسم (اسمان في نفس المجلد) لا يُحسم بالاختيار بل يُبلَّغ.
  const byName = new Map<string, InspectedArchiveFile[]>();
  for (const file of files) {
    const key = normalizeReference(file.filename);
    const bucket = byName.get(key);
    if (bucket === undefined) {
      byName.set(key, [file]);
    } else {
      bucket.push(file);
    }
  }

  const report: ArchiveImportReport = {
    matched: [],
    missing: [],
    unreferenced: [],
    unreadable: [],
    ambiguous: [],
  };
  const consumed = new Set<string>();

  for (const reference of references) {
    const key = normalizeReference(reference.reference);
    const candidates = byName.get(key) ?? [];

    if (candidates.length === 0) {
      // مرج موجود في Excel والملف غير موجود داخل attachfile (§30).
      report.missing.push(reference);
      continue;
    }
    if (candidates.length > 1) {
      // تعارض: لا يُختار ملف بالترتيب (§30 تمنع التخمين والترتيب).
      report.ambiguous.push(reference);
      continue;
    }

    const file = candidates[0];
    consumed.add(file.absolutePath);
    if (!file.readable) {
      // الملف موجود لكن تالف/غير قابل للقراءة: لا يُربط كمرفق صالح.
      report.unreadable.push(file);
      continue;
    }
    report.matched.push(file);
  }

  // ما تبقّى في المجلد بلا مرجع: يُبلَّغ ولا يُربط ولا يُحذف (§30).
  for (const file of files) {
    if (!consumed.has(file.absolutePath)) {
      report.unreferenced.push(file);
    }
  }

  return report;
}

/**
 * توحيد شكل المرجع للمقارنة: `\` ← `/`، ثم قص محارف المسار من الطرفين.
 *
 * هذا توحيد **شكل** لا توحيد محتوى: لا `toLowerCase` ولا طيّ مسافات ولا
 * تطبيع عربي. أي تطبيع إضافي هنا يجعل المطابقة «تقريباً» بدل «فعلية»،
 * وهو ما تمنعه §30 صراحة.
 */
function normalizeReference(value: string): string {
  return value.replace(/\\/g, '/').trim().replace(/^\.\//, '').replace(/^\/+/, '');
}

/**
 * يتحقق من سلامة ملف مرفق مبدئياً (نحو وجوده على القرص) ويقارن بصمته.
 *
 * غلاف رفيع يربط منطق `integrity.ts` بالاستيراد التاريخي، حتى لا تتكرر
 * قاعدة «البصمة لا تعني مطابقة إن لم تكن قابلة للتحقق» في مكانين.
 */
export function verifyImportedFile(expectedHash: string | null, content: Buffer | null): string {
  return resolveIntegrityState(expectedHash, content);
}

export const ARCHIVE_ATTACHMENTS_DIRNAME = 'attachfile';

/** مرجع مرفق كما يرد في Excel: اسم الملف كما هو في `attachfile`. */
export interface ArchiveAttachmentReference {
  /** اسم الملف المرجعي كما ورد في Excel (يُطابَق حرفياً). */
  reference: string;
  /** معرّف الكتاب في السقاية الذي يشير إليه الصف (إن كان معروفاً). */
  transactionId: string;
}

/** نتيجة فحص ملف مرشّح داخل `attachfile` — تأكد أن §30 يشترط. */
export interface InspectedArchiveFile {
  /** اسم الملف كما هو داخل المجلد (الاسم المرجعي). */
  filename: string;
  /** المسار المطلق على قرص المصدر (خارجي عن السقاية — للقراءة فقط). */
  absolutePath: string;
  /** الحجم بالبايت. */
  sizeBytes: number;
  /** النوع المكتشَف من **محتوى** الملف، أو `null` إن لم يُعرف. */
  detectedMimeType: string | null;
  /** البصمة المحسوبة من المحتوى. */
  contentHash: string;
  /** قُرئ الملف بنجاح؟ `false` يعني تالفاً أو غير قابل للقراءة. */
  readable: boolean;
  /** الاسم الأصلي محفوظاً كما ورد (لا يُستخدم كمعرّف). */
  originalFilename: string;
  /** النسخة الآمنة للقرص داخل التخزين المركزي. */
  safeFilename: string;
}

/** تقرير المطابقة الكامل لعملية استيراد واحدة (§30 · import report). */
export interface ArchiveImportReport {
  /** المرفقات المرتبطة بنجاح: كل مرجع وجد ملفه. */
  matched: InspectedArchiveFile[];
  /** مراجع في Excel بلا ملف مقابل داخل `attachfile`. */
  missing: ArchiveAttachmentReference[];
  /** ملفات داخل `attachfile` بلا مرجع في Excel — لا تُربط ولا تُحذف. */
  unreferenced: InspectedArchiveFile[];
  /** ملفات موجودة لكنها تعذّرت قراءتها أو محتواها تالف. */
  unreadable: InspectedArchiveFile[];
  /** أسماء المراجع التي تطابق أكثر من ملف (تعارض) — تُبلّغ ولا يُختار منها. */
  ambiguous: ArchiveAttachmentReference[];
}
