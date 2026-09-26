/**
 * ربط مُحقِّقات Phase 10 بمسارات HTTP.
 *
 * `createValidationMiddleware` (Phase 8) يوفّر التحقق لكنه يرمي خطأ
 * ولا يعيد القيمة المُتحقَّق منها إلى المسار. نحتاج القيمة المُنقّاة
 * (مثلاً `status` مُطبَّعاً من سلسلة نصية) لتنتقل إلى الخدمة.
 *
 * لذلك هذا الغلاف: ينفّذ نفس منطق Phase 8 (تجميع المشاكل في
 * ValidationError واحد)، لكن يضع النتيجة النظيفة في `req.validatedBody`
 * أو `req.validatedQuery` عند النجاح.
 *
 * ملاحظة أمنية: القيم في `req.body`/`req.query` الأصلية لا تُستخدم أبداً
 * بعد هذا الغلاف — القراءة من المسار تتم من `validatedBody/validatedQuery`
 * حصراً (انظر `controllers/shared.ts`)، فلا تمرّ قيمة غير محقَّقة إلى الخدمة.
 */
import type { RequestHandler } from 'express';
import { ValidationError } from '../../errors';
import type { ValidationIssue, Validator } from '../../validation/validationTypes';
import type { ValidationTarget } from '../../validation/validateRequest';

interface TargetSpec {
  validator: Validator<unknown, unknown>;
}

export type ApiValidationSchema = Partial<Record<ValidationTarget, TargetSpec>>;

/** الطلب بعد التحقق — الحقول المُضافة هنا يقرأها الـcontroller وحده. */
export type ValidatedRequest = {
  validatedBody?: unknown;
  validatedQuery?: unknown;
};

/**
 * يبني middleware يتحقق من `body`/`query` (وأي هدف آخر) ويضع النتيجة
 * النظيفة على الطلب. عند وجود أي مشكلة يرفع ValidationError (400).
 */
export function validateApiRequest(schema: ApiValidationSchema): RequestHandler {
  return (req, _res, next) => {
    const issues: ValidationIssue[] = [];
    const target = req as unknown as ValidatedRequest;

    for (const key of Object.keys(schema) as ValidationTarget[]) {
      const spec = schema[key];
      if (spec === undefined) {
        continue;
      }
      const outcome = spec.validator(req[key]);
      if (outcome.kind === 'invalid') {
        // بادئة الحقل: body.* / query.* حتى يعرف العميل مصدر المشكلة.
        for (const problem of outcome.issues) {
          issues.push({ field: `${key}.${problem.field}`, message: problem.message });
        }
      } else {
        target[key === 'body' ? 'validatedBody' : 'validatedQuery'] = outcome.value;
      }
    }

    if (issues.length > 0) {
      next(new ValidationError(issues));
      return;
    }

    next();
  };
}
