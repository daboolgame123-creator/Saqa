/**
 * أدوات إنشاء بيانات لمخزون اختبارات الـAPI (Phase 10؛ وُسّعت في Phase 11).
 *
 * دوال معالجات HTTP صغيرة تُعيد جسم الاستجابة كاملاً (رمز + جسم) حتى
 * يستطيع كل اختبار أن يؤكد الرمز(body) وينفّذ التأكيد على البيانات
 * في موضعه — بدل دوال مُغلّفة تخفي رمز الحالة.
 *
 * Phase 11 — `newRegisteredAccount` تبني حساباً حقيقياً كاملاً عبر
 * مسارات المصادقة نفسها (رقم باج + هاتف ← OTP ← رمز ← تفعيل ← دخول)،
 * فكل اختبار بيانات يبدأ من هوية فعلية لا من صفّ `users` مزروع يدوياً.
 */
import assert from 'node:assert/strict';
import type { ApiTestContext } from './apiTestHelpers';
import {
  getJson,
  patchJson,
  postJson,
  useTestSession,
  type JsonResponse,
} from './apiTestHelpers';
import type { OtpPurpose } from '../../src/auth/authTypes';

/** بنية موظف كما يعيدها الـAPI. */
export interface EmployeeBody {
  id: string;
  name: string;
  title: string;
  department: string;
  status: string;
  badgeNumber?: string;
  createdAt: string;
}

/** بنية كتاب كما يعيدها الـAPI. */
export interface TransactionBody {
  id: string;
  number: string;
  sequence: string;
  date: string;
  month: string;
  status: string;
  employeeIds: string[];
  attachments: { id: string; name: string }[];
}

/** ينشئ موظفاً عبر الـAPI ويؤكد 201 مع رسالة فشل واضحة. */
export async function newEmployee(
  context: ApiTestContext,
  overrides: Record<string, unknown> = {},
): Promise<EmployeeBody> {
  const response = await postJson<EmployeeBody>(context.baseUrl, '/api/employees', {
    name: 'منتسب اختبار',
    title: 'معاون إداري',
    department: 'الشؤون الإدارية',
    ...overrides,
  });
  assert.equal(response.status, 201, `فشل إنشاء الموظف: ${JSON.stringify(response.body)}`);
  return response.body;
}

/** ينشئ كتاباً عبر الـAPI ويؤكد 201. */
export async function newTransaction(
  context: ApiTestContext,
  overrides: Record<string, unknown> = {},
): Promise<TransactionBody> {
  const response = await postJson<TransactionBody>(context.baseUrl, '/api/transactions', {
    number: '١٠٠/ص',
    sequence: '٩٠٠',
    date: '2026-09-10',
    direction: 'صادر',
    category: 'إدارية',
    subType: 'تعميم',
    entity: 'إدارة المركز',
    subject: 'كتاب اختبار',
    status: 'قيد المراجعة',
    ...overrides,
  });
  assert.equal(response.status, 201, `فشل إنشاء الكتاب: ${JSON.stringify(response.body)}`);
  return response.body;
}

/** يقرأ مورداً واحداً ويتأكد من 200. */
export async function readOne<T>(
  context: ApiTestContext,
  path: string,
): Promise<T> {
  const response = await getJson<T>(context.baseUrl, path);
  assert.equal(response.status, 200, `فشل القراءة ${path}: ${JSON.stringify(response.body)}`);
  return response.body;
}

/** يقرأ قائمة مورد. */
export async function readMany<T>(
  context: ApiTestContext,
  path: string,
): Promise<T[]> {
  const response = await getJson<T[]>(context.baseUrl, path);
  assert.equal(response.status, 200, `فشل قراءة القائمة ${path}`);
  return response.body;
}

/** يحدّث مورداً جزئياً ويتأكد من 200. */
export async function updateOne<T>(
  context: ApiTestContext,
  path: string,
  patch: unknown,
): Promise<T> {
  const response = await patchJson<T>(context.baseUrl, path, patch);
  assert.equal(response.status, 200, `فشل التعديل ${path}: ${JSON.stringify(response.body)}`);
  return response.body;
}

