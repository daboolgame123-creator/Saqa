  /**
 * حالة المعاملة (BR-03) — مستقلة تماماً عن اتجاه الكتاب.
 * الحالات المعتمدة حالياً: قيد المراجعة، مكتمل.
 * الاتحاد (union) قابل للتوسع بحالات مستقبلية معتمدة دون إعادة بناء النظام.
 */
export type TransactionStatus = 'قيد المراجعة' | 'مكتمل';

export type TransactionDirection = 'صادر' | 'وارد' | 'داخلي';

export type TransactionCategory = 'إدارية' | 'مالية' | 'منتسبين' | 'الأساتذة' | 'أخرى';

export type TransactionPriority = 'عادي' | 'هام' | 'عاجل' | 'عاجل جداً' | 'سري';

export type AttachmentType = 
  | 'كتاب رئيسي' 
  | 'قائمة أسماء' 
  | 'ملحق' 
  | 'هامش' 
  | 'صورة وثيقة' 
  | 'وصل مالي' 
  | 'أمر إداري' 
  | 'تقرير' 
  | 'أخرى';

/** كتالوجات Transaction Domain — القيم البرمجية الحالية هي نفسها المصطلحات العربية المعتمدة. */
export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  'قيد المراجعة': 'قيد المراجعة',
  مكتمل: 'مكتمل',
};

export const TRANSACTION_DIRECTION_LABELS: Record<TransactionDirection, string> = {
  صادر: 'صادر',
  وارد: 'وارد',
  داخلي: 'داخلي',
};

export const TRANSACTION_CATEGORY_LABELS: Record<TransactionCategory, string> = {
  'إدارية': 'إدارية',
  'مالية': 'مالية',
  'منتسبين': 'منتسبين',
  'الأساتذة': 'الأساتذة',
  'أخرى': 'أخرى',
};

export const TRANSACTION_PRIORITY_LABELS: Record<TransactionPriority, string> = {
  'عادي': 'عادي',
  'هام': 'هام',
  'عاجل': 'عاجل',
  'عاجل جداً': 'عاجل جداً',
  'سري': 'سري',
};

export const ATTACHMENT_TYPE_LABELS: Record<AttachmentType, string> = {
  'كتاب رئيسي': 'كتاب رئيسي',
  'قائمة أسماء': 'قائمة أسماء',
  'ملحق': 'ملحق',
  'هامش': 'هامش',
  'صورة وثيقة': 'صورة وثيقة',
  'وصل مالي': 'وصل مالي',
  'أمر إداري': 'أمر إداري',
  'تقرير': 'تقرير',
  'أخرى': 'أخرى',
};

export interface Attachment {
  id: string;
  name: string;
  type: AttachmentType | string;
  fileSize: string;
  uploadDate: string;
  previewUrl?: string;
  isImage?: boolean;
}

export interface DirectorDirective {
  text: string;
  date: string;
  actionRequired?: boolean;
}

/**
 * تذكير المعاملة (BR-04) — اختياري وجزء من نطاق الكتاب.
 * الجدولة والتنفيذ الفعلي للتذكير خارج نطاق تعريف النموذج (Backend في مرحلة لاحقة).
 */
export interface TransactionReminder {
  enabled: boolean;   // تفعيل/تعطيل التذكير
  remindAt: string;   // تاريخ ووقت التذكير
  note: string;       // نص التذكير
}

export interface TransactionSpecificDetails {
  destination?: string;
  vehicle?: string;
  purpose?: string;
  amount?: string;
  leaveDays?: number;
  leaveType?: string;
}

import type { DailySituationData } from './dailySituation';
import type { AccessScope } from './accessScope';

export interface Transaction {
  /** معرف السجل المستقل عن أي منتسب أو علاقة موظفين. */
  id: string;
  /** العدد الرسمي للكتاب. */
  number: string;
  /** التسلسل الداخلي. */
  sequence: string;
  /** تاريخ الكتاب بصيغة YYYY-MM-DD. */
  date: string;
  /** شهر مشتق من التاريخ (YYYY-MM) لا يمثل حالة أو تصنيفاً مستقلاً. */
  month: string;
  direction: TransactionDirection;
  category: TransactionCategory;
  subType: string;
  /** جهة الكتاب/الجهة المصدرة أو ذات العلاقة وفق النموذج الأولي الحالي. */
  entity: string;
  /** عنوان الكتاب أو موضوعه. */
  subject: string;
  /** الجهة المعنون إليها، اختياري للتوافق مع معاملات prototype المخزنة سابقاً. */
  addressedTo?: string;
  /** مضمون الكتاب، اختياري للتوافق مع معاملات prototype المخزنة سابقاً. */
  content?: string;
  
  /**
   * ربط المعاملة بالمنتسبين (Domain Model Enhancement):
   * - employeeIds: مصفوفة المعرفات لعلاقة متعددة (1-to-N أو N-to-N)
   * - employeeName: محفوظ بالكامل للتوافق التراجعي (Backward Compatibility)
   */
  employeeIds?: string[];
  employeeName?: string;

  /**
   * نطاق الرؤية والأذونات (Access Scope / Visibility):
   * يفصل بين "من يرتبط بالمعاملة" وبين "من يحق له الاطلاع عليها"
   */
  visibility?: AccessScope;

  /**
   * نطاق الاستهداف الإداري (اختياري)
   */
  targetScope?: 'all' | 'specific' | 'department' | 'none';

  priority?: TransactionPriority;
  directorDirective?: DirectorDirective;
  /** تذكير اختياري (BR-04) — بيانات فقط؛ التنفيذ المجدول ليس من نطاق Phase 4. */
  reminder?: TransactionReminder;
  status: TransactionStatus;
  notes?: string;
  attachments: Attachment[];
  isRead?: boolean;
  createdAt?: string;
  readAt?: string;
  isDailySituation?: boolean;
  dailySituationData?: DailySituationData;
  specificDetails?: TransactionSpecificDetails;
}
