import { AppError } from './AppError';

/** خطأ 404 — المسار المطلوب غير مطابق لأي راوتر في الـBackend. */
export class NotFoundError extends AppError {
  constructor(message = 'المسار المطلوب غير موجود.', code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}
