// قيد مفرد في جدول الموقف اليومي
export interface DailySituationEntry {
  id: string;
  sequence: number;        // ت (1, 2, ...)
  employeeName: string;    // الاسم الرباعي للمنتسب
  employmentType: string;  // صفة العمل (دائمي، مكافأة، أجر يومي، متطوع، ساعات...)
  details: string;         // عدد الأيام ونوع الإجازة، أو عدد الساعات من وإلى، أو من يوم إلى يوم والإيفاد
  date: string;            // التاريخ (مثال: 2026/9/9)
  notes?: string;          // ملاحظات إضافية إن وجدت
}

// هيكلية الموقف اليومي الشاملة لمركز الدراسات الإفريقية المطابقة للنموذج الرسمي (9.jpg)
export interface DailySituationData {
  situationDate: string;          // تاريخ الموقف اليومي (مثال: 2026/09/09)
  addressedTo?: string;           // السيد رئيس قسم الشؤون الفكرية والثقافية دام توفيقه
  departmentName?: string;        // مركز الدراسات الافريقية
  
  // 1. الإجازات اليومية للمنتسب الدائم
  permanentLeaves: DailySituationEntry[];
  
  // 2. الساعات الزمنية (للمنتسب الدائم)
  permanentTimePermissions: DailySituationEntry[];
  
  // 3. تحويل دوام او دورية او ايفاد (للمنتسب الدائم)
  permanentShiftChanges: DailySituationEntry[];
  
  // 4. الاجازات اليومية لمنتسبي المكافأة والاجر اليومي والمتطوع
  temporaryLeaves: DailySituationEntry[];
  
  // 5. الساعات الزمنية (لمنتسبي المكافأة والاجر والمتطوع)
  temporaryTimePermissions: DailySituationEntry[];
  
  // 6. تحويل دوام او دورية او ايفاد (لمنتسبي المكافأة والاجر والمتطوع)
  temporaryShiftChanges: DailySituationEntry[];
  
  supervisorEndorsement?: string; // تأييد مسؤول المركز
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// الموقف اليومي ككيان مستقل (BR-13) — الموقف اليومي ليس كتابًا.
// يرتبط بالمنتسب عبر employeeId (Rule 7)، ويحمل: التاريخ، النوع، الوقت/المدة،
// السبب، الملاحظة، ورابطاً اختيارياً إلى سجل إداري ذي صلة.
//
// النموذج المدمج أعلاه (DailySituationData داخل Transaction عبر isDailySituation)
// يبقى فعلياً في النموذج الأولي حتى مرحلة فصل الموقف اليومي (Phase 6 وفق خطة
// ALSQAYA) حفاظاً على البيانات المخزنة الحالية (Rule 3) — النموذج المستقل يُعرَّف الآن.
// ─────────────────────────────────────────────────────────────────────────────

/** قسم استمارة الموقف اليومي (أقسام النموذج الرسمي الستة المعتمدة) */
export type DailySituationCategory =
  | 'permanent_leaves'
  | 'permanent_time_permissions'
  | 'permanent_shift_changes'
  | 'temporary_leaves'
  | 'temporary_time_permissions'
  | 'temporary_shift_changes';

/** أنواع السجلات الإدارية التي يمكن ربط قيد الموقف اليومي بها اختيارياً */
export type DailySituationRelatedRecordKind =
  | 'transaction'
  | 'leave'
  | 'time_permission'
  | 'assignment'
  | 'course';

/** رابط اختياري إلى سجل إداري ذي صلة */
export interface DailySituationRelatedRecord {
  kind: DailySituationRelatedRecordKind;
  id: string;
}

/** قيد الموقف اليومي المستقل لمنتسب واحد (BR-13) */
export interface DailySituationRecord {
  id: string;
  employeeId: string;               // الرابط الأساسي (Rule 7)
  date: string;                     // التاريخ — YYYY-MM-DD
  category: DailySituationCategory; // النوع
  timeOrDuration?: string;          // الوقت/المدة (نص وفق الاستمارة الرسمية)
  reason?: string;                  // السبب
  notes?: string;                   // الملاحظة
  relatedRecord?: DailySituationRelatedRecord; // رابط اختياري إلى سجل إداري ذي صلة
  createdAt?: string;
}
