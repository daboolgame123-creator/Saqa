import type { RequestHandler } from 'express';
import { ValidationError } from '../errors';
import type { ValidationIssue, Validator } from './validationTypes';

/** هدف التحقق داخل طلب HTTP. */
export type ValidationTarget = 'body' | 'params' | 'query';

/** مواصفة تحقق لهدف واحد. */
export interface RequestValidationSpec {
  /** دالة التحقق الخاصة بالهدف. */
  validator: Validator<unknown, unknown>;
  /** بادئة اسم الحقل في المشاكل (افتراضيًا: اسم الهدف نفسه). */
  fieldPrefix?: string;
}

/** مخطط تحقق لمسار واحد: أي هدف يُفحص وبأي دالة. */
export type RequestValidationSchema = Partial<Record<ValidationTarget, RequestValidationSpec>>;

/**
 * يبني middleware للتحقق من مدخلات الطلب وفق مخطط التحقق الممرَّر.
 *
 * عند وجود أي مشكلة يرفع ValidationError (400) بالصيغة المنظمة الموحّدة،
 * وعند النجاح يمرّر الطلب إلى المعالج التالي.
 *
 * Phase 8: الطبقة والأساس فقط — لا مخططات تحقق خاصة بالموظفين أو الكتب أو المصادقة،
 * ولا تحويل للقيم (DTO mapping يخص مرحلة لاحقة).
 */
export function createValidationMiddleware(schema: RequestValidationSchema): RequestHandler {
  return (req, _res, next) => {
    const issues: ValidationIssue[] = [];

    for (const target of Object.keys(schema) as ValidationTarget[]) {
      const spec = schema[target];
      if (spec === undefined) {
        continue;
      }

      const outcome = spec.validator(req[target]);
      if (outcome.kind === 'invalid') {
        const prefix = spec.fieldPrefix ?? target;
        for (const problem of outcome.issues) {
          issues.push({ field: `${prefix}.${problem.field}`, message: problem.message });
        }
      }
    }

    if (issues.length > 0) {
      next(new ValidationError(issues));
      return;
    }

    next();
  };
}
