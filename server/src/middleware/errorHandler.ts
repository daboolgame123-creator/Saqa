import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors';
import { TechnicalLogger } from '../logging';
import { getRequestPath } from './requestPath';

/** الشكل الموحّد لأي خطأ يعيده الـBackend. */
export interface ApiErrorBody {
  error: {
    /** رمز الخطأ الثابت (بالإنجليزية). */
    code: string;
    /** رسالة قابلة للعرض. */
    message: string;
    /** تفاصيل إضافية آمنة (مثل مشاكل التحقق) — للأخطاء التشغيلية فقط. */
    details?: unknown;
    /** تفاصيل تشخيصية — تُضاف فقط خارج بيئة production. */
    stack?: string;
    /** معرّف الطلب الذي أنتج الخطأ. */
    requestId?: string;
  };
}

/** خيارات إنشاء معالج الأخطاء المركزي. */
export interface ErrorHandlerOptions {
  /** عند true تُضاف تفاصيل التشخيص (stack) — يُفعَّل في بيئات غير الإنتاج فقط. */
  exposeDetails: boolean;
}

/** نتيجة تصنيف أي خطأ وارد إلى الشكل الذي ستُبنى منه الاستجابة. */
export interface ResolvedError {
  statusCode: number;
  code: string;
  message: string;
  isOperational: boolean;
  details?: unknown;
}

/**
 * تصنيف الخطأ الوارد إلى استجابة آمنة.
 * أي خطأ غير معروف يُترجم إلى 500 عام دون كشف تفاصيله الداخلية.
 */
export function resolveError(error: unknown): ResolvedError {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      isOperational: error.isOperational,
      details: error.details,
    };
  }
  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'حدث خطأ داخلي غير متوقع في الخادم.',
    isOperational: false,
  };
}

/**
 * معالج الأخطاء المركزي — يجب أن يكون آخر middleware في سلسلة التطبيق.
 * يوحد صيغة كل الأخطاء، ويمنع تسريب تفاصيل داخلية في production.
 */
export function createErrorHandler(options: ErrorHandlerOptions): ErrorRequestHandler {
  return (error, req, res, _next) => {
    const resolved = resolveError(error);
    const requestId = req.requestId;

    const context = {
      requestId,
      source: 'http',
      data: {
        code: resolved.code,
        statusCode: resolved.statusCode,
        method: req.method,
        path: getRequestPath(req),
      },
    };

    if (resolved.isOperational) {
      // خطأ متوقع (404 أو مدخلات غير صالحة) — يُسجَّل بوصفه حدثًا تقنيًا معروفًا.
      TechnicalLogger.warn('request failed with operational error', context);
    } else {
      // خطأ غير متوقع — يُسجَّل بكل تفاصيله للتشخيص، ولا تُعاد تفاصيله للعميل.
      TechnicalLogger.error('unhandled error', {
        ...context,
        data: {
          ...context.data,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
    }

    const body: ApiErrorBody = {
      error: {
        code: resolved.code,
        message: resolved.message,
      },
    };

    // التفاصيل تُعاد فقط للأخطاء التشغيلية المتوقعة (مثل مشاكل التحقق).
    if (resolved.isOperational && resolved.details !== undefined) {
      body.error.details = resolved.details;
    }

    if (requestId !== undefined) {
      body.error.requestId = requestId;
    }

    if (options.exposeDetails && error instanceof Error && error.stack !== undefined) {
      body.error.stack = error.stack;
    }

    res.status(resolved.statusCode).json(body);
  };
}
