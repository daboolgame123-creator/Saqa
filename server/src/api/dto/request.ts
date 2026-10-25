/**
 * DTOs الطلبات وسير الموافقة (Phase 19 · §18 · §35).
 *
 * نقطة وحدة بين طبقة الـAPI والمستودع: `RequestDto` هو نموذج المجال
 * كما يُقرأ (بلا فهرسة)، و`RequestDetailDto` يضيف ما يحتاجه读 الواجهة
 * لاحقاً (UI-06): تاريخ الحالة والإجراءات المتاحة.
 *
 * **`availableActions` تُحسب على الخادم** من جدول الانتقالات نفسه
 * (`services/requestWorkflow`) ولا تُخزَّن ولا تُخمَّن في العميل — لأن
 * الأمن على الخادم لا على زر (§4 · §28). وهي **معلومة عرض** فقط: حتى لو
 * مُنعت عملياً، الرفض يأتي من `authorization/` لا من القائمة.
 */
import type {
  Request,
  RequestKind,
  RequestPayloadData,
  RequestStatus,
  RequestStatusHistoryRecord,
  RequestWorkflowAction,
} from '../../../../src/core/models/request';

/** طلب واحد كما يعيده الخادم. */
export type RequestDto = Request;

/** إنشاء طلب: الحالة والنسخة والتاريخ من الخادم لا من العميل. */
export interface CreateRequestDto {
  employeeId: string;
  kind: RequestKind;
  payload: RequestPayloadData;
  notes?: string;
}

/** تعديل طلب مسوّد — الوصف فقط، والنسخة شرط قفل (Phase 17). */
export interface UpdateRequestDto {
  expectedVersion: number;
  payload?: RequestPayloadData;
  notes?: string;
}

/** فلاتر قائمة الطلبات — كل فلاتر قراءة. */
export interface RequestListQuery {
  employeeId?: string;
  status?: RequestStatus;
  kind?: RequestKind;
}

/** جسم تنفيذ عملية Workflow — الإجراء + نصّه + النسخة الإلزامية. */
export interface RequestWorkflowBody {
  action: Exclude<RequestWorkflowAction, 'create'>;
  expectedVersion: number;
  comment?: string;
  response?: string;
}

/**
 * طلب + تاريخ تغييرات الحالة (§18 «تاريخ التغييرات») + الإجراءات
 * المتاحة في الحالة الراهنة.
 *
 * `history` سجل كامل لا يُحذف (§32) و`availableActions` مشتقّة من
 * `REQUEST_TRANSITIONS` في كل قراءة، فلا تتقادم ولا تكذب.
 */
export interface RequestDetailDto extends RequestDto {
  history: RequestStatusHistoryRecord[];
  availableActions: RequestWorkflowAction[];
}