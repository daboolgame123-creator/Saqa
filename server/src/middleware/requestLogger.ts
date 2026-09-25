import type { RequestHandler } from 'express';
import { TechnicalLogger } from '../logging';
import { getRequestPath } from './requestPath';

/**
 * يسجّل كل طلب HTTP مكتمل بصيغة منظمة (سجل تقني — وليس Audit).
 * لا يسجّل أجسام الطلبات ولا الترويسات ولا سلسلة الاستعلام، حفاظًا على الخصوصية.
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  // يُلتقط المسار الآن لأن originalUrl قد لا يبقى كما هو بعد اكتمال الرد.
  const path = getRequestPath(req);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    TechnicalLogger.info('http request completed', {
      requestId: req.requestId,
      source: 'http',
      data: {
        method: req.method,
        path,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      },
    });
  });

  next();
};
