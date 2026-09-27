/**
 * اختبارات Phase 11 — المصادقة والحسابات والجلسات عبر الـHTTP الحقيقي.
 *
 * تغطي قائمة الاختبارات الإلزامية في `ALSQAYA_PLAN.md` §27 واحدةً واحدة:
 * success · wrong credential · 4th attempt delay · 5th freeze ·
 * freeze invalidates sessions · OTP expiry · OTP reuse rejection ·
 * OTP request rate limit · OTP wrong attempts · password reset ·
 * concurrent sessions · logout single session.
 *
 * وتضيف: فرض الهوية على مسارات البيانات، الاستثناء الذي يجيز كشف الرمز
 * السري (§11.8)، وإعادة الضبط الإدارية (§11.7).
 *
 * كل البيانات اصطناعية داخل قاعدة `alsqaya_test` المعزولة.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables } from '../db/testDb';
import {
  getJson,
  postJson,
  requestWithToken,
  useTestSession,
  type ApiErrorBody,
} from './apiTestHelpers';
import {
  issueOtp,
  loginAs,
  newAuthenticatedAccount,
  newEmployeeWithIdentity,
  newRegisteredAccount,
  type AccountBody,
  type LoginBody,
} from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

const SECRET = 'S3cret-Start';

describe('Phase 11 — المصادقة والحسابات والجلسات', () => {
  let suite: ApiTestSuite;
  let pool: Pool;
  let baseUrl: string;

  before(async () => {
    suite = await startApiSuite();
    pool = suite.pool;
    baseUrl = suite.baseUrl;
  });

  after(async () => {
    await stopApiSuite(suite);
  });

  beforeEach(async () => {
    await resetDomainTables(pool);
    useTestSession(null);
  });

  // ── §11.1: إنشاء الحساب لأول مرة ───────────────────────────────

  it('التسجيل الكامل: رقم الباج + الهاتف ← OTP ← رمز سري ← حساب مفعّل', async () => {
    const { account } = await newRegisteredAccount(suite.context, { secret: SECRET });
    assert.equal(account.status, 'active', 'الحساب مُفعّل بعد آخر خطوة (§11.1)');
    assert.equal(account.username, 'T-900', 'username هو رقم الباج');
    assert.equal(account.displayName, 'منتسب مصادقة', 'display_name هو اسم الموظف');
    assert.equal(account.role, 'employee', 'الدور القيمة الموروثة من قيد CHECK');
    assert.equal(account.mustChangeSecret, false);
    assert.match(account.id, /^[0-9a-f-]{36}$/);
  });

  it('الرمز السري لا يُخزَّن نصاً صريحاً في القاعدة (§11.8)', async () => {
    const { account } = await newRegisteredAccount(suite.context, { secret: SECRET });
    const stored = await pool.query<{ secretCiphertext: string; plaintextLeak: number }>(
      `SELECT secret_ciphertext AS "secretCiphertext",
              (SELECT count(*)::int FROM users WHERE secret_ciphertext = $1) AS "plaintextLeak"
       FROM users WHERE id = $2`,
      [SECRET, account.id],
    );
    assert.equal(stored.rows[0].plaintextLeak, 0, 'لا صفّ يطابق النص الصريح');
    assert.ok(stored.rows[0].secretCiphertext.length > 0);
    assert.ok(!stored.rows[0].secretCiphertext.includes(SECRET), 'النص المشفّر لا يحوي الرمز');
  });

  it('فشل مطابقة رقم الباج/الهاتف لا يكشف أي معلومة (§11.1)', async () => {
    const wrongPhone = await postJson<{ accepted: boolean }>(
      baseUrl,
      '/api/auth/registration/otp',
      { badgeNumber: 'T-900', phone: '07999999999' },
    );
    const wrongBadge = await postJson<{ accepted: boolean }>(
      baseUrl,
      '/api/auth/registration/otp',
      { badgeNumber: 'NOPE-1', phone: '07700000001' },
    );
    const matched = await postJson<{ accepted: boolean }>(
      baseUrl,
      '/api/auth/registration/otp',
      { badgeNumber: 'T-900', phone: '07700000001' },
    );
    for (const response of [wrongPhone, wrongBadge, matched]) {
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { accepted: true });
    }
    // الاستجابة متطابقة تماماً، ولم يصدر رمز لغير المطابقة.
    assert.equal(suite.context.otpProvider.lastCodeFor('07999999999', 'registration'), null);
  });

  it('طلب الرمز لا ينشئ حساباً — التفعيل وحده ينشئه', async () => {
    await newEmployeeWithIdentity(suite.context);
    await issueOtp(suite.context, '07700000001', 'registration', 'T-900');
    const users = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM users`,
    );
    assert.equal(users.rows[0].count, '0', 'لا حساب قبل التحقق من الرمز');
  });

  // ── §11.5: قواعد الرمز السري ─────────────────────────────────────

  it('OTP: انتهاء الصلاحية بعد 5 دقائق يُرفض (§11.5)', async () => {
    const employee = await newEmployeeWithIdentity(suite.context);
    const code = await issueOtp(suite.context, employee.phone, 'registration', employee.badgeNumber);
    // نقدّم الوقت بدل انتظار 5 دقائق فعلية.
    await pool.query(
      `UPDATE auth_otp_codes SET expires_at = now() - interval '1 minute'
       WHERE phone = $1 AND purpose = 'registration'`,
      [employee.phone],
    );
    const response = await postJson<ApiErrorBody>(baseUrl, '/api/auth/registration/verify', {
      phone: employee.phone,
      code,
      secret: SECRET,
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.error?.code, 'OTP_INVALID');
  });

  it('OTP: الاستخدام المكرر يُرفض — استخدام واحد فقط (§11.5)', async () => {
    const employee = await newEmployeeWithIdentity(suite.context);
    const code = await issueOtp(suite.context, employee.phone, 'registration', employee.badgeNumber);
    const first = await postJson(baseUrl, '/api/auth/registration/verify', {
      phone: employee.phone,
      code,
      secret: SECRET,
    });
    assert.equal(first.status, 201, 'المرة الأولى تنجح');
    const second = await postJson<ApiErrorBody>(baseUrl, '/api/auth/registration/verify', {
      phone: employee.phone,
      code,
      secret: 'Another-Secret',
    });
    assert.equal(second.status, 400, 'الرمز المستهلك لا يُقبل ثانية');
    assert.equal(second.body.error?.code, 'OTP_INVALID');
  });

  it('OTP: رمز جديد يبطل السابق (§11.5)', async () => {
    const employee = await newEmployeeWithIdentity(suite.context);
    const first = await issueOtp(suite.context, employee.phone, 'registration', employee.badgeNumber);
    const second = await issueOtp(suite.context, employee.phone, 'registration', employee.badgeNumber);
    assert.notEqual(first, second, 'الرموز مختلفة');
    const response = await postJson<ApiErrorBody>(baseUrl, '/api/auth/registration/verify', {
      phone: employee.phone,
      code: first,
      secret: SECRET,
    });
    assert.equal(response.status, 400, 'الرمز الأول أُبطِل بإصدار الثاني');
  });

  it('OTP: خمس محاولات خاطئة تُبطل الرمز وتطلب إصداراً جديداً (§11.5)', async () => {
    const employee = await newEmployeeWithIdentity(suite.context);
    await issueOtp(suite.context, employee.phone, 'registration', employee.badgeNumber);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const wrong = await postJson<ApiErrorBody>(baseUrl, '/api/auth/registration/verify', {
        phone: employee.phone,
        code: '000000',
        secret: SECRET,
      });
      assert.equal(wrong.status, 400, `المحاولة ${attempt} مرفوضة`);
    }
    const record = await pool.query<{ attempts: number; invalidated: boolean }>(
      `SELECT attempts, (invalidated_at IS NOT NULL) AS invalidated
       FROM auth_otp_codes WHERE phone = $1 AND purpose = 'registration'`,
      [employee.phone],
    );
    assert.equal(record.rows[0].attempts, 5);
    assert.equal(record.rows[0].invalidated, true, 'الرمز مُبطل بعد خمس محاولات');

    const code = await issueOtp(suite.context, employee.phone, 'registration', employee.badgeNumber);
    const afterNew = await postJson(baseUrl, '/api/auth/registration/verify', {
      phone: employee.phone,
      code,
      secret: SECRET,
    });
    assert.equal(afterNew.status, 201, 'رمز جديد يعمل');
  });

  it('OTP: الطلب السادس خلال 15 دقيقة يُحظر (§11.5 rate limit)', async () => {
    const employee = await newEmployeeWithIdentity(suite.context);
    for (let request = 1; request <= 5; request += 1) {
      const allowed = await postJson(baseUrl, '/api/auth/registration/otp', {
        badgeNumber: employee.badgeNumber,
        phone: employee.phone,
      });
      assert.equal(allowed.status, 200, `الطلب ${request} مسموح`);
    }
    const blocked = await postJson<ApiErrorBody>(baseUrl, '/api/auth/registration/otp', {
      badgeNumber: employee.badgeNumber,
      phone: employee.phone,
    });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error?.code, 'OTP_RATE_LIMITED');

    const block = await pool.query<{ blockedUntil: string }>(
      `SELECT blocked_until AS "blockedUntil" FROM auth_otp_rate_limits WHERE phone = $1`,
      [employee.phone],
    );
    assert.equal(block.rows.length, 1);
    const minutes = (Date.parse(block.rows[0].blockedUntil) - Date.now()) / 60000;
    assert.ok(minutes > 14 && minutes <= 15, `مدة الحظر ~15 دقيقة (${minutes})`);
  });

  it('OTP: كل طلب يُسجَّل في سجل التدقيق (§11.5)', async () => {
    const employee = await newEmployeeWithIdentity(suite.context);
    await issueOtp(suite.context, employee.phone, 'registration', employee.badgeNumber);
    const events = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs WHERE event_kind = 'otp_event'`,
    );
    assert.ok(Number(events.rows[0].count) > 0, 'حدث otp_event مسجَّل');
  });

  // ── §11.2 و§11.4: الدخول ────────────────────────────────────────

  it('success: الدخول برقم الباج ينشئ جلسة (§11.2)', async () => {
    const { account } = await newRegisteredAccount(suite.context, { secret: SECRET });
    useTestSession(null);
    const response = await postJson<LoginBody>(baseUrl, '/api/auth/login', {
      identifier: account.username,
      secret: SECRET,
    });
    assert.equal(response.status, 200);
    assert.ok(response.body.sessionToken.length >= 32, 'الرفعة عشوائية طويلة');
    assert.equal(response.body.account.id, account.id);
  });

  it('success: الدخول برقم الهاتف أيضاً (§11.2)', async () => {
    const { employee, account } = await newRegisteredAccount(suite.context, { secret: SECRET });
    useTestSession(null);
    const response = await postJson<LoginBody>(baseUrl, '/api/auth/login', {
      identifier: employee.phone,
      secret: SECRET,
    });
    assert.equal(response.status, 200, 'رقم الهاتف مقبول كبديل');
    assert.equal(response.body.account.id, account.id);
  });

  it('الرفعة لا تُخزَّن نصاً صريحاً — تجزئة فقط (§11.9)', async () => {
    const { sessionToken } = await newAuthenticatedAccount(suite.context, { secret: SECRET });
    const literal = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM auth_sessions WHERE token_hash = $1`,
      [sessionToken],
    );
    assert.equal(literal.rows[0].count, '0', 'لا تُخزَّن الرفعة نصاً');
    const total = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM auth_sessions`,
    );
    assert.equal(total.rows[0].count, '1', 'لكن الجلسة نفسها مسجّلة');
  });

  it('wrong credential: رقم غير موجود ورمز خاطئ يعطيان الخطأ نفسه (§11.4)', async () => {
    const { account } = await newRegisteredAccount(suite.context, { secret: SECRET });
    useTestSession(null);
    const noSuchUser = await postJson<ApiErrorBody>(baseUrl, '/api/auth/login', {
      identifier: 'NOPE-1',
      secret: SECRET,
    });
    const wrongSecret = await postJson<ApiErrorBody>(baseUrl, '/api/auth/login', {
      identifier: account.username,
      secret: 'Wr0ng-Secret',
    });
    assert.equal(noSuchUser.status, 401);
    assert.equal(wrongSecret.status, 401);
    assert.equal(noSuchUser.body.error?.code, 'INVALID_CREDENTIALS');
    assert.equal(wrongSecret.body.error?.code, 'INVALID_CREDENTIALS');
    assert.equal(
      noSuchUser.body.error?.message,
      wrongSecret.body.error?.message,
      'لا يكشف النظام هل الخطأ في الرقم أم الرمز',
    );
  });

  it('4th attempt delay: المحاولة الرابعة تتأخر 5 ثوانٍ (§11.4)', async () => {
    const { account } = await newRegisteredAccount(suite.context, { secret: SECRET });
    useTestSession(null);
    let fourthDuration = 0;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const startedAt = Date.now();
      await postJson(baseUrl, '/api/auth/login', {
        identifier: account.username,
        secret: 'Wr0ng-Secret',
      });
      const elapsed = Date.now() - startedAt;
      if (attempt === 4) {
        fourthDuration = elapsed;
      } else {
        assert.ok(elapsed < 4000, `المحاولة ${attempt} بلا تأخير خاص (${elapsed}ms)`);
      }
    }
    assert.ok(fourthDuration >= 4800, `المحاولة الرابعة تأخّرت ~5 ثوانٍ (${fourthDuration}ms)`);
  });

  it('5th freeze: المحاولة الخامسة تجمّد الحساب 15 دقيقة (§11.4)', async () => {
    const { account } = await newRegisteredAccount(suite.context, { secret: SECRET });
    useTestSession(null);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await postJson(baseUrl, '/api/auth/login', {
        identifier: account.username,
        secret: 'Wr0ng-Secret',
      });
    }
    const row = await pool.query<{ status: string; frozenUntil: string }>(
      `SELECT status, frozen_until AS "frozenUntil" FROM users WHERE id = $1`,
      [account.id],
    );
    assert.equal(row.rows[0].status, 'frozen');
    const minutes = (Date.parse(row.rows[0].frozenUntil) - Date.now()) / 60000;
    assert.ok(minutes > 14 && minutes <= 15, `مدة التجميد ~15 دقيقة (${minutes})`);

    const denied = await postJson<ApiErrorBody>(baseUrl, '/api/auth/login', {
      identifier: account.username,
      secret: SECRET,
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error?.code, 'ACCOUNT_FROZEN');
  });

  it('freeze invalidates sessions: التجميد يبطل الجلسات القائمة (§11.3)', async () => {
    const { account, sessionToken } = await newAuthenticatedAccount(suite.context, {
      secret: SECRET,
    });
    const before = await requestWithToken(baseUrl, '/api/auth/me', { token: sessionToken });
    assert.equal(before.status, 200, 'الجلسة تعمل قبل التجميد');

    useTestSession(null);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await postJson(baseUrl, '/api/auth/login', {
        identifier: account.username,
        secret: 'Wr0ng-Secret',
      });
    }
    const after = await requestWithToken<ApiErrorBody>(baseUrl, '/api/auth/me', {
      token: sessionToken,
    });
    assert.equal(after.status, 401, 'الجلسة بُطلت فوراً مع التجميد');
    assert.equal(after.body?.error?.code, 'AUTHENTICATION_REQUIRED');
  });

  it('كل محاولات الدخول تُسجَّل (§11.4)', async () => {
    const { account } = await newRegisteredAccount(suite.context, { secret: SECRET });
    useTestSession(null);
    // رمز خاطئ **بطول صالح**: الأقصر من 8 محارف يُرفض بتحقق قبل أي
    // محاولة دخول (400)، فلا تُسجَّل «محاولة» أصلاً — وهذا سلوك صحيح
    // (§11.4 تسجّل محاولات الاعتماد، لا مدخلات مرفوضة الشكل).
    await postJson(baseUrl, '/api/auth/login', { identifier: account.username, secret: 'Wr0ng-Secret' });
    await postJson(baseUrl, '/api/auth/login', { identifier: account.username, secret: SECRET });
    const failed = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs
       WHERE event_kind = 'login' AND new_values->>'outcome' = 'invalid_credentials'`,
    );
    const success = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs
       WHERE event_kind = 'login' AND new_values->>'outcome' = 'success'`,
    );
    assert.equal(failed.rows[0].count, '1', 'المحاولة الفاشلة مسجّلة');
    assert.equal(success.rows[0].count, '1', 'المحاولة الناجحة مسجّلة');
  });

  // ── §11.6: الاستعادة ────────────────────────────────────────────

  it('password reset: الهاتف ← OTP ← رمز جديد بلا الرمز القديم (§11.6)', async () => {
    const { employee, account } = await newRegisteredAccount(suite.context, { secret: SECRET });
    useTestSession(null);
    const code = await issueOtp(suite.context, employee.phone, 'recovery');
    const response = await postJson<{ account: AccountBody }>(
      baseUrl,
      '/api/auth/recovery/verify',
      { phone: employee.phone, code, secret: 'Brand-New-Secret' },
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.account.id, account.id);
    assert.equal(response.body.account.mustChangeSecret, false);

    const oldSecret = await postJson<ApiErrorBody>(baseUrl, '/api/auth/login', {
      identifier: account.username,
      secret: SECRET,
    });
    assert.equal(oldSecret.status, 401, 'الرمز القديم بطل');
    const newSecret = await postJson(baseUrl, '/api/auth/login', {
      identifier: account.username,
      secret: 'Brand-New-Secret',
    });
    assert.equal(newSecret.status, 200, 'الرمز الجديد يعمل');
  });

  it('طلب استعادة لهاتف بلا حساب لا يكشف شيئاً (§11.5)', async () => {
    const response = await postJson<{ accepted: boolean }>(baseUrl, '/api/auth/recovery/otp', {
      phone: '07000000000',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { accepted: true });
    const codes = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM auth_otp_codes WHERE phone = '07000000000'`,
    );
    assert.equal(codes.rows[0].count, '0', 'لا رمز صدر لهاتف بلا حساب');
  });

  // ── §11.9: الجلسات ──────────────────────────────────────────────

  it('concurrent sessions: عدّة أجهزة في وقت واحد على الحساب نفسه (§11.9)', async () => {
    const { account } = await newRegisteredAccount(suite.context, { secret: SECRET });
    useTestSession(null);
    const first = await postJson<LoginBody>(baseUrl, '/api/auth/login', {
      identifier: account.username,
      secret: SECRET,
    });
    const second = await postJson<LoginBody>(baseUrl, '/api/auth/login', {
      identifier: account.username,
      secret: SECRET,
    });
    assert.notEqual(first.body.sessionToken, second.body.sessionToken);
    for (const token of [first.body.sessionToken, second.body.sessionToken]) {
      const me = await requestWithToken(baseUrl, '/api/auth/me', { token });
      assert.equal(me.status, 200, 'كل الجلسات المتزامنة صالحة');
    }
  });

  it('logout single session: الخروج يهدم الجلسة الحالية فقط (§11.9)', async () => {
    const { account } = await newRegisteredAccount(suite.context, { secret: SECRET });
    const first = await postJson<LoginBody>(baseUrl, '/api/auth/login', {
      identifier: account.username,
      secret: SECRET,
    });
    const second = await postJson<LoginBody>(baseUrl, '/api/auth/login', {
      identifier: account.username,
      secret: SECRET,
    });

    useTestSession(first.body.sessionToken);
    const out = await postJson(baseUrl, '/api/auth/logout', undefined);
    // 204 بلا جسم: لا محتوى بعد التدمير (§11.9).
    assert.equal(out.status, 204);

    const firstAfter = await requestWithToken(baseUrl, '/api/auth/me', {
      token: first.body.sessionToken,
    });
    const secondAfter = await requestWithToken(baseUrl, '/api/auth/me', {
      token: second.body.sessionToken,
    });
    assert.equal(firstAfter.status, 401, 'الجلسة المستخدَمة للخروج بُطلت');
    assert.equal(secondAfter.status, 200, 'الجلسة الأخرى باقية — logout لا يهدم الكل');
  });

  it('مهلة الخمول 30 دقيقة تبطل الجلسة (§11.9)', async () => {
    const { sessionToken } = await newAuthenticatedAccount(suite.context, { secret: SECRET });
    await pool.query(`UPDATE auth_sessions SET last_activity_at = now() - interval '31 minutes'`);
    const response = await requestWithToken<ApiErrorBody>(baseUrl, '/api/auth/me', {
      token: sessionToken,
    });
    assert.equal(response.status, 401);
    assert.equal(response.body?.error?.code, 'AUTHENTICATION_REQUIRED');
  });

  it('كل نشاط يعيد ضبط مؤقّت الخمول (§11.9)', async () => {
    const { sessionToken } = await newAuthenticatedAccount(suite.context, { secret: SECRET });
    await pool.query(`UPDATE auth_sessions SET last_activity_at = now() - interval '20 minutes'`);
    const before = await pool.query<{ lastActivityAt: string }>(
      `SELECT last_activity_at AS "lastActivityAt" FROM auth_sessions`,
    );
    const response = await requestWithToken(baseUrl, '/api/auth/me', { token: sessionToken });
    assert.equal(response.status, 200, 'ما زال داخل مهلة 30 دقيقة');
    const after = await pool.query<{ lastActivityAt: string }>(
      `SELECT last_activity_at AS "lastActivityAt" FROM auth_sessions`,
    );
    assert.ok(
      Date.parse(after.rows[0].lastActivityAt) > Date.parse(before.rows[0].lastActivityAt),
      'النشاط أعاد ضبط المؤقّت',
    );
  });

  // ── Phase 11: فرض الهوية على مسارات البيانات ───────────────────

  it('مسارات /api/* ترفض الطلب بلا جلسة (401) — كل المسارات', async () => {
    const paths = [
      '/api/employees',
      '/api/transactions',
      '/api/transaction-employees',
      '/api/daily-situations',
      '/api/leaves',
      '/api/time-permissions',
      '/api/assignments',
      '/api/courses',
      '/api/timeline?employeeId=00000000-0000-0000-0000-000000000000',
    ];
    for (const path of paths) {
      const response = await getJson<ApiErrorBody>(baseUrl, path);
      assert.equal(response.status, 401, `${path} يجب أن ترفض بلا جلسة`);
      assert.equal(response.body.error?.code, 'AUTHENTICATION_REQUIRED');
    }
  });

  it('طلب كتابة بلا جلسة مرفوض — المنع على الخادم لا في الواجهة', async () => {
    useTestSession(null);
    const response = await postJson<ApiErrorBody>(baseUrl, '/api/employees', {
      name: 'محاولة',
      title: 'x',
      department: 'y',
    });
    assert.equal(response.status, 401);
  });

  it('مسارات المصادقة نفسها تعمل بلا جلسة (مداخل النظام)', async () => {
    useTestSession(null);
    const response = await postJson<{ accepted: boolean }>(
      baseUrl,
      '/api/auth/registration/otp',
      { badgeNumber: 'X-1', phone: '07000000001' },
    );
    assert.equal(response.status, 200, 'طلب رمز يعمل بلا جلسة');
  });

  it('مع جلسة صالحة تفتح مسارات البيانات', async () => {
    await newAuthenticatedAccount(suite.context, { secret: SECRET });
    const response = await getJson<unknown[]>(baseUrl, '/api/employees');
    assert.equal(response.status, 200);
  });

  it('رفعة مُلفَّقة (غير موجودة) تُرفض', async () => {
    const response = await requestWithToken<ApiErrorBody>(baseUrl, '/api/auth/me', {
      token: 'a'.repeat(64),
    });
    assert.equal(response.status, 401);
  });

  // ── §11.7: إعادة الضبط الإدارية ────────────────────────────────

  it('إعادة الضبط: رمز مؤقت + إبطال الجلسات + إلزام التغيير عند أول دخول (§11.7)', async () => {
    await newRegisteredAccount(suite.context, {
      badgeNumber: 'A-1',
      phone: '07700000010',
      secret: SECRET,
    });
    await loginAs(suite.context, 'A-1', SECRET);
    const target = await newRegisteredAccount(suite.context, {
      badgeNumber: 'T-1',
      phone: '07700000011',
      secret: 'Target-Old-Secret',
    });
    const targetSession = await loginAs(suite.context, 'T-1', 'Target-Old-Secret');

    const reset = await postJson<{ account: AccountBody; temporarySecret: string }>(
      baseUrl,
      `/api/auth/accounts/${target.account.id}/reset`,
      undefined,
    );
    assert.equal(reset.status, 200);
    assert.equal(reset.body.account.mustChangeSecret, true, 'يُطلب تغييره عند أول دخول');
    assert.ok(reset.body.temporarySecret.length > 0);

    const afterReset = await requestWithToken<ApiErrorBody>(baseUrl, '/api/auth/me', {
      token: targetSession,
    });
    assert.equal(afterReset.status, 401, 'الجلسات القديمة بُطلت');

    useTestSession(null);
    const oldSecret = await postJson<ApiErrorBody>(baseUrl, '/api/auth/login', {
      identifier: 'T-1',
      secret: 'Target-Old-Secret',
    });
    assert.equal(oldSecret.status, 401, 'الرمز القديم بطل');

    const withTemp = await postJson<LoginBody>(baseUrl, '/api/auth/login', {
      identifier: 'T-1',
      secret: reset.body.temporarySecret,
    });
    assert.equal(withTemp.status, 200);
    assert.equal(withTemp.body.mustChangeSecret, true);

    const blocked = await requestWithToken<ApiErrorBody>(baseUrl, '/api/employees', {
      token: withTemp.body.sessionToken,
    });
    assert.equal(blocked.status, 403, 'الوصول محجوب حتى يُغيَّر الرمز');
    assert.equal(blocked.body?.error?.code, 'SECRET_CHANGE_REQUIRED');

    // تغيير الرمز بالجلسة التي دخلت بها فعلاً (الجلسة العائدة من
    // الدخول بالرمز المؤقت) — لا بالرفعة المحقونة العامة، فهي `null`
    // هنا بحكم `useTestSession(null)` أعلاه، فيرفض الخادم الطلب 401.
    const changed = await requestWithToken<{ account: AccountBody }>(
      baseUrl,
      '/api/auth/secret',
      {
        method: 'POST',
        token: withTemp.body.sessionToken,
        body: {
          currentSecret: reset.body.temporarySecret,
          newSecret: 'Chosen-Secret-1',
        },
      },
    );
    assert.equal(changed.status, 200);
    assert.equal(changed.body?.account.mustChangeSecret, false);

    useTestSession(null);
    const reLogin = await postJson<LoginBody>(baseUrl, '/api/auth/login', {
      identifier: 'T-1',
      secret: 'Chosen-Secret-1',
    });
    assert.equal(reLogin.status, 200);
    const allowed = await requestWithToken(baseUrl, '/api/employees', {
      token: reLogin.body.sessionToken,
    });
    assert.equal(allowed.status, 200, 'الوصول فُتح بعد تغيير الرمز');
  });

  it('إعادة الضبط لحساب غير موجود ترجع 404', async () => {
    await newAuthenticatedAccount(suite.context, { secret: SECRET });
    const response = await postJson<ApiErrorBody>(
      baseUrl,
      '/api/auth/accounts/00000000-0000-0000-0000-000000000000/reset',
      undefined,
    );
    assert.equal(response.status, 404);
  });

  it('مسار الحساب يرفض معرّفاً ليس UUID (تحقق قبل القاعدة)', async () => {
    await newAuthenticatedAccount(suite.context, { secret: SECRET });
    const response = await postJson<ApiErrorBody>(
      baseUrl,
      '/api/auth/accounts/not-a-uuid/reset',
      undefined,
    );
    assert.equal(response.status, 400);
    assert.equal(response.body.error?.code, 'VALIDATION_ERROR');
  });

  // ── §11.8: رؤية الرمز السري للمسؤولين ─────────────────────────

  it('كشف الرمز السري يعمل ويسجّل Audit Log (§11.8)', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'A-2',
      phone: '07700000020',
      secret: SECRET,
    });
    const target = await newRegisteredAccount(suite.context, {
      badgeNumber: 'T-2',
      phone: '07700000021',
      secret: 'Visible-Secret-1',
    });
    useTestSession(admin.sessionToken);

    const response = await getJson<{ account: AccountBody; secret: string }>(
      baseUrl,
      `/api/auth/accounts/${target.account.id}/secret`,
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.secret, 'Visible-Secret-1', 'الرمز المقروء يطابق المُخزَّن');

    const audits = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs
       WHERE event_kind = 'admin_secret_reveal' AND actor_user_id = $1`,
      [admin.account.id],
    );
    assert.equal(audits.rows[0].count, '1', 'عملية الكشف مسجَّلة بفاعلها');
  });

  it('فشل فك التشفير لا يُتجاوز — المسار هو إعادة الضبط (§11.8)', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'A-3',
      phone: '07700000030',
      secret: SECRET,
    });
    const target = await newRegisteredAccount(suite.context, {
      badgeNumber: 'T-3',
      phone: '07700000031',
      secret: 'Broken-Secret-1',
    });
    useTestSession(admin.sessionToken);

    // عبث بالنص المشفّر يحاكي فشل المفتاح.
    await pool.query(
      `UPDATE users SET secret_ciphertext = 'Y2FwdGFyZWRhZGFkYWRhZGFkYWRhdA==' WHERE id = $1`,
      [target.account.id],
    );
    const response = await getJson<ApiErrorBody>(
      baseUrl,
      `/api/auth/accounts/${target.account.id}/secret`,
    );
    assert.equal(response.status, 503);
    assert.equal(response.body.error?.code, 'SECRET_UNAVAILABLE');
    assert.match(response.body.error?.message ?? '', /إعادة الضبط/);
  });

  it('مسارات الإدارة ترفض بلا جلسة — لا يُكشف الرمز بلا هوية', async () => {
    const target = await newRegisteredAccount(suite.context, {
      badgeNumber: 'T-4',
      phone: '07700000041',
      secret: SECRET,
    });
    useTestSession(null);
    const reveal = await getJson<ApiErrorBody>(
      baseUrl,
      `/api/auth/accounts/${target.account.id}/secret`,
    );
    assert.equal(reveal.status, 401, 'لا يُكشف الرمز لمن بلا جلسة');
  });

  // ── التحقق من المدخلات ─────────────────────────────────────────

  it('التحقق يرفض الحقول الناقصة والقيم غير المعروفة في مسارات المصادقة', async () => {
    useTestSession(null);
    const missing = await postJson<ApiErrorBody>(baseUrl, '/api/auth/login', {
      identifier: 'T-900',
    });
    assert.equal(missing.status, 400);
    assert.ok(missing.body.error?.details?.some((d) => d.field.includes('secret')));

    const badCode = await postJson<ApiErrorBody>(baseUrl, '/api/auth/registration/verify', {
      phone: '07700000001',
      code: '123',
      secret: SECRET,
    });
    assert.equal(badCode.status, 400, 'رمز بأقل من 6 أرقام مرفوض');

    const explicitNull = await postJson<ApiErrorBody>(baseUrl, '/api/auth/login', {
      identifier: 'T-900',
      secret: null,
    });
    assert.equal(explicitNull.status, 400, 'لا تُقبل null صراحةً');

    const tooShort = await postJson<ApiErrorBody>(baseUrl, '/api/auth/login', {
      identifier: 'T-900',
      secret: 'ab',
    });
    assert.equal(tooShort.status, 400, 'رمز أقصر من الحد الأدنى مرفوض');
  });
});
