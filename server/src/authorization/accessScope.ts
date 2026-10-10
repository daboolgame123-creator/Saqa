/**
 * نطاق الرؤية (Access Scope) — Phase 13.
 *
 * الفصل المعتمد في §12: `Identity → Permission → Access Scope → Resource`،
 * ووجود الصلاحية لا يعني رؤية كل سجل. هذا الملف هو **مصدر الحقيقة** على
 * الخادم لقيم النطاق وقاعدة «من يرى أي كتاب»، ولا يستبدل الصلاحيات:
 * `view` تسمح بالعملية، والنطاق يقرر **أي سجل** يُقرأ داخل تلك العملية.
 *
 * المصادر (نصّية لا اجتهادية):
 * - §12: القيم الأربع، ومنع الوصول على الخادم ولو أُرسل الطلب يدوياً.
 * - §9.1: الكتاب ذو النطاق العام للمنتسبين يراه كل منتسب (`PublicToEmployees`).
 * - §9.3: الإدارة تجعل كتاباً متاحاً لمنتسب واحد أو عدة منتسبين.
 * - §9.4: الإتاحة الجماعية للمرتبطين بالكتاب — أي أن الربط وحده لا يمنح رؤية.
 * - §29: النطاقات الأربع، واختبار `linked employee but not available`.
 * - §10.1: المسؤول يدير الكتب والإتاحة ⇒ كل النطاقات.
 * - §10.2: المدير إشرافي/اطلاعي ⇒ كل النطاقات، وبلا إدارة إتاحة (§9.5).
 * - §10.3: المنتسب يرى الأعمام العامة والكتب التي **تمت إتاحتها له**.
 *
 * حدود هذا الملف:
 * - القيم تُقرأ بنفس مفردات النموذج المعتمد في الواجهة
 *   (`src/core/models/accessScope.ts`) بلا توسيع ولا ترجمة.
 * - لا قرار أعمال جديد هنا: كل فرع أدناه مُسنَد إلى بند من الخطة أعلاه،
 *   وما لا يُسنده نص يبقى **fail-closed** (لا رؤية).
 */
import type { Request, RequestHandler } from 'express';
import type { AccessScope } from '../../../src/core/models/accessScope';
import type { AuthenticatedRequest } from '../auth/sessionMiddleware';
import type { TransactionScopeFilter } from '../repositories/contracts';

export type { AccessScope };

/**
 * القيم الأربع المعتمدة (§12) — **المصدر الوحيد** لها على الخادم:
 * `api/validation/catalogs.ts` يشتق قائمة التحقق من هنا، فلا قائمتان.
 */
export const ACCESS_SCOPE_VALUES: readonly AccessScope[] = [
  'PublicToEmployees',
  'SpecificEmployees',
  'Administrative',
  'DirectorOnly',
];

/**
 * النطاق المفروض لكتاب بلا قيمة مخزَّنة.
 *
 * `Administrative` لا `PublicToEmployees`: الغياب لا يجعل الكتاب عاماً
 * بالخطأ. القيمة نفسها هي افتراضي نموذج العميل (`accessScope.ts`) ووصفه:
 * «لا يظهر للمنتسبين العاديين» — أي fail-closed للمنتسب.
 */
export const DEFAULT_ACCESS_SCOPE: AccessScope = 'Administrative';

/** النطاقات التي يراها المنتسب مباشرةً بلا إتاحة صريحة (§9.1). */
export const EMPLOYEE_DIRECT_SCOPES: readonly AccessScope[] = ['PublicToEmployees'];

/**
 * النطاق الذي يجوز أن تحلّ الإتاحة محلّ ظهوره المباشر (§9.3).
 *
 * لماذا `SpecificEmployees` وحدها: الإتاحة تجعل كتاباً «خاصاً بمنتسبين»
 * مرئياً لصاحبه؛ أما `Administrative` و`DirectorOnly` فوصفهما في §12
 * والنموذج أنهما **لا يظهران للمنتسبين العاديين** أصلاً، فإتاحة كتاب
 * أحدهما لمنتسب لا تُبطل وصفه الأمني. الصواب في هذه الحالة تصحيح النطاق
 * إلى `SpecificEmployees` ثم الإتاحة — لا توسيع الإتاحة لخفض السرية.
 */
export const AVAILABILITY_SCOPE: AccessScope = 'SpecificEmployees';

/** هل القيمة نطاق معتمد من القيم الأربع؟ */
export function isAccessScope(value: unknown): value is AccessScope {
  return typeof value === 'string' && (ACCESS_SCOPE_VALUES as readonly string[]).includes(value);
}

