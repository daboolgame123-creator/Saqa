/**
 * التخزين المركزي للمرفقات — الوصول للقرص (Phase 14 — §30 «التخزين»).
 *
 * الفصل الذي تفرضه الخطة: **البايتات على القرص، والـmetadata في PostgreSQL**.
 * هذا الملف يعرف الكتابة والقراءة والحذف والمسار، ولا يعرف القاعدة إطلاقاً
 * (المستودع في `repositories/attachmentRepository.ts`).
 *
 * ثلاث قواعد غير قابلة للتفاوض هنا:
 *   1. **لا مشاركة مباشرة للمجلد** (§30): لا يوجد أي مسار Express يخدم
 *      ملفات القرص. الوصول يمرّ عبر Backend بعد authorization فقط، ولذلك
 *      لا `express.static` على جذر التخزين في أي مكان.
 *   2. **مفتاح التخزين مشتقّ من الـstable ID** لا من اسم الملف (§30). شكله
 *      `blobs/<أول مقطعين>/<باقي المعرّف>`. التقسيم ليس تزييناً: يمنع أن
 *      يصير مجلد واحد بمليون ملف على Windows.
 *   3. **مجلد الجود (أو أي مجلد خارجي) ليس مصدراً إنتاجياً** (§30): يُقرأ
 *      مساره لمرة واحدة عند الاستيراد التاريخي في
 *      `historicalArchiveImport.ts`، ويعود الملف إلى التخزين المركزي.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { config } from '../config';
import { assertPathWithinRoot } from './fileValidation';
import {
  AttachmentFileMissingError,
  AttachmentStorageNotConfiguredError,
  AttachmentUnreadableError,
  AttachmentValidationError,
} from './storageErrors';

/** المجلد داخل الجذر الذي تحفظ فيه البايتات. */
const BLOBS_SUBDIR = 'blobs';
/** إعدادات التخزين المستخدمة في الاختبارات (بلا لمسار بيئة العملية). */
export interface FileStorageOptions {
  /** الجذر المهيّأ. سلسلة فارغة تعني «غير مهيّأ». */
  rootDir: string;
}

/**
 * يبني مفتاح التخزين من الـstable ID (§30 · storage key/path).
 *
 * **الاسم الأصلي لا يدخل في المفتاح إطلاقاً** (§30: «دون استخدام الاسم
 * الأصلي كمعرّف داخلي أساسي»). المدخل الوحيد هو معرّف السقاية. فغيير الاسم
 * المعروض أو إعادة رفع نسخة باسم آخر لا يمسّ هوية الملف ولا مفتاحه، ولا
 * يستطيع اسم ملف أن يفرّق بين مرفقين أو يطمسهما.
 *
 * @param stableId معرّف المرفق في `attachments.id`.
 * @returns مفتاح نسبي داخل `blobs/`، مثل `blobs/ab/cd-ef...`.
 * @throws AttachmentValidationError إذا لم يكن المعرّف شكلاً آمناً.
 */
export function buildStorageKey(stableId: string): string {
  // نقبل الحروف والأرقام والشرطة فقط: معرّف uuid أو معرّف اختبار مُولَّد.
  // أي محرف آخر (محرف مسار، `..`) يُرفض قبل أن يلمس المسار أصلاً.
  if (!/^[A-Za-z0-9-]{8,128}$/.test(stableId)) {
    throw new AttachmentValidationError(
      'معرّف المرفق غير صالح لبناء مفتاح تخزين.',
      'ATTACHMENT_INVALID_STABLE_ID',
    );
  }
  // المسار نسبي دائماً: `blobs/aa/bb/<id>`. البناء عبر join لا عبر
  // قوالب نصية، فالمفتاح ناتج بيانات لا نص برنامج.
  return [BLOBS_SUBDIR, stableId.slice(0, 2), stableId.slice(2, 4), stableId].join('/');
}


