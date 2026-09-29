/**
 * DTO المرفق في طبقة الـAPI (Phase 14).
 *
 * يقرأ، فلا ينقل بايتات ولا مساراً مطلقاً: `storageKey` **لا يُنقل إطلاقاً**
 * للعميل. من دونه لا يستطيع أحد بناء مسار على القرص، والوصول يمرّ عبر
 * `GET /api/transactions/:id/attachments/:attachmentId/content` بعد فحص
 * الصلاحية — وهذا هو «الملف يُقدَّم عبر Backend بعد authorization» في §30.
 */
import type { AttachmentType } from '../../../../src/core/models/transaction';

/** مرفق كما يعيده الـAPI: بيانات وصفية كاملة بلا بايتات. */
export interface AttachmentMetadataDto {
  /** stable ID — معرّف السقاية (§30). */
  id: string;
  /** الكتاب المالك. */
  transactionId: string;
  /** الاسم المعروض. */
  name: string;
  /** نوع المرفق. */
  type: string;
  /** الحجم كنص عرض (للتوافق). */
  fileSize: string;
  /** تاريخ الرفع كنص عرض (للتوافق). */
  uploadDate: string;
  /** اسم الملف الأصلي من المصدر، محفوظاً كما ورد. */
  originalFilename: string;
  /** نوع MIME المكتشف من المحتوى. */
  mimeType: string | null;
  /** الحجم الحقيقي بالبايت. */
  sizeBytes: number | null;
  /** تاريخ الإنشاء `YYYY-MM-DD`. */
  createdDate: string | null;
  /** بصمة المحتوى. */
  contentHash: string | null;
  /** حالة OCR — `null` قبل Phase 17. */
  ocrState: string | null;
  /** حالة السلامة: `verified` · `corrupted` · `missing` · `null`. */
  integrityState: string | null;
}

/** نتيجة تحميل الملف: البايتات + نوع المحتوى للترويسة. */
export interface AttachmentContentDto {
  /** نوع MIME للمحتوى (يُرسل كـ`Content-Type`). */
  mimeType: string;
  /** اسم الملف الأصلي (يُرسل كـ`Content-Disposition` اسم الملف). */
  originalFilename: string;
  /** البايتات نفسها. */
  content: Buffer;
}

/** نوع المرفق المسموح به في الرفع (من كتالوج الخطة، لا قيمة حرة). */
export type UploadAttachmentType = AttachmentType;
