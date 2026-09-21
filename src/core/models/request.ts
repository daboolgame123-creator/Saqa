/**
 * الطلبات والموافقات (BR-11) — البنية المعتمدة فقط:
 * `Employee → Request → Director → Approve / Reject / Clarification`
 *
 * حدود النموذج (لا يُخترع ما لم يُعتمد):
 * - المنتسب يمكنه الرد على طلب التوضيح عبر clarification.response.
 * - إشعار المدير بالطلب وآلية تنفيذه منفصلان عن النموذج (نظام إشعارات لاحق).
 * - قواعد الإلغاء، وقاعدة إعادة الرصيد بعد الخصم (BR-09/BR-11) غير معتمدة بعد —
 *   تُوثَّق الحاجة ولا تُنفَّذ.
 */
import type { LeaveType } from './employeeLeave';

/** نوع الطلب — الأنواع المعتمدة حالياً فقط (BR-09 طلب الإجازة، BR-10 طلب الإذن) */
export type RequestKind = 'leave' | 'time_permission';

/** حالة الطلب — بنية قابلة للتوسع بحالات مستقبلية معتمدة دون إعادة بناء */
export type RequestStatus =
  | 'submitted'               // مُقدَّم بانتظار قرار المدير
  | 'clarification_requested' // طلب المدير توضيحاً (بانتظار رد المنتسب ثم القرار)
  | 'approved'                // معتمد
  | 'rejected'                // مرفوض
  | 'cancelled';              // ملغى — قواعد الإلغاء غير معتمدة بعد (BR-11)

/** فعل قرار المدير (BR-11) */
export type RequestDirectorAction = 'approve' | 'reject' | 'request_clarification';

/** دورة التوضيح: طلب المدير التوضيح وردّ المنتسب عليه */
export interface RequestClarification {
  question?: string;   // طلب التوضيح من المدير
  askedAt?: string;
  response?: string;   // رد المنتسب على طلب التوضيح
  respondedAt?: string;
}

/** قرار المدير النهائي على الطلب */
export interface RequestDirectorDecision {
  action: RequestDirectorAction;
  decidedAt?: string;
  comment?: string;
}

/** بيانات طلب الإجازة (BR-09) */
export interface LeaveRequestPayload {
  leaveType: LeaveType;
  startDate: string;   // YYYY-MM-DD
  endDate: string;     // YYYY-MM-DD
  days?: number;
  reason?: string;
}

/** بيانات طلب الإذن الزمني (BR-10) */
export interface TimePermissionRequestPayload {
  date: string;        // YYYY-MM-DD
  timeOut: string;     // HH:mm (نظام 24 ساعة)
  timeIn?: string;     // HH:mm
  reason?: string;
}

/** حمولة الطلب مميّزة بالنوع (discriminated union) — نوع واحد فقط لكل طلب */
export type RequestPayload =
  | ({ kind: 'leave' } & LeaveRequestPayload)
  | ({ kind: 'time_permission' } & TimePermissionRequestPayload);

/**
 * الطلب — كيان مستقل عن السجل الفعلي (فصل BR-09/BR-10 بين الطلب والسجل):
 * اعتماد الطلب لا ينشئ السجل تلقائياً ضمن هذا النموذج؛ عند تنفيذ المرحلة المسؤولة
 * تُربط نتيجة الاعتماد بالسجل الناتج عبر linkedRecordId.
 */
export interface Request {
  id: string;
  employeeId: string;                         // مقدّم الطلب (Rule 7 — employeeId وليس الاسم)
  payload: RequestPayload;                    // نوع الطلب وبياناته
  status: RequestStatus;
  createdAt?: string;
  updatedAt?: string;
  clarification?: RequestClarification;       // دورة التوضيح (BR-11)
  directorDecision?: RequestDirectorDecision; // قرار المدير
  /** معرف السجل الناتج بعد الاعتماد (EmployeeLeave / EmployeeTimePermission) — اختياري */
  linkedRecordId?: string;
  notes?: string;
}
