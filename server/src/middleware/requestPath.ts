import type { Request } from 'express';

/**
 * يعيد مسار الطلب كما يجب أن يظهر في السجلات وفي رسائل الأخطاء.
 *
 * يعتمد `originalUrl` بدل `req.path`: هذا الأخير يُعدَّله الراوتر الفرعي
 * وقد يعود مقصوصًا (مثل `/` لمسار `/health`) بعد اكتمال الرد.
 * وتُحذف سلسلة الاستعلام حفاظًا على الخصوصية — لا تُسجَّل Tokens ولا مفاتيح الاستعلام.
 */
export function getRequestPath(req: Request): string {
  const [path] = req.originalUrl.split('?');
  return path.length > 0 ? path : '/';
}