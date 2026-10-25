/**
 * أدوات مشتركة للـcontrollers (Phase 10).
 *
 * الـcontroller طبقة HTTP فقط: يقرأ من `req`، ينادي الخدمة، يكتب في `res`.
 * لا تحقق هنا (middleware التحقق يعمل قبله)، ولا استعلام قاعدة، ولا منطق أعمال.
 *
 * الغرض من هذا الملف: توحيد نقاط تكررت في كل مورد:
 * - قراءة جسم الطلب بعد التحقق (`req.validatedBody`).
 * - قراءة مُعاملات الاستعلام المحقَّقة (`req.validatedQuery`).
 * - تغليف المعالجات غير المتزامنة حتى لا يُنتج `res` مرتين عند رفض.
 * - قراءة ترويسات الرفع بعد التحقق منها (Phase 14).
 *
 * Phase 14: الاستثناء الوحيد على قاعدة «لا تحقق هنا» هو `uploadInput`، فهو
 * يقرأ ترويسات لا جسم JSON، والتحقق منها في `validation/attachmentUpload`.
 * سبب فصله: الرفع بلا validateApiRequest لأن الجسم بايتات خام لا
 * كائن قابل للتحقق بمخطط الحقول.
 */
import type { Request, RequestHandler, Response } from 'express';
import type { AuditActor } from '../../audit';
import type { AuthenticatedRequest } from '../../auth/sessionMiddleware';
import {
  readUploadHeaders,
  type UploadAttachmentHeaders,
} from '../validation/attachmentUpload';

/** الجسم بعد التحقق: مُتحقَّق منه مسبقاً، فلا يُعاد فحصه. */
export function validatedBody<TBody>(req: Request): TBody {
  return (req as Request & { validatedBody?: unknown }).validatedBody as TBody;
}

/** مُعاملات الاستعلام بعد التحقق. */
export function validatedQuery<TQuery>(req: Request): TQuery {
  return (req as Request & { validatedQuery?: unknown }).validatedQuery as TQuery;
}

/**
 * يغلّف معالجاً غير متزامن ليمرر رفضه إلى معالج الأخطاء المركزي.
 * Express 5 يتعامل مع rejections الممرّرة إلى `next`، وهذا يجعل
 * السلوك موحّداً مع معالجات Promise من Phase 8.
 */
export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** يستخرج معرّف المسار كنص (بعد التحقق أنه غير فارغ). */
export function pathId(req: Request, name = 'id'): string {
  const params = req.params as Record<string, string | undefined>;
  const value = params[name];
  if (value === undefined || value === '') {
    throw new Error(`المعرّف «${name}» مفقود من المسار.`);
  }
  return value;
}

/** 201 مع جسم المورد المُنشأ. */
export function created<TBody>(res: Response, body: TBody): void {
  res.status(201).json(body);
}

/** 200 مع جسم المورد. */
export function ok<TBody>(res: Response, body: TBody): void {
  res.status(200).json(body);
}

/** 204 بلا جسم (بعد حذف رابط مثلاً). */
export function noContent(res: Response): void {
  res.status(204).send();
}

/**
 * ترويسات رفع المرفق بعد التحقق منها (Phase 14).
 *
 * غلاف حول `readUploadHeaders` كي يقرأ الـcontroller نتيجة نظيفة بدل أن
 * يفهم تركيب الترويسات. الغلاف موجود لسبب واحد: كل قراءة ترويسة داخل
 * الـcontroller تجعل طبقة HTTP تعرف تفاصيل البروتوكل، وهذه الطبقة تُعرف
 * *_shape_ الاستجابة فقط.
 */
export function uploadInput(req: Request): UploadAttachmentHeaders {
  return readUploadHeaders(req);
}

/**
 * فاعل سجل التدقيق من هوية الجلسة (Phase 15 — §31).
 *
 * **الفاعل لا يأتي أبداً من جسم الطلب أو الاستعلام**: مصدره حصراً
 * `req.auth` الذي يركّبه `requireSession` بعد التحقق من الرفعة — فلا
 * يملك عميل تزوير `userId`. الفشل هنا يعني ترتيب وسيطات مكسوراً لا
 * حالة استخدام طبيعية، فيُرمى الخطأ بدل كتابة حدث بلا فاعل.
 */
export function auditActor(req: Request): AuditActor {
  const identity = (req as AuthenticatedRequest).auth;
  if (identity === undefined) {
    throw new Error('مسار تدقيق بلا هوية جلسة — requireSession يجب أن يسبق هذا المسار.');
  }
  return {
    userId: identity.userId,
    employeeId: identity.employeeId,
    sessionId: identity.sessionId,
  };
}
