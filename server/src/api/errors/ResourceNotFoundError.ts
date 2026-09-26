/**
 * خطأ «المورد غير موجود» على مستوى المورد (Phase 10).
 *
 * يختلف عن `NotFoundError` العامة في middleware (404 للمسار غير المطابق).
 * هنا 404 يعني: المسار صحيح لكن السجل المطلوب غير موجود أو غير مرئي.
 * الرمز ثابت بالإنجليزية ليقرأه العميل برمجياً (عقد الأخطاء Phase 8).
 */
import { AppError } from '../../errors';

export class ResourceNotFoundError extends AppError {
  /** اسم المورد بالإنجليزية (employees, transactions, …) للتشخيص. */
  readonly resource: string;

  /** معرّف السجل المطلوب (يُعاد في الرسالة لا في السجل التقني). */
  readonly resourceId: string;

  constructor(resource: string, resourceId: string, arabicLabel: string) {
    super(`${arabicLabel} بالمعرّف «${resourceId}» غير موجود.`, 404, 'RESOURCE_NOT_FOUND');
    this.resource = resource;
    this.resourceId = resourceId;
  }
}
