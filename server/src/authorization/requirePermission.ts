/**
 * وسيطات فرض الصلاحيات (Phase 12) — نقطة الفرض على الخادم.
 *
 * تُركَّب **بعد** `requireSession()` (الهوية) و**بعد** `requireChangedSecret()`
 * (سياسة الرمز المؤقت §11.7)، فيبقى الترتيب:
 *
 *   requireSession → 401 بلا هوية
 *   requireChangedSecret → 403 للرمز المؤقت (كما كان)
 *   requirePermission → 403 PERMISSION_DENIED لمن بصلاحية ناقصة
 *
 * لماذا بعد `requireChangedSecret`: اختبار Phase 11 يشترط أن حساباً
 * يحمل رمزاً مؤقتاً يصل رده `SECRET_CHANGE_REQUIRED` لا رفض صلاحية،
 * فالهوية وحالة الرمز قبل الحكم على الدور.
 *
 * لا قرار أعمال هنا: هذا الوسيط يقرأ الهوية ويقارنها بالمصفوفة في
 * `permissions.ts` ويمرّر الخطأ إلى المعالج المركزي — لا استجابة يدوية.
 */
import type { RequestHandler } from 'express';
import { AuthenticationRequiredError } from '../auth/authErrors';
import type { AuthenticatedRequest } from '../auth/sessionMiddleware';
import { isDirectorAction } from '../services/requestWorkflow';
import type { RequestWorkflowAction } from '../../../src/core/models/request';
import { PermissionDeniedError } from './authorizationErrors';
import { roleHasPermission, type Permission } from './permissions';

/** يقرأ هوية الجلسة التي يركّبها `requireSession`. */
function identityOf(req: Parameters<RequestHandler>[0]): AuthenticatedRequest['auth'] {
  return (req as AuthenticatedRequest).auth;
}

/** يرمي الخطأ المناسب: 401 بلا هوية، 403 عند نقص الصلاحية. */
function enforce(req: Parameters<RequestHandler>[0], permission: Permission, next: Parameters<RequestHandler>[2]): void {
  const identity = identityOf(req);
  if (identity === undefined) {
    // احتياطي ترتيبي: هذا الوسيط يجب أن يركّب بعد requireSession.
    // بلا هوية الصواب 401 (مصادقة) لا 403 (تفويض).
    next(new AuthenticationRequiredError());
    return;
  }
  if (!roleHasPermission(identity.role, permission)) {
    next(new PermissionDeniedError(permission));
    return;
  }
  next();
}

/**
 * يفرض صلاحية واحدة صراحةً على مسار معيّن.
 *
 * يُستعمل للمسارات التي لا تُستمد من HTTP method وحده — مثل مسارَي
 * إدارة الحسابات في `authRoutes`.
 */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next): void => {
    enforce(req, permission, next);
  };
}

/**
 * وسيط فرض صلاحية **عملية Workflow** بحسب الإجراء (Phase 19 · §10.2 · §28).
 *
 * لماذا لا يكفي `requirePermission` وحده: مسار الـworkflow واحد يجمع
 * عمليتين مختلفتين تماماً:
 * - **قرار المدير** (`approve` · `reject` · `request_clarification`): إجراء
 *   Workflow خاص، §10.2 تنصّ أنه «ليس صلاحية CRUD عامة على بيانات
 *   المنتسب» ⇒ `approve_request` (وهي للمدير وحده، و`admin` خارجها).
 * - **أفعال صاحب الطلب** (`submit` · `employee_reply` · `cancel`): لم
 *   تقرّر الخطة لها صلاحية (انظر Blocker في `PHASE_19_REPORT.md` §5)،
 *   فلا تُخترع؛ تمرّ على خريطة `method ← family` القائمة: `POST` ⇒
 *   `create`، وهي `admin` اليوم.
 *
 * **Fail-closed على الإجراء المجهول**: اسم لا يُعرف (أو جسم بلا
 * `action`) ⇒ لا يُفرض عنه أي صلاحية فيُسقطه `validateApiRequest` بـ400.
 * والفحص يقرأ الجسم **قبل** التحقق من شكله، فسلوكه لا يعتمد على
 * `validatedBody` ولا يقرأ قيمة مُنقّاة؛ قيمة `action` هنا لقرار التفويض
 * فقط، والخدمة تقرأ **`validatedBody` للتحقق والكتابة** بعد نجاح التحقق.
 *
 * يركّب بعد `validateApiRequest` في `routes/requestRoutes.ts` — أي بعد
 * التحقق من الشكل وقبل الـcontroller، وهو نفس ترتيب بقية الطبقات.
 */
export function requireRequestWorkflowPermission(): RequestHandler {
  return (req, _res, next): void => {
    const body = req.body as Record<string, unknown> | undefined;
    const action = body?.action;
    if (typeof action !== 'string') {
      // الإجراء ليس شكلاً صالحاً ⇒ التحقق (`validateApiRequest`) هو من
      // يردّ بـ400. لا صلاحية تُفرض ولا يُفتح شيء.
      next();
      return;
    }
    // مفردات الأفعال من نموذج المجال نفسه، وأفعال المدير الثلاثة
    // تُفحص عبر `isDirectorAction` فلا اجتهاد في الأسماء هنا.
    const permission: Permission = isDirectorAction(action as RequestWorkflowAction)
      ? 'approve_request'
      : 'create';
    enforce(req, permission, next);
  };
}

