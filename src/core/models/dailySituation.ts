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