/**
 * طبقة الوصول إلى القرص.
 *
 * كل دالة عامة تأخذ الجذر عبر `options` لا تقرؤه من إعدادات العملية، فيمكن
 * للاختبار العمل في مجلد مؤقت معزول بلا متغيرات بيئة وبلا لمسار إنتاجي.
 */
export class FileStorage {
  constructor(private readonly options: FileStorageOptions) {}

  /** الجذر المهيّأ، أو خطأ إن كان التخزين غير مهيّأ. */
  private rootDir(): string {
    const root = this.options.rootDir;
    if (root === '') {
      throw new AttachmentStorageNotConfiguredError();
    }
    return root;
  }

  /**
   * المسار المطلق لمفتاح تخزين، **بعد** التحقق أنه داخل الجذر.
   *
   * `assertPathWithinRoot` هو ما يمنع path traversal هنا: حتى لو مرّ مفتاح
   * بمحتوى `../` من أي مصدر، يُرفض قبل أي عملية قرص.
   */
  absolutePathFor(storageKey: string): string {
    const root = this.rootDir();
    return assertPathWithinRoot(root, join(root, storageKey));
  }

  /**
   * يحفظ البايتات تحت مفتاح مشتقّ من الـstable ID وينشئ مجلداته.
   *
   * الكتابة ذرّية: تُكتب إلى ملف مؤقت داخل نفس المجلد ثم يُعاد تسميته،
   * فلا تبقى قراءة ناقصة لو انقطع الخادم أثناء الحفظ.
   *
   * @returns المسار المطلق الذي حُفظ فيه الملف.
   */
  async write(stableId: string, content: Buffer): Promise<string> {
    const target = this.absolutePathFor(buildStorageKey(stableId));
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.partial`;
    await writeFile(temporary, content, { flag: 'w' });
    await rename(temporary, target);
    return target;
  }

  /** هل الملف موجود على القرص؟ */
  exists(storageKey: string): boolean {
    return existsSync(this.absolutePathFor(storageKey));
  }

  /**
   * يقرأ بايتات ملف من التخزين المركزي.
   *
   * @throws AttachmentFileMissingError إن لم يكن الملف موجوداً.
   * @throws AttachmentUnreadableError إن تعذّرت قراءته (تلف أو صلاحيات).
   */
  async read(storageKey: string): Promise<Buffer> {
    const target = this.absolutePathFor(storageKey);
    try {
      return await readFile(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new AttachmentFileMissingError(storageKey);
      }
      throw new AttachmentUnreadableError();
    }
  }

  /**
   * يقرأ الملف إن وُجد ويعيد `null` إن لم يوجد.
   *
   * هذه هي الدالة التي تستخدمها **فحوص السلامة** لا التحميل: غياب الملف
   * حالة سلامة `missing` لا خطأ طلب، فالتفريق بين «الملف تلف» و«لا يوجد»
   * مقصود في §30.
   */
  async readIfPresent(storageKey: string): Promise<Buffer | null> {
    const target = this.absolutePathFor(storageKey);
    try {
      return await readFile(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw new AttachmentUnreadableError();
    }
  }

  /**
   * يحذف ملفاً من التخزين المركزي.
   *
   * **غير مستخدم في مسار HTTP في هذه المرحلة**: الحذف الإداري للكتاب
   * والمرفق منصوص عليه في Phase 16 (Soft Delete)، فلا يُنفَّذ حذف أفقي الآن.
   */
  async remove(storageKey: string): Promise<void> {
    await rm(this.absolutePathFor(storageKey), { force: true });
  }
}

/** التخزين المشترك على إعدادات العملية (يبنيه أول استدعاء). */
let sharedFileStorage: FileStorage | null = null;

/** يعيد طبقة التخزين المشتركة المبنية على إعدادات البيئة. */
export function getFileStorage(): FileStorage {
  if (sharedFileStorage === null) {
    sharedFileStorage = new FileStorage({ rootDir: config.attachmentStorageDir });
  }
  return sharedFileStorage;
}