/**
 * خريطة method ← عائلة الصلاحية لموارد `/api/*` (قرار تقني لا قاعدة
 * أعمال): verbs REST تمثّل عائلات §28 على الموارد الستة كما نُقلت في
 * Phase 10.
 *
 * ملاحظة واقعية: المصفوفة الحالية تمنح admin كل العائلات وتجرد
 * director/employee من كل الكتابات، فالنتيجة واحدة مهما اخترنا الـverb
 * المطابق؛ والتمييز الدقيق (مثل `POST /status` كـupdate) يبقى موثّقاً
 * هنا لمستقبل أدق لا يغيّر سلوك اليوم.
 *
 * **الاستثناء الأول المُفعَّل (Phase 15)**: `POST …/acknowledge`
 * («اطلعت» §9.1) ليس إنشاء مورد — إجراء اطلاع صريح بعائلة `view`،
 * لأن المنتسب (§10.3: `view` فقط) هو المستخدم الأساسي له. الجدول
 * أدناه هو الموضع الوحيد لهذا التمييز؛ لا شرط مكرر في أي مسار.
 */
const METHOD_PERMISSIONS: Readonly<Record<string, Permission>> = {
  GET: 'view',
  HEAD: 'view',
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete_archive',
};

/**
 * استثناءات مسار محدّد ← عائلة (Phase 15 · Phase 19).
 *
 * تُطابَق على **نهاية المسار** بعد فكّ مسار الجذر (يُسلَّم `req.path`
 * داخل الراوتر)، فالنمط صالح سواء وصل المسار تحت `/api` أو لا.
 */
const PATH_PERMISSION_OVERRIDES: ReadonlyArray<{
  pattern: RegExp;
  permission: Permission;
}> = [
  // «اطلعت»: عائلة `view` لا `create` (§9.1 + §10.3).
  { pattern: /\/transactions\/[^/]+\/acknowledge$/, permission: 'view' },
  // Phase 21 — «تعليم كمقروء»: **نفس الحالة تماماً** التي أنشأ استثناء
  // «اطلعت» لأجلها. ليس إنشاء مورد بل تغيير حالة صف يخصّ صاحبه وحده
  // (§20 «فتح المحتوى يزيل حالة الجديد»)، والمستخدم الأساسي له هو
  // **المنتسب** الذي §10.3 يمنحه `view` فقط. بلا هذا الاستثناء لما استطاع
  // أحد تعليم ما قرأه، وهو مكسور وظيفياً لا مشدود أمنياً.
  //
  // الأمان لا يأتي من `view` بل من قيد الملكية: `markRead` مُقيَّد بـ
  // `user_id = <الجلسة>` داخل `UPDATE` في المستودع، فلا يملك `view` أي
  // وصول إلى صفّ غيره (403 لمَن لا يملك، 404 لمَن لا يملك أصلاً).
  { pattern: /\/notifications\/[^/]+\/read$/, permission: 'view' },
  // Phase 19 — قرارات سير الطلبات. **السبب الدقيق** (§35 «المدير» +
  // §10.2): «اعتماد/رفض الطلب إجراءات Workflow خاص … وليس صلاحية CRUD
  // عامة على بيانات المنتسب». فـ`POST` عادي يُقرأ `create` — وهي
  // مسؤول السقاية وحده (§10.1) — بينما صاحب `approve_request` هو
  // **المدير** (§28). بلا هذا الاستثناء لما استطاع المدير الاعتماد
  // أصلاً، ولبقى `POST = create` معنىً أمنياً خاطئاً لقرار موافقة.
  //
  // ما لم يُضبط عمداً: `submit` و`employee_reply` و`cancel` تمرّ على
  // خريطة الـmethod (`create`/`update`) لأن الخطة لم تقرّر بعد أي
  // صلاحية يملكها صاحب الطلب (§10.3 `view` فقط مقابل «employee reply»
  // في §35). قرار RBAC معلّق وموثّق في `PHASE_19_REPORT.md` §5؛ ولا
  // تُخترع صلاحية جديدة لسدّه.
  { pattern: /\/requests\/[^/]+\/workflow$/, permission: 'view' },
];

/**
 * العائلة المطلوبة لmethod HTTP — `null` لmethod لا تغطيه عائلات الخطة
 * (لا مُنفِّذ لها في المسارات أيضًا).
 *
 * المسار اختياري: إن وُجد فُحصت استثناءاته أولاً (استثناء يغلب
 * الافتراض)، وإلا يبقى خريطة الـmethod كما هي تماماً.
 */
export function requiredPermissionForMethod(method: string, path?: string): Permission | null {
  if (path !== undefined) {
    for (const override of PATH_PERMISSION_OVERRIDES) {
      if (override.pattern.test(path)) {
        return override.permission;
      }
    }
  }
  return METHOD_PERMISSIONS[method.toUpperCase()] ?? null;
}

/**
 * يفرض عائلة الصلاحية المقابلة لmethod على كل مسارات الموارد.
 *
 * يُركَّب نقطة واحدة في `api/routes/index.ts` بعد حارسي الجلسة، فتُغطَّى
 * كل راوترات الموارد بلا تكرار شرط في كل controller.
 */
export function requireResourcePermission(): RequestHandler {
  return (req, _res, next): void => {
    // `req.path` هنا مسار الراوتر (بلا `/api`) — يُمرَّر لاستثناءات
    // المسار في `requiredPermissionForMethod` (Phase 15: «اطلعت»).
    const permission = requiredPermissionForMethod(req.method, req.path);
    if (permission === null) {
      // method خارج خريطة العائلات: لا صلاحية تُفرض ولا مُنفِّذ لها.
      next();
      return;
    }
    enforce(req, permission, next);
  };
}