/** ينشئ سجلاً subordinate عبر مساره (إجازة/زمنية/تكليف/دورة). */
export async function newPersonnelRecord<T>(
  context: ApiTestContext,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await postJson<T>(context.baseUrl, path, body);
  assert.equal(response.status, 201, `فشل إنشاء ${path}: ${JSON.stringify(response.body)}`);
  return response.body;
}

export type { JsonResponse };

// ── Phase 11: بناء حسابات وهويات حقيقية عبر مسارات المصادقة ─────────

/** حساب مفعّل بعد تدفّق التسجيل الكامل. */
export interface AccountBody {
  id: string;
  employeeId: string | null;
  username: string;
  displayName: string;
  role: string;
  status: string;
  mustChangeSecret: boolean;
}

/** نتيجة تسجيل الدخول. */
export interface LoginBody {
  account: AccountBody;
  sessionToken: string;
  mustChangeSecret: boolean;
}

/**
 * أدوار الخطة الثلاثة (§28) كما تُضبط في بيانات الاختبار.
 *
 * التسجيل نفسه يعطي `employee` دائماً (§11.1)، ورفع الدور في الاختبار
 * تغيير مباشر في `users` عبر `setAccountRole` — لأن إسناد الأدوار لا
 * تدفّق له في النظام بعد (سياسة غير محددة في الخطة) فلا يُخترع مسار له.
 */
export type TestRole = 'admin' | 'director' | 'employee';

/** مدخلات إنشاء حساب اختباري. */
export interface NewAccountOptions {
  badgeNumber?: string;
  phone?: string;
  name?: string;
  secret?: string;
  /**
   * دور الحساب بعد التسجيل في `newAuthenticatedAccount` — الافتراضي
   * `admin` لأن اختبارات البيانات (Phase 10) تؤدّي عمليات الإدخال
   * الإدارية التي يمنحها §10.1 للمسؤول. اختبارات Phase 12 تمرّر
   * الدور صراحةً لتمثيل المصفوفة كاملة.
   */
  role?: TestRole;
}

/** موظف مُعرَّف الهوية (رقم باج + هاتف) — شرط التسجيل في §11.1. */
export type IdentifiedEmployee = EmployeeBody & { phone: string; badgeNumber: string };

/**
 * يُنشئ موظفاً برقم باج وهاتف — **بذر مباشر في القاعدة** لا عبر الـAPI.
 *
 * السبب (Phase 11): الموظف شرطٌ سابق للحساب، و`POST /api/employees`
 * نفسه محمي بجلسة. فمن يُنشئه عبر المسار يحتاج حساباً، والحساب يحتاج
 * موظفاً — دورة. لذلك يُزرع الموظف مباشرةً، ويبقى **كل ما بعده** —
 * التسجيل والدخول والجلسات — يمرّ عبر المسارات الحقيقية.
 */
export async function newEmployeeWithIdentity(
  context: ApiTestContext,
  options: NewAccountOptions = {},
): Promise<IdentifiedEmployee> {
  const badgeNumber = options.badgeNumber ?? 'T-900';
  const phone = options.phone ?? '07700000001';
  const name = options.name ?? 'منتسب مصادقة';
  const result = await context.pool.query<{ id: string; createdAt: string }>(
    `INSERT INTO employees (name, title, department, badge_number, phone, status)
     VALUES ($1, 'معاون إداري', 'الشؤون الإدارية', $2, $3, 'active')
     RETURNING id, created_at AS "createdAt"`,
    [name, badgeNumber, phone],
  );
  return {
    id: result.rows[0].id,
    name,
    title: 'معاون إداري',
    department: 'الشؤون الإدارية',
    status: 'active',
    badgeNumber,
    createdAt: result.rows[0].createdAt,
    phone,
  };
}

/**
 * يُصدر رمز OTP ويقرأه من مزوّد الاختبار — لا يُخمَّن ولا يُكتب يدوياً.
 * بلا هذا لا يعرف الاختبار الرمز الفعلي، لأن ما يُخزَّن تجزئة فقط.
 */
