/**
 * أدوات مشتركة للـcontrollers (Phase 10).
 *
 * الـcontroller طبقة HTTP فقط: يقرأ من `req`، ينادي الخدمة، يكتب في `res`.
 * لا تحقق هنا (middleware التحقق يعمل قبله)، ولا استعلام قاعدة، ولا منطق أعمال.
 *
 * الغرض من هذا الملف: توحيد ثلاث نقاط تكررت في كل مورد:
 * - قراءة جسم الطلب بعد التحقق (`req.validatedBody`).
 * - قراءة مُعاملات الاستعلام المحقَّقة (`req.validatedQuery`).
 * - تغليف المعالجات غير المتزامنة حتى لا يُنتج `res` مرتين عند رفض.
 */
import type { Request, RequestHandler, Response } from 'express';

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
