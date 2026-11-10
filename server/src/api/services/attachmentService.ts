/**
 * خدمة المرفقات في طبقة الـAPI (Phase 14).
 *
 * ترتيب الطبقات في كل عملية:
 *
 * ```text
 *   controller → [Access Scope على الكتاب] → خدمة → { مستودع · تخزين }
 * ```
 *
 * النقطتان اللتان تستحقان التأكيد هنا:
 *
 * 1. **النطاق يُفحص قبل أي وصول للملف** (§30 · access check). كل عملية تبدأ
 *    بـ`transactions.findById(transactionId, scope)`؛ فإن أعاد `null` فالكتاب
 *    خارج النطاق، فيُرفض بـ404 نفسه الذي تعطيه قراءة الكتاب — بلا لمسة
 *    للقرص ولا استعلام عن المرفق. لا يوجد مسار يقرأ ملفاً قبل هذا الفحص،
 *    وهذا ما يجعل التحقق على Backend فعلياً لا شكلياً.
 *
 * 2. **الملف لا يُقدَّم إلا من هنا** (§30 · لا مشاركة مباشرة للمجلد). البايتات
 *    تُقرأ من التخزين المركزي وتُعاد في الاستجابة، ولا مسار آخر يلمس القرص.
 */
import { ResourceNotFoundError } from '../errors';
import type {
  AttachmentRecord,
  AttachmentRepository,
  TransactionRepository,
  TransactionScopeFilter,
} from '../../repositories/contracts';
import {
  buildStorageKey,
  computeContentHash,
  FileStorage,
  isStoredIntegrityState,
  resolveIntegrityState,
  sanitizeOriginalFilename,
  validateAttachmentContent,
} from '../../storage';
import type { AttachmentContentDto, AttachmentMetadataDto } from '../dto';

const ARABIC_TRANSACTION = 'الكتاب';
const ARABIC_ATTACHMENT = 'المرفق';

/** مدخلات الرفع كما وصلت من الـcontroller (بعد التحقق من الـHTTP). */
export interface UploadAttachmentInput {
  /** الكتاب المالك. */
  transactionId: string;
  /** الاسم الأصلي كما أرسله العميل (يُحفظ كما هو). */
  originalFilename: string;
  /** نوع MIME المعلن في ترويسة الطلب (مطالبة تُقارَن بالمحتوى). */
  declaredMimeType: string | null;
  /** البايتات كما وصلت. */
  content: Buffer;
  /** نوع المرفق من كتالوج الخطة. */
  type: string;
  /** تاريخ الإنشاء `YYYY-MM-DD` (يؤخذه الخادم، لا العميل). */
  createdDate: string;
  /** الحد الأقصى للحجم المسموح بالبايت. */
  maxSizeBytes: number;
  /** الحجم كنص عرض المتوافق (يولّده الخادم من البايتات). */
  fileSize: string;
}

/** خدمة المرفقات: الرفع، القراءة، التحميل، وفحص السلامة. */
export class AttachmentApiService {
  constructor(
    private readonly attachments: AttachmentRepository,
    private readonly transactions: TransactionRepository,
    private readonly storage: FileStorage,
  ) {}

  /**
   * مرفقات كتاب، بعد فحص النطاق.
   *
   * الكتاب خارج النطاق ⇒ نفس 404 الذي تعطيه قراءة الكتاب، فلا يميّز الخادم
   * بين «غير موجود» و«غير مرئي» ولا يكشف وجود مرفقاته.
   */
  async list(
    transactionId: string,
    scope?: TransactionScopeFilter,
  ): Promise<AttachmentMetadataDto[]> {
    await this.requireVisibleTransaction(transactionId, scope);
    const records = await this.attachments.listByTransaction(transactionId);
    return records.map(toAttachmentMetadataDto);
  }

