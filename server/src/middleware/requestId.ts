import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler } from 'express';

/** ترويسة معرّف الطلب المعتمدة بين العميل والـBackend. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** الحد الأقصى لطول معرّف الطلب المقبول من العميل. */
export const MAX_REQUEST_ID_LENGTH = 128;

/**
 * نمط المعرّفات المقبولة من العميل: أحرف/أرقام ورموز آمنة فقط.
 * يمنع حقن أسطر أو محارف غير مرغوبة في السجلات والترويسات.
 */
export const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

declare global {
  namespace Express {
    interface Request {
      /** معرّف الطلب — يُضاف بواسطة requestIdMiddleware ولا يحوي أي بيانات شخصية. */
      requestId?: string;
    }
  }
}

/**
 * يقرأ معرّف الطلب من ترويسة العميل إن كان آمنًا، وإلا ينشئ معرّفًا جديدًا.
 * لا يُقبل أي معرّف لا يطابق النمط أو يتجاوز الحد المسموح.
 */
export function resolveRequestId(headerValue: string | undefined): string {
  if (headerValue !== undefined) {
    const candidate = headerValue.trim();
    if (
      candidate.length > 0 &&
      candidate.length <= MAX_REQUEST_ID_LENGTH &&
      SAFE_REQUEST_ID_PATTERN.test(candidate)
    ) {
      return candidate;
    }
  }
  return randomUUID();
}

/** يقرأ معرّف الطلب من كائن الطلب بعد مروره على requestIdMiddleware. */
export function getRequestId(req: Request): string | undefined {
  return req.requestId;
}

/**
 * يُثبّت معرّفًا لكل طلب ويجعله متاحًا للسجلات ومعالجة الأخطاء،
 * ويعيده للعميل في ترويسة الاستجابة.
 */
export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const requestId = resolveRequestId(req.header(REQUEST_ID_HEADER));
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
};