/** الفاعل الذي يحكم النطاق عليه — يُقرأ من هوية الجلسة لا من المدخلات. */
export interface ScopeViewer {
  role: string;
  /** معرّف المنتسب المرتبط بالحساب (`users.employee_id`) — أساس الإتاحة. */
  employeeId: string | null;
}

/**
 * قيد النطاق المطبَّق على قراءة الكتب لهذا الفاعل.
 *
 * `null` = بلا قيد (يرى كل الكتب)، وهو للمسؤول (§10.1) والمدير (§10.2).
 * أي قيمة أخرى = يجب تمريرها إلى استعلام القراءة ليُصفّى السجل **قبل**
 * إعادته، فلا تُفلتر النتيجة في الواجهة ولا بعد قراءة البيانات كلها.
 *
 * - **admin** (§10.1): يدير الكتب والإتاحة ⇒ كل النطاقات.
 * - **director** (§10.2): «يرى ما يلزم للإشراف على … الكتب» ⇒ كل
 *   النطاقات، ومنعه من إدارة الإتاحة مكانه المسارات (§9.5) لا هنا.
 * - **employee** (§10.3): الأعمام العامة (§9.1) + الكتب المتاحة له (§9.3)،
 *   فالإتاحة تُنقل في القيد كمعرّف منتسب، والفلترة نفسها في الاستعلام.
 * - **حساب بلا منتسب مرتبط**: عامّ فقط — لا إتاحة بلا معرّف منتسب.
 * - **دور خارج §28** (`archivist` مثلاً): قيد فارغ ⇒ لا يرى أي كتاب
 *   (fail-closed)، وإن كان مرفوضاً أصلاً بـ403 من طبقة الصلاحيات (Phase 12).
 */
export function transactionScopeFilterFor(viewer: ScopeViewer): TransactionScopeFilter | null {
  switch (viewer.role) {
    case 'admin':
      return null;
    case 'director':
      return null;
    case 'employee':
      if (viewer.employeeId === null) {
        return { visibilityIn: [...EMPLOYEE_DIRECT_SCOPES] };
      }
      return {
        visibilityIn: [...EMPLOYEE_DIRECT_SCOPES],
        availableToEmployeeId: viewer.employeeId,
        availabilityScope: AVAILABILITY_SCOPE,
      };
    default:
      return { visibilityIn: [] };
  }
}

/** المفتاح الذي يُخزَّن به القيد المحسوب على الطلب (نمط `apiServices`). */
const ACCESS_SCOPE_LOCALS_KEY = 'accessScope';

/**
 * يثبّت قيد النطاق المحسوب من الهوية على الطلب مرة واحدة.
 *
 * يُركَّب في `api/routes/index.ts` بعد فرض الصلاحيات وقبل راوترات الموارد،
 * فتصبح نقطة القرار واحدة مرئية في تركيب المسارات، ولا تُعاد قراءة الهوية
 * ولا يُعاد الحساب في كل controller. **لا يرفض طلباً**: هو تصفية لا بوابة
 * (ورفض طلب كامل لنقص نطاق سجل سيُنشئ 403 بلا معنى للقراءات المسموحة).
 */
export function attachAccessScope(): RequestHandler {
  return (req, res, next): void => {
    const identity = (req as AuthenticatedRequest).auth;
    res.locals[ACCESS_SCOPE_LOCALS_KEY] =
      identity === undefined
        ? ({ visibilityIn: [] } satisfies TransactionScopeFilter)
        : transactionScopeFilterFor(identity);
    next();
  };
}

/**
 * القيد المحسوب لهذا الطلب — تقرؤه controllers القراءة فقط.
 *
 * عند غياب القيد المحفوظ (الوسيط لم يُركَّب في مسار ما) يُعاد الحساب من
 * الهوية مباشرة، وإن غابت الهوية يُعاد قيد فارغ. لا فرع يعيد `null` هنا
 * بلا هوية: الخطأ الافتراضي في الاتجاه المفتوح، والصواب العكس.
 */
export function transactionScopeOf(req: Request): TransactionScopeFilter | null {
  const stored = req.res?.locals?.[ACCESS_SCOPE_LOCALS_KEY] as
    | TransactionScopeFilter
    | null
    | undefined;
  if (stored !== undefined) {
    return stored;
  }
  const identity = (req as AuthenticatedRequest).auth;
  return identity === undefined
    ? { visibilityIn: [] }
    : transactionScopeFilterFor(identity);
}
