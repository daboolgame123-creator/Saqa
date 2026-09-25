import type { RequestHandler } from 'express';
import { NotFoundError } from '../errors';
import { getRequestPath } from './requestPath';

/**
 * يعترض أي طلب لم يطابقه أي راوتر ويحوّله إلى NotFoundError،
 * لتُعاد كل الأخطاء — بما فيها 404 — بالصيغة الموحّدة نفسها.
 */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  // المسار فقط (بلا سلسلة استعلام) حتى لا تظهر مفاتيح حساسة في رسالة الخطأ وفي السجل.
  next(new NotFoundError(`المسار المطلوب غير موجود: ${req.method} ${getRequestPath(req)}`));
};
