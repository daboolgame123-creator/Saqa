/**
 * تحديد خدمات الـAPI المستخدمة في طلب HTTP (Phase 10).
 *
 * لماذا يوجد: الـcontrollers تقرأ `getApiServices()` (خدمات مشتركة على
 * الـPool المشترك) — وهو الصواب في الإنتاج. لكن الاختبار يحتاج خدمة
 * مبنية على Pool قاعدة الاختبار المعزولة، فلا يجوز أن يغيّر
 * `DATABASE_URL` ولا أن يفتح القاعدة الحقيقية.
 *
 * الحل: تمرير الخدمات عبر `req.locals` عبر middleware واحد يسبق
 * الراوترات. الإنتاج يضع الخدمات المشتركة، والاختبار يضع خدمات Pool
 * الاختبار — دون تعديل أي controller ودون تفرّع في كود الإنتاج.
 *
 * إن لم تُحقَّن خدمات، يعود الطلب إلى الخدمات المشتركة — وهو سلوك
 * الإنتاج الطبيعي حين يُبنى الراوتر مباشرة بلا middleware.
 */
import type { NextFunction, Request, Response } from 'express';
import { getApiServices, type ApiServices } from './services';

export type { ApiServices };

/** يخزّن الخدمات على النطاق (req/res locals) لكل طلب. */
export function useApiServices(services: ApiServices) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.locals.apiServices = services;
    next();
  };
}

/** يعيد خدمات الطلب المحقونة، وإلا الخدمات المشتركة. */
export function servicesOf(req: Request): ApiServices {
  const injected = req.res?.locals?.apiServices as ApiServices | undefined;
  return injected ?? getApiServices();
}
