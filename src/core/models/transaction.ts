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
  id: string;
  number: string;
  sequence: string;
  date: string;
  month: string;
  direction: TransactionDirection;
  category: TransactionCategory;
  subType: string;
  entity: string;
  subject: string;
  
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
  /** تذكير اختياري (BR-04) — البنية فقط؛ التنفيذ المجدول ليس من نطاق Phase 1 */
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
