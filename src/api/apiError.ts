/**
 * شكل جسم خطأ الـAPI كما يعيده الخادم (Phase 10).
 *
 * مبني على `ApiErrorBody` في `server/src/middleware/errorHandler.ts`:
 * الرسالة عربية (للعرض) والرمز إنجليزي ثابت (للمعالجة البرمجية).
 * لا يُضاف رمز جديد هنا — كل رمز يأتي من الخادم.
 */
export interface ApiErrorBody {
  error?: {
    /** رمز ثابت بالإنجليزية (VALIDATION_ERROR / RESOURCE_NOT_FOUND / …). */
    code?: string;
    /** رسالة عربية قابلة للعرض. */
    message?: string;
    /** قائمة مشاكل الحقول عند فشل التحقق (400). */
    details?: { field: string; message: string }[];
    /** معرّف الطلب — يظهر في سجل الخادم نفسه. */
    requestId?: string;
  };
}

/** خطأ قادم من الـAPI برمز ثابت قابل للقراءة برمجياً. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error?.message ?? 'تعذّر تنفيذ الطلب على الخادم.');
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error?.code ?? 'UNKNOWN_ERROR';
    this.details = body.error?.details;
    this.requestId = body.error?.requestId;
  }
}

/** هل الخطأ فشل تحقق مدخلات (400)؟ */
export function isValidationError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === 'VALIDATION_ERROR';
}

/** هل الخطأ «السجل غير موجود» (404)؟ */
export function isNotFoundError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === 'RESOURCE_NOT_FOUND';
}