export async function issueOtp(
  context: ApiTestContext,
  phone: string,
  purpose: OtpPurpose,
  badgeNumber?: string,
): Promise<string> {
  const path =
    purpose === 'registration' ? '/api/auth/registration/otp' : '/api/auth/recovery/otp';
  const body = purpose === 'registration' ? { badgeNumber, phone } : { phone };
  const response = await postJson<{ accepted: boolean }>(context.baseUrl, path, body);
  assert.equal(response.status, 200, `فشل طلب الرمز: ${JSON.stringify(response.body)}`);
  const code = context.otpProvider.lastCodeFor(phone, purpose);
  assert.ok(code !== null, 'المزوّد الاختباري لم يستلم رمزاً');
  return code;
}

/** نتيجة تسجيل حساب كامل. */
export interface RegisteredAccount {
  employee: IdentifiedEmployee;
  account: AccountBody;
}

/** يُكمل تدفّق تسجيل حساب كاملاً (OTP ← تحقق ← تفعيل). */
export async function newRegisteredAccount(
  context: ApiTestContext,
  options: NewAccountOptions = {},
): Promise<RegisteredAccount> {
  const employee = await newEmployeeWithIdentity(context, options);
  const secret = options.secret ?? 'S3cret-Start';
  const code = await issueOtp(context, employee.phone, 'registration', employee.badgeNumber);
  const verified = await postJson<{ account: AccountBody }>(
    context.baseUrl,
    '/api/auth/registration/verify',
    { phone: employee.phone, code, secret },
  );
  assert.equal(verified.status, 201, `فشل تفعيل الحساب: ${JSON.stringify(verified.body)}`);
  return { employee, account: verified.body.account };
}

/** يسجّل دخولاً حقيقياً ويعيد الرفعة، ويحقنها في الطلبات التالية. */
export async function loginAs(
  context: ApiTestContext,
  identifier: string,
  secret: string,
): Promise<string> {
  const response = await postJson<LoginBody>(context.baseUrl, '/api/auth/login', {
    identifier,
    secret,
  });
  assert.equal(response.status, 200, `فشل الدخول: ${JSON.stringify(response.body)}`);
  useTestSession(response.body.sessionToken);
  return response.body.sessionToken;
}

/**
 * يضبط دور حساب موجود في `users` (زرع اختباري مباشر).
 *
 * لماذا SQL لا مسار API: لا يوجد مسار إسناد أدوار في النظام — الخطة
 * لا تحدّده ولا Phase 12 تخترعه. الاختبارات فقط هي من ترفع دوراً
 * لتمثيل المصفوفة، وبيانات الإنتاج لا تُمسّ.
 */
export async function setAccountRole(
  context: ApiTestContext,
  accountId: string,
  role: string,
): Promise<void> {
  await context.pool.query(`UPDATE users SET role = $2 WHERE id = $1`, [accountId, role]);
}

/**
 * حساب مفعّل + جلسة صالحة محقونة — الطريق المعتاد لاختبارات Phase 10.
 *
 * **Phase 12**: يُرفع دور الحساب إلى `role` (الافتراضي `admin`) بعد
 * التسجيل وقبل الدخول، لأن فرض الصلاحيات صار على الخادم: اختبارات
 * الإدخال الإداري تمثّل مسؤول السقاية (§10.1)، واختبارات المصفوفة
 * تمرّر `director`/`employee` صراحة. الدور يُقرأ من القاعدة في كل
 * طلب، فالرفع قبل الدخول أو بعده أثره واحد.
 */
export async function newAuthenticatedAccount(
  context: ApiTestContext,
  options: NewAccountOptions = {},
): Promise<{ employee: IdentifiedEmployee; account: AccountBody; secret: string; sessionToken: string }> {
  const secret = options.secret ?? 'S3cret-Start';
  const { employee, account } = await newRegisteredAccount(context, { ...options, secret });
  await setAccountRole(context, account.id, options.role ?? 'admin');
  const sessionToken = await loginAs(context, account.username, secret);
  return { employee, account, secret, sessionToken };
}