  /**
   * رفع مرفق واحد لكتاب.
   *
   * الترتيب مقصود ومحمي: النطاق ← فحص المحتوى والاسم ← حساب البصمة ←
   * **إنشاء السجل** (فتولّد القاعدة الـstable ID) ← حفظ البايتات تحت مفتاح
   * مشتقّ من ذلك المعرّف ← تحديث السلامة بعد قراءة فعلية.
   *
   * لماذا السجل قبل الملف: `storage_key` مشتقّ من الـstable ID، فلا يمكن
   * حفظ الملف قبل وجود المعرّف. وإن فشل الحفظ على القرص بعد الإنشاء، يبقى
   * السجل بلا بايتات و`integrity_state = 'missing'` — وهو وصف صادق للحقيقة،
   * لا ادّعاء بوجود ملف.
   */
  async upload(
    input: UploadAttachmentInput,
    scope?: TransactionScopeFilter,
  ): Promise<AttachmentMetadataDto> {
    await this.requireVisibleTransaction(input.transactionId, scope);

    // 1) فحص المحتوى: حجم، ثم توقيع من البايتات، ثم مطابقة المعلن.
    const mimeType = validateAttachmentContent(
      input.content,
      input.declaredMimeType,
      input.maxSizeBytes,
    );

    // 2) الاسم: يُحفظ الأصلي كما ورد. النسخة الآمنة لا تلمس القرص أصلاً
    //    (المفتاح مشتقّ من المعرّف)، ومع ذلك تُفحص قابلية الاسم حتى لا
    //    يُقبل اسم لا يمكن حفظه أصلاً.
    const filename = sanitizeOriginalFilename(input.originalFilename);
    const contentHash = computeContentHash(input.content);

    // 3) السجل أولاً: الـstable ID تولّده القاعدة، لا اسم الملف ولا البصمة.
    const record = await this.attachments.create({
      transactionId: input.transactionId,
      name: filename.original,
      type: input.type,
      fileSize: input.fileSize,
      uploadDate: input.createdDate,
      originalFilename: filename.original,
      mimeType,
      sizeBytes: input.content.length,
      createdDate: input.createdDate,
      contentHash,
      // `null` في الكتابة الأولى: المفتاح مشتقّ من معرّف لم يُولَّد بعد،
      // والفهرس الفريد يسمح بعدة NULL (بخلاف تكرار السلسلة الفارغة).
      storageKey: null,
      integrityState: 'missing',
    });

    const storageKey = buildStorageKey(record.id);
    await this.attachments.setStorageKey(record.id, storageKey);
    await this.storage.write(record.id, input.content);

    // 4) السلامة: نقرأ ما حُفظ فعلاً ونقارن البصمة، فالحالة مبنية على
    //    قراءة حقيقية لا على افتراض نجاح الكتابة.
    const state = await this.refreshIntegrity(record.id, storageKey, contentHash);
    const stored = await this.attachments.findById(record.id);
    if (stored === null) {
      throw new ResourceNotFoundError('attachment', record.id, ARABIC_ATTACHMENT);
    }
    return toAttachmentMetadataDto({ ...stored, storageKey, integrityState: state });
  }

  /**
   * تحميل بايتات مرفق، بعد فحص النطاق على كتابه.
   *
   * النطاق يُفحص بـ`transactionId` من المسار لا بمعرّف المرفق وحده، لأن
   * رؤية المرفق **هي** رؤية كتابه (§29) — فمن لا يرى الكتاب لا يرى مرفقه.
   */
  async download(
    transactionId: string,
    attachmentId: string,
    scope?: TransactionScopeFilter,
  ): Promise<AttachmentContentDto> {
    await this.requireVisibleTransaction(transactionId, scope);
    const record = await this.requireVisibleAttachment(transactionId, attachmentId);

    if (record.storageKey === null || record.storageKey === '') {
      // سجل بلا بايتات مخزَّنة (مرفق بيانات وصفية من قبل Phase 14).
      throw new ResourceNotFoundError('attachmentContent', attachmentId, ARABIC_ATTACHMENT);
    }

    const content = await this.storage.read(record.storageKey);
    return {
      mimeType: record.mimeType ?? 'application/octet-stream',
      originalFilename: record.originalFilename,
      content,
    };
  }

