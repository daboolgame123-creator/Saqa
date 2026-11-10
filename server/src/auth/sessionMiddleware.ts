/**
 * وسيط فرض الجلسة (Phase 11) — نقطة فرض الهوية على الخادم.
 *
 * هذا هو **الفرق الحقيقي** الذي أحدثته Phase 11: قبلها كان كل طلب
 * يصل بلا هوية، والآن كل مسار بيانات يمرّ من هنا. القرار المتفق عليه:
 * فرض الهوية هنا، وفرض الصلاحيات في `authorization` بعدها (Phase 12)،
 * ونطاق الرؤية Phase 13 (Access Scope).
 *
 * ما يفعله بالضبط:
 * 1. يستخرج الرفعة من ترويسة `Authorization: Bearer` (أو كوكي الجلسة).
 * 2. يحوّلها إلى تجزئة ويبحث بها — لا يقارن نصاً صريحاً.
 * 3. يمرّرها على كل قيود الصلاحية في `AuthService.resolveSession`:
 *    الإبطال، مهلة الخمول 30 دقيقة، حالة الحساب، ووجوب تغيير الرمز.
 * 4. يضع الهوية على الطلب (`req.auth`) ليستعملها الـcontroller.
 *
 * عند الفشل يمرّر خطأ `AuthenticationRequiredError` إلى معالج الأخطاء
 * المركزي، فيصير 401 موحّداً — لا استجابة تُبنى يدوياً هنا.
 */
import type { RequestHandler } from 'express';
import { authServiceOf } from './serviceContext';
import { AuthenticationRequiredError, SecretChangeRequiredError } from './authErrors';
import type { AuthenticatedIdentity } from './authTypes';

/** الطلب بعد اجتياز الفحص — الحقل الذي تقرأه الـcontrollers. */
export type AuthenticatedRequest = { auth?: AuthenticatedIdentity };

/** اسم الكوكي الذي يحمل الرفعة (مكمّل لترويسة Bearer). */
const SESSION_COOKIE_NAME = 'alsqaya_session';

/** يقرأ الرفعة من ترويسة Bearer أولاً ثم من الكوكي. */
function readSessionToken(header: string | undefined, cookieHeader: string | undefined): string | null {
  if (typeof header === 'string') {
    const [scheme, value] = header.split(' ');
    if (
      scheme !== undefined &&
      scheme.toLowerCase() === 'bearer' &&
      value !== undefined &&
      value.trim() !== ''
    ) {
      return value.trim();
    }
  }
  if (typeof cookieHeader === 'string') {
    for (const part of cookieHeader.split(';')) {
      const [name, ...rest] = part.split('=');
      if (name?.trim() === SESSION_COOKIE_NAME) {
        const value = rest.join('=').trim();
        if (value !== '') {
          return value;
        }
      }
    }
  }
  return null;
}

/**
 * يبني وسيط يفرض وجود جلسة صالحة.
 *
 * كل الأخطاء تُمرَّر إلى `next` ليترجمها معالج الأخطاء المركزي، فلا
 * منطق استجابة داخل هذا الملف.
 */
export function requireSession(): RequestHandler {
  return (req, _res, next): void => {
    const token = readSessionToken(req.headers.authorization, req.headers.cookie);
    if (token === null) {
      // لا رفعة ⇒ لا هوية. نفس خطأ «جلسة غير صالحة» في كل الحالات
      // حتى لا يميّز الخادم بين «لا جلسة» و«جلسة متبطّلة».
      next(new AuthenticationRequiredError());
      return;
    }
    authServiceOf(req)
      .resolveSession(token)
      .then((identity) => {
        (req as AuthenticatedRequest).auth = identity;
        next();
      })
      .catch(next);
  };
}

/**
 * يمنع الوصول إلى **الموارد** ما دام الحساب يحمل رمزاً مؤقتاً (§11.7).
 *
 * لماذا لا يكون داخل `requireSession`: إعادة الضبط الإدارية تُنشئ رمزاً
 * مؤقتاً وتطلب تغييره «عند أول دخول». لو مُنع هنا لأغلق الأمرَ على
 * المستخدم نفسه — إذ لا يستطيع بلوغ `POST /api/auth/secret` أبداً، ويبقى
 * محبوساً على رمز لا يعلمه. لذا:
 * - `requireSession()` يثبت **الهوية** (مصادقة).
 * - `requireChangedSecret()` يقيّد **الوصول للموارد** (سياسة).
 *
 * يجب أن يركب بعد `requireSession()` لأنّه يقرأ `req.auth`.
 */
export function requireChangedSecret(): RequestHandler {
  return (req, _res, next): void => {
    const identity = (req as AuthenticatedRequest).auth;
    if (identity !== undefined && identity.mustChangeSecret) {
      next(new SecretChangeRequiredError());
      return;
    }
    next();
  };
}
