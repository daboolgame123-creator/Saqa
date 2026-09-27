/**
 * DTOs الكتاب وروابطه — Phase 10.
 *
 * المرجع: `src/core/models/transaction` و`transactionEmployee`،
 * وعقد `repositories/contracts.ts` (Phase 9).
 */
import type { Transaction } from '../../../../src/core/models/transaction';
import type { AccessScope } from '../../../../src/core/models/accessScope';

/**
 * DTO مرفق كما يُنقل مع الكتاب (بيانات وصفية فقط — لا بايتات ولا Base64).
 *
 * `previewUrl` و`isImage` في نموذج المجال حقلان presentation فقط؛ أول
 * تخزين مركزي للمرفقات هو Phase 14 (الخطة §30)، فلا ينقلان عبر الـAPI هنا.
 * لا يفقد ذلك round-trip أي بيانات مخزَّنة فعلاً لأن معاينة المرفق تُشتق
 * من اسمه عبر `getAttachmentPreviewUrl` عند الحاجة.
 */
export interface AttachmentDto {
  id: string;
  name: string;
  type: string;
  fileSize: string;
  uploadDate: string;
}

/** DTO قراءة الكتاب: نموذج المجال + توقيتات النظام. */
export interface TransactionDto {
  id: string;
  number: string;
  sequence: string;
  /** تاريخ الكتاب (business date) — لا يُستبدل بـcreatedAt (الخطة §52). */
  date: string;
  /** شهر مشتق من date؛ لا يُقبل في المدخلات (يُشتق في الخادم). */
  month: string;
  direction: string;
  category: string;
  subType: string;
  entity: string;
  subject: string;
  addressedTo?: string;
  content?: string;
  /** مرآة توافق مشتقة من جدول الروابط — تُقرأ وتُحسب، لا تُنقل كمدخل. */
  employeeIds: string[];
  /** للعرض والتوافق التراجعي فقط؛ الرابط الفعلي عبر الروابط (Rule 7). */
  employeeName?: string;
  visibility?: AccessScope;
  targetScope?: string;
  priority?: string;
  directorDirective?: Transaction['directorDirective'];
  reminder?: Transaction['reminder'];
  status: string;
  notes?: string;
  attachments: AttachmentDto[];
  isRead?: boolean;
  readAt?: string;
  isDailySituation?: boolean;
  dailySituationData?: Transaction['dailySituationData'];
  specificDetails?: Transaction['specificDetails'];
  createdAt?: string;
  updatedAt?: string;
  importedAt?: string | null;
}

/** رابط موظف يُنشأ مع الكتاب داخل معاملة واحدة. */
export interface TransactionEmployeeLinkDto {
  employeeId: string;
  relationshipType?: string;
  notes?: string;
}

/** مرفق يُنشأ مع الكتاب (بيانات وصفية فقط — لا ملفات). */
export interface CreateAttachmentDto {
  name: string;
  type: string;
  fileSize: string;
  uploadDate: string;
  originalFilename?: string;
  mimeType?: string;
  contentHash?: string;
  storageKey?: string;
  ocrState?: string;
}

/**
 * DTO إنشاء الكتاب.
 * - month تُشتق من date في الخادم فلا تُقبل (عقد CreateTransactionInput).
 * - الروابط والمرفقات تُكتب في نفس المعاملة (لا كيانات يتيمة).
 */
export interface CreateTransactionDto {
  number: string;
  sequence: string;
  date: string;
  direction: string;
  category: string;
  subType: string;
  entity: string;
  subject: string;
  addressedTo?: string;
  content?: string;
  employeeName?: string;
  visibility?: AccessScope;
  targetScope?: string;
  priority?: string;
  directorDirective?: Transaction['directorDirective'];
  reminder?: Transaction['reminder'];
  status: string;
  notes?: string;
  isRead?: boolean;
  readAt?: string;
  isDailySituation?: boolean;
  dailySituationData?: Transaction['dailySituationData'];
  specificDetails?: Transaction['specificDetails'];
  importedAt?: string;
  employeeLinks?: TransactionEmployeeLinkDto[];
  attachments?: CreateAttachmentDto[];
}

/** تعديل جزئي للكتاب. الروابط تُدار بمسار الروابط المستقل (لها معرّفات). */
export type UpdateTransactionDto = Partial<Omit<CreateTransactionDto, 'employeeLinks' | 'attachments'>> & {
  attachments?: CreateAttachmentDto[];
};

/** فلترة قائمة الكتب القادمة من الـquery string. */
export interface TransactionListQuery {
  month?: string;
  status?: string;
  direction?: string;
  limit?: number;
  offset?: number;
}