  /**
   * يقرأ الملف المخزَّن ويحدّث `integrity_state` تبعاً لما قُرئ فعلاً.
   *
   * الفرق عن `download`: هنا **غياب الملف ليس خطأ** بل حالة سلامة
   * (`missing`). فحص السلامة يجيب «ما حالة هذا الملف؟» لا «أعطني الملف أو
   * أخطئ» — والفرق بين التلف والغياب مقصود في §30.
   */
  async verifyIntegrity(
    transactionId: string,
    attachmentId: string,
    scope?: TransactionScopeFilter,
  ): Promise<AttachmentMetadataDto> {
    await this.requireVisibleTransaction(transactionId, scope);
    const record = await this.requireVisibleAttachment(transactionId, attachmentId);

    if (record.storageKey === null || record.storageKey === '') {
      return toAttachmentMetadataDto(record);
    }

    const content = await this.storage.readIfPresent(record.storageKey);
    const state = resolveIntegrityState(record.contentHash, content);
    if (isStoredIntegrityState(state)) {
      await this.attachments.updateIntegrityState(record.id, state);
    }
    return toAttachmentMetadataDto({ ...record, integrityState: state });
  }

  /**
   * يتحقق أن الكتاب مرئي للفاعل، وإلا يرمي نفس 404 الذي تعطيه قراءته.
   *
   * هذه هي بوابة Phase 14 الوحيدة على القرص: كل الدوال العامة في هذه
   * الخدمة تمرّ بها قبل أي قراءة بايتات.
   */
  private async requireVisibleTransaction(
    transactionId: string,
    scope?: TransactionScopeFilter,
  ): Promise<void> {
    const found = await this.transactions.findById(transactionId, scope);
    if (found === null) {
      throw new ResourceNotFoundError('transaction', transactionId, ARABIC_TRANSACTION);
    }
  }

  /**
   * يتحقق أن المرفق موجود **ويتبع هذا الكتاب**.
   *
   * الربط بـ`transaction_id` مقصود: طلب بمعرّف مرفق صحيح مع `transactionId`
   * مختلف يجب أن يُرفض، وإلا صار تجاوزاً لعقد «الوصول عبر كتابه».
   */
  private async requireVisibleAttachment(
    transactionId: string,
    attachmentId: string,
  ): Promise<AttachmentRecord> {
    const record = await this.attachments.findById(attachmentId);
    if (record === null || record.transactionId !== transactionId) {
      throw new ResourceNotFoundError('attachment', attachmentId, ARABIC_ATTACHMENT);
    }
    return record;
  }

  /** يقرأ الملف المخزَّن ويعيد حالة السلامة كما حُلَّت. */
  private async refreshIntegrity(
    attachmentId: string,
    storageKey: string,
    expectedHash: string,
  ): Promise<string | null> {
    const content = await this.storage.readIfPresent(storageKey);
    const state = resolveIntegrityState(expectedHash, content);
    if (isStoredIntegrityState(state)) {
      await this.attachments.updateIntegrityState(attachmentId, state);
      return state;
    }
    return null;
  }
}

/** سجل المستودع ← DTO بيانات وصفية (بلا بايتات وبلا `storageKey`). */
function toAttachmentMetadataDto(record: AttachmentRecord): AttachmentMetadataDto {
  return {
    id: record.id,
    transactionId: record.transactionId,
    name: record.name,
    type: record.type,
    fileSize: record.fileSize,
    uploadDate: record.uploadDate,
    originalFilename: record.originalFilename,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    createdDate: record.createdDate,
    contentHash: record.contentHash,
    ocrState: record.ocrState,
    integrityState: record.integrityState,
  };
}
