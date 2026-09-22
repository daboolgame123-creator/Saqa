/**
 * TransactionService — قواعد Transaction Domain الأساسية (PHASE 4).
 *
 * مستقل عن React وlocalStorage وطبقات Authentication/Authorization.
 * لا يعالج علاقات Transaction↔Employee أو Access Scope؛ تبقى تلك مسؤوليات
 * مراحلها وخدمات النموذج الأولي الحالية.
 */
import type {
  Attachment,
  AttachmentType,
  Transaction,
  TransactionDirection,
  TransactionStatus,
} from '../core/models';
import {
  ATTACHMENT_TYPE_LABELS,
  TRANSACTION_CATEGORY_LABELS,
  TRANSACTION_DIRECTION_LABELS,
  TRANSACTION_PRIORITY_LABELS,
  TRANSACTION_STATUS_LABELS,
} from '../core/models';

export type TransactionValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

export type TransactionServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isCatalogMember = (catalog: Record<string, string>, value: unknown): boolean =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(catalog, value);

const isValidDate = (value: unknown): value is string => {
  if (!isNonEmptyString(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const normalizeOptionalText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

export class TransactionService {
  /**
   * تطبيع محدود لبيانات Transaction نفسها:
   * - توحيد حالات prototype القديمة إلى BR-03.
   * - اشتقاق month من date لتجنب تعارض الحقل المكرر.
   * - تنظيف النصوص الاختيارية فقط.
   *
   * لا يطبع الموظفين أو visibility، لأنهما خارج Transaction Domain لهذه المرحلة.
   */
  static normalize(transaction: Transaction): Transaction {
    const status = transaction.status as string;
    const normalizedStatus: TransactionStatus =
      status === 'جديد' || status === 'قيد الإنجاز' ? 'قيد المراجعة' : transaction.status;
    const normalizedDate = typeof transaction.date === 'string' ? transaction.date.trim() : transaction.date;

    return {
      ...transaction,
      number: typeof transaction.number === 'string' ? transaction.number.trim() : transaction.number,
      sequence: typeof transaction.sequence === 'string' ? transaction.sequence.trim() : transaction.sequence,
      date: normalizedDate,
      month: isValidDate(normalizedDate)
        ? normalizedDate.slice(0, 7)
        : typeof transaction.month === 'string'
        ? transaction.month.trim()
        : transaction.month,
      subType: typeof transaction.subType === 'string' ? transaction.subType.trim() : transaction.subType,
      entity: typeof transaction.entity === 'string' ? transaction.entity.trim() : transaction.entity,
      subject: typeof transaction.subject === 'string' ? transaction.subject.trim() : transaction.subject,
      addressedTo: normalizeOptionalText(transaction.addressedTo),
      content: normalizeOptionalText(transaction.content),
      notes: normalizeOptionalText(transaction.notes),
      status: normalizedStatus,
    };
  }

  static validate(transaction: Partial<Transaction>): TransactionValidationResult {
    const errors: string[] = [];

    const requiredTextFields: Array<[keyof Transaction, string]> = [
      ['id', 'معرف المعاملة (id) مطلوب.'],
      ['number', 'العدد الرسمي مطلوب.'],
      ['sequence', 'التسلسل الداخلي مطلوب.'],
      ['subType', 'النوع الفرعي للمعاملة مطلوب.'],
      ['entity', 'جهة الكتاب مطلوبة.'],
      ['subject', 'عنوان/موضوع الكتاب مطلوب.'],
    ];

    for (const [field, message] of requiredTextFields) {
      if (!isNonEmptyString(transaction[field])) errors.push(message);
    }

    if (!isValidDate(transaction.date)) {
      errors.push('تاريخ الكتاب مطلوب بصيغة YYYY-MM-DD.');
    } else if (transaction.month !== transaction.date.slice(0, 7)) {
      errors.push('شهر المعاملة يجب أن يطابق تاريخ الكتاب (YYYY-MM).');
    }

    if (!isCatalogMember(TRANSACTION_DIRECTION_LABELS, transaction.direction)) {
      errors.push('اتجاه المعاملة غير صالح.');
    }
    if (!isCatalogMember(TRANSACTION_CATEGORY_LABELS, transaction.category)) {
      errors.push('تصنيف المعاملة غير صالح.');
    }
    if (!isCatalogMember(TRANSACTION_STATUS_LABELS, transaction.status)) {
      errors.push('حالة المعاملة غير صالحة.');
    }
    if (
      transaction.priority !== undefined &&
      !isCatalogMember(TRANSACTION_PRIORITY_LABELS, transaction.priority)
    ) {
      errors.push('أولوية المعاملة غير صالحة.');
    }
    if (!Array.isArray(transaction.attachments)) {
      errors.push('المرفقات يجب أن تكون قائمة، ويمكن أن تكون فارغة.');
    } else {
      transaction.attachments.forEach((attachment, index) => {
        const prefix = `المرفق رقم ${index + 1}`;
        if (!this.isValidAttachment(attachment)) {
          errors.push(`${prefix} لا يحتوي على البيانات الوصفية المعتمدة.`);
        }
      });
    }

    if (transaction.addressedTo !== undefined && !isNonEmptyString(transaction.addressedTo)) {
      errors.push('حقل «معنون إلى» يجب أن يكون نصاً غير فارغ عند تمريره.');
    }
    if (transaction.content !== undefined && !isNonEmptyString(transaction.content)) {
      errors.push('مضمون الكتاب يجب أن يكون نصاً غير فارغ عند تمريره.');
    }
    if (transaction.notes !== undefined && typeof transaction.notes !== 'string') {
      errors.push('الملاحظات يجب أن تكون نصاً عند تمريرها.');
    }

    if (transaction.reminder !== undefined) {
      const { enabled, remindAt, note } = transaction.reminder;
      if (typeof enabled !== 'boolean' || !isNonEmptyString(remindAt) || !isNonEmptyString(note)) {
        errors.push('بيانات التذكير يجب أن تحتوي على enabled وremindAt وnote صالحة.');
      }
    }

    if (transaction.directorDirective !== undefined) {
      const { text, date, actionRequired } = transaction.directorDirective;
      if (!isNonEmptyString(text) || !isNonEmptyString(date)) {
        errors.push('تعليق/توجيه المدير يجب أن يحتوي على النص والتاريخ.');
      }
      if (actionRequired !== undefined && typeof actionRequired !== 'boolean') {
        errors.push('حقل actionRequired في تعليق المدير يجب أن يكون قيمة منطقية.');
      }
    }

    return errors.length === 0 ? { ok: true } : { ok: false, errors };
  }

  /** يطبع السجل ثم يرفضه صراحة إذا لم يحقق قواعد Transaction Domain. */
  static prepare(transaction: Transaction): TransactionServiceResult<Transaction> {
    const normalized = this.normalize(transaction);
    const validation = this.validate(normalized);
    return validation.ok === false
      ? { ok: false, errors: validation.errors }
      : { ok: true, value: normalized };
  }

  private static isValidAttachment(attachment: Attachment): boolean {
    return (
      Boolean(attachment) &&
      isNonEmptyString(attachment.id) &&
      isNonEmptyString(attachment.name) &&
      isCatalogMember(ATTACHMENT_TYPE_LABELS, attachment.type as AttachmentType) &&
      isNonEmptyString(attachment.fileSize) &&
      isValidDate(attachment.uploadDate)
    );
  }
}