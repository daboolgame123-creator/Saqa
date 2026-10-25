/**
 * أخطاء سير الطلبات (Phase 19 · §35).
 *
 * على نمط `personnelErrors.ts` في Phase 18: خطأ قاعدة أعمال منفصل عن خطأ
 * المدخلات، لأن مُحقِّق `api/validation` يفحص **الشكل** فقط (`action` قيمة
 * من القائمة، `expectedVersion` عدد موجب) بينما هذا الخطأ يقول: الشكل
 * صحيح، لكن **الحالة الحالية للطلب لا تقبل هذا الإجراء**.
 *
 * لماذا 409 لا 400: الطلب نفسه مُرسَل صحيح، والتعارض مع **حالة المورد**
 * قائم — وهو المعنى القياسي لـConflict. و`details` فيها الحالة الحالية
 * والحالات المسموح بها، فيعرف العميل «لماذا رُفض» دون أن تُنفَّذ القاعدة
 * في الواجهة (§28).
 *
 * لا وجود لخطأ «إنشاء سجل بعد الاعتماد» هنا: قاعدة الاعتماد ⇒ إنشاء
 * Leave/TimePermission غير محسومة في الخطة (Blocker موثّق).
 */
import { AppError } from '../errors';

/** ما يرميه جدول الانتقالات في `requestWorkflow` عند رفض انتقال. */
export interface RejectedTransition {
  readonly from: readonly string[];
  readonly to: string;
}

/**
 * انتقال حالة غير مسموح به من الحالة الحالية.
 *
 * `action` و`currentStatus` و`allowedFrom` تُعاد في `details` ليقرأها
 * العميل برمجياً (رمز الخطأ `REQUEST_TRANSITION_NOT_ALLOWED` ثابت).
 */
export class RequestTransitionError extends AppError {
  /** الإجراء المرفوض من جهة العميل (قيمة `RequestWorkflowAction`). */
  readonly action: string;
  /** الحالة التي كان الطلب فيها فعلاً وقت الطلب. */
  readonly currentStatus: string;
  /** الحالات التي يُسمح بهذا الإجراء منها. */
  readonly allowedFrom: readonly string[];
  /** الحالة التي كان الانتقال سينتهي إليها لو سُمح. */
  readonly nextStatus: string;

  constructor(action: string, currentStatus: string, rule: RejectedTransition) {
    const allowed = rule.from.join('، ');
    super(
      `لا يمكن تنفيذ «${action}» على طلب في حالة «${currentStatus}». ` +
        `هذا الإجراء مسموح من: ${allowed} فقط — والطلب لم يتغيّر.`,
      409,
      'REQUEST_TRANSITION_NOT_ALLOWED',
      true,
      { action, currentStatus, allowedFrom: [...rule.from], nextStatus: rule.to },
    );
    this.action = action;
    this.currentStatus = currentStatus;
    this.allowedFrom = [...rule.from];
    this.nextStatus = rule.to;
  }
}