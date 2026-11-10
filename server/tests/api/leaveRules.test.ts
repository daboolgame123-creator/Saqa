/**
 * اختبارات Phase 18 عبر الـHTTP الحقيقي — محرّك قواعد الإجازات والزمنيات.
 *
 * المرجع: `ALSQAYA_PLAN.md` §14 · §15 · §34.
 *
 * ما يُثبَت هنا: المسار الكامل `middleware → validation → controller →
 * service → engine → repository → PostgreSQL` بلا mock في أي طبقة، وأن
 * القواعد تُطبَّق **على الخادم** لا في الواجهة.
 *
 * البيانات اصطناعية داخل القاعدة المعزولة، والحساب admin (مسؤول السقاية
 * §10.1) لأن الكتابة على الأرصدة تحتاج `create` من §28.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { resetDomainTables } from '../db/testDb';
import { getJson, postJson, patchJson, type ApiErrorBody } from './apiTestHelpers';
import { newAuthenticatedAccount, newEmployee } from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';

interface BalanceBody {
  employeeId: string;
  year: string;
  annualBalance: number;
  annualRemainderDays: number;
  annualPendingDays: number;
  emergencyBalance: number;
  emergencyRemainderMinutes: number;
  unpaidDays: number;
}

interface LedgerBody {
  id: string;
  movementType: string;
  leaveType?: string;
  amount: number;
  unit: string;
  balanceAfter: number;
  reversesLedgerId?: string;
  notes?: string;
}

interface LeaveResultBody {
  leave: { id: string; type: string; status: string };
  balance: BalanceBody | null;
  unpaidDays: number;
}

interface TimePermissionResultBody {
  record: { id: string; durationMinutes?: number };
  balance: BalanceBody | null;
  weeklyMinutes: number;
  exceedsWeeklyLimit: boolean;
  coveredEmergencyDays: number;
  unpaidDays: number;
  remainderMinutes: number;
}

describe('Phase 18 — API: محرّك قواعد الإجازات والزمنيات', () => {
  let suite: ApiTestSuite;
  let baseUrl: string;

  before(async () => {
    suite = await startApiSuite();
    baseUrl = suite.baseUrl;
  });

  after(async () => {
    await stopApiSuite(suite);
  });

  beforeEach(async () => {
    await resetDomainTables(suite.pool);
    await newAuthenticatedAccount(suite.context);
  });

  describe('قراءة الأرصدة وسجل الحركات', () => {
    it('GET /api/leave-balances يقرأ رصيداً أنشأه المحرك', async () => {
      const employee = await newEmployee(suite.context, { joinedDate: '2026-01-01' });
      const opened = await postJson<BalanceBody>(baseUrl, '/api/leave-balances/opening', {
        employeeId: employee.id,
        year: '2026',
        leaveType: 'annual',
        days: 7,
        occurredOn: '2026-01-01',
        notes: 'نقطة بداية موثّقة',
      });
      assert.equal(opened.status, 201);
      assert.equal(opened.body.annualBalance, 7);

      const list = await getJson<BalanceBody[]>(
        baseUrl,
        `/api/leave-balances?employeeId=${employee.id}&year=2026`,
      );
      assert.equal(list.status, 200);
      assert.equal(list.body.length, 1);
      assert.equal(list.body[0].annualBalance, 7);
    });

    it('GET /api/leave-ledger يعرض حركات الافتتاح والتصحيح', async () => {
      const employee = await newEmployee(suite.context, { joinedDate: '2026-01-01' });
      await postJson<BalanceBody>(baseUrl, '/api/leave-balances/opening', {
        employeeId: employee.id,
        year: '2026',
        leaveType: 'annual',
        days: 4,
        occurredOn: '2026-01-01',
        notes: 'نقطة بداية',
      });
      await postJson<BalanceBody>(baseUrl, '/api/leave-balances/adjustment', {
        employeeId: employee.id,
        year: '2026',
        leaveType: 'annual',
        days: 2,
        occurredOn: '2026-02-01',
        notes: 'تصحيح موثّق',
      });
      const ledger = await getJson<LedgerBody[]>(
        baseUrl,
        `/api/leave-ledger?employeeId=${employee.id}`,
      );
      assert.equal(ledger.status, 200);
      const types = ledger.body.map((entry) => entry.movementType);
      assert.ok(types.includes('opening_balance'));
      assert.ok(types.includes('adjustment'));
    });
  });

    describe('افتتاح الرصيد: موثّق ولا يُكرَّر (§15/§34)', () => {
    it('يعيد 400 بلا بيان توثيق (notes إلزامي)', async () => {
      const employee = await newEmployee(suite.context);
      const response = await postJson<ApiErrorBody>(baseUrl, '/api/leave-balances/opening', {
        employeeId: employee.id,
        year: '2026',
        leaveType: 'annual',
        days: 5,
        occurredOn: '2026-01-01',
      });
      assert.equal(response.status, 400);
    });

    it('يعيد 400 لسنة غير صالحة أو أيام سالبة', async () => {
      const employee = await newEmployee(suite.context);
      const badYear = await postJson<ApiErrorBody>(baseUrl, '/api/leave-balances/opening', {
        employeeId: employee.id,
        year: '2026-01',
        leaveType: 'annual',
        days: 5,
        occurredOn: '2026-01-01',
        notes: 'سنة خاطئة',
      });
      assert.equal(badYear.status, 400);
      const negative = await postJson<ApiErrorBody>(baseUrl, '/api/leave-balances/opening', {
        employeeId: employee.id,
        year: '2026',
        leaveType: 'annual',
        days: -3,
        occurredOn: '2026-01-01',
        notes: 'أيام سالبة',
      });
      assert.equal(negative.status, 400);
    });

    it('الافتتاح الثاني لنفس الرصيد ⇒ 409 بلا تغيير صامت', async () => {
      const employee = await newEmployee(suite.context);
      const body = {
        employeeId: employee.id,
        year: '2026',
        leaveType: 'annual',
        days: 3,
        occurredOn: '2026-01-01',
        notes: 'أول نقطة',
      };
      assert.equal((await postJson(baseUrl, '/api/leave-balances/opening', body)).status, 201);
      const second = await postJson<ApiErrorBody>(baseUrl, '/api/leave-balances/opening', {
        ...body,
        days: 50,
        notes: 'نقطة ثانية',
      });
      assert.equal(second.status, 409);
      const balance = await getJson<BalanceBody[]>(
        baseUrl,
        `/api/leave-balances?employeeId=${employee.id}&year=2026`,
      );
      assert.equal(balance.body[0].annualBalance, 3, 'الرصيد لم يتغيّر صامتاً');
    });
  });

  describe('الزمنيات عبر HTTP (§14.3/§14.4/§14.5)', () => {
    it('المدة تُحسب من الأوقات وتُخزَّن، ولا تُرسل من العميل', async () => {
      const employee = await newEmployee(suite.context);
      const created = await postJson<TimePermissionResultBody>(
        baseUrl,
        '/api/time-permissions',
        {
          employeeId: employee.id,
          date: '2026-05-04',
          timeOut: '08:00',
          timeIn: '15:00',
          status: 'approved',
        },
      );
      assert.equal(created.status, 201);
      assert.equal(created.body.record.durationMinutes, 420, '7 ساعات = 420 دقيقة');
      assert.equal(created.body.coveredEmergencyDays, 1, '420 ⇒ يوم طارئ');
    });

    it('رفض إرسال durationMinutes من العميل (المدة محسوبة لا مرسلة)', async () => {
      const employee = await newEmployee(suite.context);
      const response = await postJson<ApiErrorBody>(baseUrl, '/api/time-permissions', {
        employeeId: employee.id,
        date: '2026-05-05',
        timeOut: '08:00',
        timeIn: '15:00',
        durationMinutes: 420,
        status: 'approved',
      });
      assert.equal(response.status, 400, 'الحقل لم يعد مقبولاً من العميل');
    });

    it('مثال الخطة: 16 ساعة ⇒ يومان + ساعتان remainder', async () => {
      const employee = await newEmployee(suite.context);
      const created = await postJson<TimePermissionResultBody>(
        baseUrl,
        '/api/time-permissions',
        {
          employeeId: employee.id,
          date: '2026-05-06',
          timeOut: '07:00',
          timeIn: '23:00',
          status: 'approved',
        },
      );
      assert.equal(created.status, 201);
      assert.equal(created.body.coveredEmergencyDays, 2);
      assert.equal(created.body.remainderMinutes, 120);
    });

    it('تجاوز 4 ساعات أسبوعياً: المؤشر يُعاد والتسجيل لا يُرفض (§14.4)', async () => {
      const employee = await newEmployee(suite.context);
      const first = await postJson<TimePermissionResultBody>(
        baseUrl,
        '/api/time-permissions',
        {
          employeeId: employee.id,
          date: '2026-05-04',
          timeOut: '08:00',
          timeIn: '12:00',
          status: 'approved',
        },
      );
      assert.equal(first.status, 201);
      assert.equal(first.body.exceedsWeeklyLimit, false);
      const second = await postJson<TimePermissionResultBody>(
        baseUrl,
        '/api/time-permissions',
        {
          employeeId: employee.id,
          date: '2026-05-06',
          timeOut: '08:00',
          timeIn: '13:00',
          status: 'approved',
        },
      );
      assert.equal(second.status, 201, 'التجاوز لا يمنع التسجيل');
      assert.equal(second.body.exceedsWeeklyLimit, true);
      const list = await getJson<{ record: { id: string } }[]>(
        baseUrl,
        `/api/time-permissions?employeeId=${employee.id}`,
      );
      assert.equal(list.body.length, 2, 'التجاوز لا يحذف السجلات');
    });
  });

    describe('الإجازات والرصيد (§14.1/§14.7/§14.8/§14.9/§15)', () => {
    it('إنشاء إجازة اعتيادية يخصم من الرصيد ويعيده في الاستجابة', async () => {
      const employee = await newEmployee(suite.context, { joinedDate: '2026-01-01' });
      await postJson(baseUrl, '/api/leave-balances/opening', {
        employeeId: employee.id,
        year: '2026',
        leaveType: 'annual',
        days: 10,
        occurredOn: '2026-01-01',
        notes: 'نقطة بداية',
      });
      const created = await postJson<LeaveResultBody>(baseUrl, '/api/leaves', {
        employeeId: employee.id,
        type: 'annual',
        startDate: '2026-06-01',
        endDate: '2026-06-03',
        days: 3,
        status: 'approved',
      });
      assert.equal(created.status, 201);
      assert.equal(created.body.balance?.annualBalance, 7, '10 − 3');
    });

    it('نقص الرصيد ⇒ بدون راتب لا رفض (§14.10)', async () => {
      const employee = await newEmployee(suite.context, { joinedDate: '2026-01-01' });
      const created = await postJson<LeaveResultBody>(baseUrl, '/api/leaves', {
        employeeId: employee.id,
        type: 'annual',
        startDate: '2026-06-01',
        endDate: '2026-06-10',
        days: 10,
        status: 'approved',
      });
      assert.equal(created.status, 201, 'النقص لا يمنع التسجيل');
      assert.equal(created.body.balance?.annualBalance, 0);
      assert.equal(created.body.balance?.unpaidDays, 10);
    });

    it('الإلغاء: حالة السجل تتغيّر والحركة العكسية تُسجَّل مرتبطة (§15)', async () => {
      const employee = await newEmployee(suite.context, { joinedDate: '2026-01-01' });
      await postJson(baseUrl, '/api/leave-balances/opening', {
        employeeId: employee.id,
        year: '2026',
        leaveType: 'annual',
        days: 10,
        occurredOn: '2026-01-01',
        notes: 'نقطة بداية',
      });
      const created = await postJson<LeaveResultBody>(baseUrl, '/api/leaves', {
        employeeId: employee.id,
        type: 'annual',
        startDate: '2026-06-01',
        endDate: '2026-06-03',
        days: 3,
        status: 'approved',
      });
      const leaveId = created.body.leave.id;
      const cancelled = await postJson<LeaveResultBody>(
        baseUrl,
        `/api/leaves/${leaveId}/cancel`,
      );
      assert.equal(cancelled.status, 200);
      assert.equal(cancelled.body.leave.status, 'cancelled');
      assert.equal(cancelled.body.balance?.annualBalance, 10, 'العكس أعاد الرصيد');

      const ledger = await getJson<LedgerBody[]>(
        baseUrl,
        `/api/leave-ledger?employeeId=${employee.id}`,
      );
      const original = ledger.body.find((entry) => entry.movementType === 'deduction');
      const reversal = ledger.body.find((entry) => entry.movementType === 'cancellation');
      assert.ok(original !== undefined, 'الحركة الأصلية محفوظة');
      assert.ok(reversal !== undefined, 'الحركة العكسية موجودة');
      assert.equal(reversal.reversesLedgerId, original.id, 'رابط الأصل بالعكس');
    });

    it('الحج: أول استخدام ناجح، والثاني 409 (§14.7)', async () => {
      const employee = await newEmployee(suite.context, { joinedDate: '2026-01-01' });
      const first = await postJson<LeaveResultBody>(baseUrl, '/api/leaves', {
        employeeId: employee.id,
        type: 'hajj',
        startDate: '2026-05-01',
        endDate: '2026-05-10',
        days: 10,
        status: 'approved',
      });
      assert.equal(first.status, 201);
      const second = await postJson<ApiErrorBody>(baseUrl, '/api/leaves', {
        employeeId: employee.id,
        type: 'hajj',
        startDate: '2027-05-01',
        endDate: '2027-05-10',
        days: 10,
        status: 'approved',
      });
      assert.equal(second.status, 409);
    });

    it('العمرة: أول استخدام ثم رفض الثاني (§14.8)', async () => {
      const employee = await newEmployee(suite.context, { joinedDate: '2026-01-01' });
      assert.equal(
        (await postJson(baseUrl, '/api/leaves', {
          employeeId: employee.id,
          type: 'umrah',
          startDate: '2026-06-01',
          endDate: '2026-06-05',
          days: 5,
          status: 'approved',
        })).status,
        201,
      );
      assert.equal(
        (await postJson<ApiErrorBody>(baseUrl, '/api/leaves', {
          employeeId: employee.id,
          type: 'umrah',
          startDate: '2027-06-01',
          endDate: '2027-06-05',
          days: 5,
          status: 'approved',
        })).status,
        409,
      );
    });

    it('الدراسية: تُسجَّل بلا رصيد تلقائي (§14.9)', async () => {
      const employee = await newEmployee(suite.context, { joinedDate: '2026-01-01' });
      const created = await postJson<LeaveResultBody>(baseUrl, '/api/leaves', {
        employeeId: employee.id,
        type: 'study',
        startDate: '2026-09-01',
        endDate: '2026-09-10',
        days: 10,
        status: 'approved',
      });
      assert.equal(created.status, 201);
      assert.equal(created.body.leave.type, 'study');
      assert.equal(created.body.balance, null, 'لا رصيد مخترَع للدراسية');
    });
  });

  describe('لا مسار لتغيير رقم الرصيد مباشرة (§15)', () => {
    it('PATCH على الأرصدة غير موجود (405/404) — الكتابة عبر حركات فقط', async () => {
      const employee = await newEmployee(suite.context);
      const response = await patchJson<ApiErrorBody>(
        baseUrl,
        `/api/leave-balances/${employee.id}`,
        { annualBalance: 999 },
      );
      assert.ok(response.status === 404 || response.status === 405);
    });
  });
});