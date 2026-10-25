/**
 * مستودع المرفقات (Phase 14).
 *
 * مسؤوليته **الـmetadata فقط**: البايتات على القرص وتُدار في `storage/`.
 * هذا الفصل هو تطبيق القاعدة 5 من الخطة («Attachment files خارج PostgreSQL،
 * والـmetadata داخله») على مستوى الكود: لا استيراد من `node:fs` هنا إطلاقاً.
 *
 * النطاق: قراءة مرفق بمعرّفه، قراءة مرفقات كتاب (علاقة واحد-إلى-متعدد)،
 * إنشاء مرفق مع الـstable ID الذي تولّده القاعدة، وتحديث حالة السلامة.
 * **لا حذف**: Phase 16.
 */
import type {
  AttachmentRecord,
  AttachmentRepository,
  CreateStoredAttachmentInput,
} from './contracts';
import type { Db } from './shared';

/** أعمدة المرفق كما تُقرأ (الأسماء المستعارة مطابقة لواجهة السجل). */
const COLUMNS = `
  id,
  transaction_id AS "transactionId",
  name,
  type,
  file_size AS "fileSize",
  upload_date AS "uploadDate",
  original_filename AS "originalFilename",
  mime_type AS "mimeType",
  size_bytes AS "sizeBytes",
  created_date::text AS "createdDate",
  content_hash AS "contentHash",
  storage_key AS "storageKey",
  ocr_state AS "ocrState",
  integrity_state AS "integrityState",
  created_at::text AS "createdAt"
`;

/** صف المرفق كما تعيده PostgreSQL قبل التحويل إلى سجل العقد. */
interface AttachmentRow {
  id: string;
  transactionId: string;
  name: string;
  type: string;
  fileSize: string;
  uploadDate: string;
  originalFilename: string;
  mimeType: string | null;
  /** `bigint` يعيده `pg` نصاً (لتجاوز حدود `Number`) ⇒ يُحوَّل هنا. */
  sizeBytes: string | number | null;
  createdDate: string | null;
  contentHash: string | null;
  storageKey: string | null;
  ocrState: string | null;
  integrityState: string | null;
  createdAt: string;
}

/**
 * يحوّل `bigint` القادم من `pg` إلى `number`، و`null` يبقى `null`.
 *
 * `pg` يعيد `int8` نصاً عمداً لأنها قد تتجاوز `Number.MAX_SAFE_INTEGER`.
 * التحويل آمن هنا: حجم ملف لا يقارب الحد المسموح (25 MiB افتراضياً).
 * والأهم: `null` لا يصير `0` — الصفر ملف فارغ، و`null` «لم يُقَس بعد».
 */
function toSizeBytes(value: string | number | null): number | null {
  if (value === null) {
    return null;
  }
  return typeof value === 'number' ? value : Number(value);
}

/** صف قاعدة ← سجل العقد (بلا تحويل ضمني يتسرّب إلى الطبقات الأعلى). */
function toRecord(row: AttachmentRow): AttachmentRecord {
  return { ...row, sizeBytes: toSizeBytes(row.sizeBytes) };
}

/** مستودع المرفقات على PostgreSQL (Phase 14). */
export class PgAttachmentRepository implements AttachmentRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<AttachmentRecord | null> {
    const result = await this.db.query<AttachmentRow>(
      `SELECT ${COLUMNS} FROM attachments WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row === undefined ? null : toRecord(row);
  }

  /**
   * مرفقات كتاب واحد.
   *
   * الترتيب بـ`created_at, id` فقط لأجل ثبات القراءة (نفس الكتاب يعطي
   * نفس الترتيب دائماً) — **وليس** افتراضاً أن ترتيب المرفقات معناه شيء
   * (§30: «ترتيب المرفقات لا يُفترض»). ترتيب أسماء ملفات الجود أو ترتيبها
   * داخل المجلد لا يدخل هنا.
   */
  async listByTransaction(transactionId: string): Promise<AttachmentRecord[]> {
    const result = await this.db.query<AttachmentRow>(
      `SELECT ${COLUMNS} FROM attachments WHERE transaction_id = $1 ORDER BY created_at, id`,
      [transactionId],
    );
    return result.rows.map(toRecord);
  }

  /**
   * ينشئ مرفقاً ويعيد السجل بمعرّفه.
   *
   * الـstable ID تولّده القاعدة (`gen_random_uuid()`) ولا يشتقه الخادم من
   * اسم الملف ولا من البصمة (§30: «لا تستخدم اسم الملف كمعرّف»). ثم يُبنى
   * `storage_key` في طبقة التخزين من هذا المعرّف.
   */
  async create(input: CreateStoredAttachmentInput): Promise<AttachmentRecord> {
    const result = await this.db.query<AttachmentRow>(
      `INSERT INTO attachments (
         transaction_id, name, type, original_filename, mime_type,
         file_size, upload_date, size_bytes, created_date,
         content_hash, storage_key, ocr_state, integrity_state
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING ${COLUMNS}`,
      [
        input.transactionId,
        input.name,
        input.type,
        input.originalFilename,
        input.mimeType,
        input.fileSize,
        input.uploadDate,
        input.sizeBytes,
        input.createdDate,
        input.contentHash,
        input.storageKey,
        null, // ocr_state: Phase 17 — لا قيم قبلها.
        input.integrityState,
      ],
    );
    const created = result.rows[0];
    if (created === undefined) {
      // لا يحدث مع INSERT ... RETURNING، لكن وجوده يمنع `undefined` من
      // التسرب إلى طبقة الخدمة كسجل مرفق.
      throw new Error('لم يُرجع INSERT أي صف لمرفق جديد.');
    }
    return toRecord(created);
  }

  /**
   * يكتب مفتاح التخزين الحقيقي بعد معرفة الـstable ID.
   *
   * منفصلة عن `create` لأن المعرّف يولَّد في القاعدة ولا يُعرف قبل INSERT.
   */
  async setStorageKey(id: string, storageKey: string): Promise<void> {
    await this.db.query(`UPDATE attachments SET storage_key = $2 WHERE id = $1`, [id, storageKey]);
  }

  async updateIntegrityState(id: string, state: string | null): Promise<void> {
    await this.db.query(`UPDATE attachments SET integrity_state = $2 WHERE id = $1`, [id, state]);
  }
}
