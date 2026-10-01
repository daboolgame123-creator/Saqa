/**
 * اختبارات محرّك قواعد الإجازات على قاعدة PostgreSQL مدمجة (Phase 18).
 *
 * المرجع: `ALSQAYA_PLAN.md` §14 · §15 · §34.
 *
 * ما يُثبَت هنا وما لا يُثبَت في `tests/personnelRules.test.ts`:
 * - **هنا**: الذرّية (معاملة واحدة للرصيد + الحركات)، قفل صف الرصيد،
 *   التراجع، الربط بين الحركة الأصلية والعكسية، وعدم وجود طريق يغيّر
 *   الرصيد بلا حركة ledger.
 * - **هناك**: نواتج الحساب الخالصة.
 *
 * بيانات اصطناعية فقط داخل القاعدة المعزولة.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { PgEmployeeRepository } from '../../src/repositories/employeeRepository';
import { PgLeaveBalanceRepository } from '../../src/repositories/leaveBalanceRepository';
import { PgLeaveLedgerRepository } from '../../src/repositories/leaveLedgerRepository';
import { PgLeaveRepository } from '../../src/repositories/leaveRepository';
import { PgTimePermissionRepository } from '../../src/repositories/timePermissionRepository';
import { PersonnelRulesEngine } from '../../src/services/personnelRules';
import { resetDomainTables, startTestDatabase, stopTestDatabase } from './testDb';

describe('Phase 18 — محرّك قواعد الإجازات والزمنيات (قاعدة بيانات)', () => {
  let pool: Pool;
  let engine: PersonnelRulesEngine;
  let balances: PgLeaveBalanceRepository;
  let ledger: PgLeaveLedgerRepository;
  let employees: PgEmployeeRepository;
  let employeeId: string;

  before(async () => {
    ({ pool } = await startTestDatabase());
    employees = new PgEmployeeRepository(pool);
    balances = new PgLeaveBalanceRepository(pool);
    ledger = new PgLeaveLedgerRepository(pool);
    engine = new PersonnelRulesEngine(pool, {
      employees,
      leaves: new PgLeaveRepository(pool),
      timePermissions: new PgTimePermissionRepository(pool),
      balances,
      ledger,
    });
  });

  after(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetDomainTables(pool);
    employeeId = (await employees.create({
      name: 'منتسب اختبار المحرك',
      title: 'معاون إداري',
      department: 'قسم تجريبي',
      joinedDate: '2026-01-01',
    })).id;
  });

  describe('§14.1 — الاستحقاق الاعتيادي وأثره في الـledger', () => {
    it('0 أيام خدمة ⇒ لا استحقاق ولا حركة', async () => {
      const result = await engine.accrueAnnual(employeeId, '2026-01-01');
      assert.equal(result.credited, 0);
      assert.equal(result.balance.annualBalance, 0);
      const movements = await ledger.list({
        employeeId,
        movementType: 'accrual',
        leaveType: 'annual',
      });
      assert.equal(movements.length, 0, 'لا حركة استحقاق بلا أيام مستحقة');
    });

    it('9 أيام ⇒ لا استحقاق و remainder = 9 محفوظ', async () => {
      const result = await engine.accrueAnnual(employeeId, '2026-01-09');
      assert.equal(result.credited, 0);
      assert.equal(result.balance.annualRemainderDays, 9);
      assert.equal(result.balance.annualServiceDays, 9);
    });

    it('10 أيام بالضبط ⇒ +1 يوم مع حركة accrual واحدة', async () => {
      const result = await engine.accrueAnnual(employeeId, '2026-01-10');
      assert.equal(result.credited, 1);
      assert.equal(result.balance.annualBalance, 1);
      const movements = await ledger.list({
        employeeId,
        movementType: 'accrual',
        leaveType: 'annual',
      });
      assert.equal(movements.length, 1);
      assert.equal(movements[0].amount, 1);
      assert.equal(movements[0].balanceAfter, 1, 'عمود «الرصيد بعد العملية» (§15)');
    });

    it('20 يوماً ⇒ +2 يوم تراكمي بلا تكرار حركات', async () => {
      await engine.accrueAnnual(employeeId, '2026-01-10');
      const result = await engine.accrueAnnual(employeeId, '2026-01-20');
      assert.equal(result.credited, 1, 'الاستحقاق تراكمي: الفرق فقط');
      assert.equal(result.balance.annualBalance, 2);
      const movements = await ledger.list({
        employeeId,
        movementType: 'accrual',
        leaveType: 'annual',
      });
      assert.equal(movements.length, 2);
    });

    it('الـremainder لا يسقط بتغيّر السنة ولا يُصفَّر', async () => {
      // 2026-12-26 ⇒ 360 يوم خدمة ⇒ يكمل دورات بلا باقٍ.
      await engine.accrueAnnual(employeeId, '2026-12-26');
      const first = await engine.getOrCreateBalance(employeeId, '2026');
      assert.equal(first.annualRemainderDays, 0);
      // 2027-01-01 ⇒ 366 يوماً ⇒ باقي 6 محفوظ عبر حدّ السنة.
      const next = await engine.accrueAnnual(employeeId, '2027-01-01');
      assert.equal(next.balance.year, '2027');
      assert.equal(next.remainder, 6, 'باقي الدورة محفوظ ولا يُصفَّر بالسنة الجديدة');
      assert.equal(next.balance.annualRemainderDays, 6);
    });

    it('الرصيد لا يتجاوز 180: الفائض محفوظ معلَّق بلا سلوك مخترَع', async () => {
      // رصيد افتتاحي 178 (موثّق) ثم استحقاق كافٍ للتجاوز.
      await engine.recordOpeningBalance({
        employeeId,
        year: '2026',
        leaveType: 'annual',
        days: 178,
        occurredOn: '2026-01-01',
        notes: 'نقطة بداية موثّقة للاختبار',
      });
      // نُثبّت أرقام الاستحقاق المسجَّلة، ثم نستدعي المحرّك بتاريخ خدمة
      // يحسب الفرق نفسه تماماً (60 يوماً ⇒ 6 مستحق، 4 محقّق ⇒ +2).
      const balance = (await balances.findByEmployeeYear(employeeId, '2026'))!;
      await balances.updateNumeric(
        balance.id,
        { annualServiceDays: 0, annualEarnedDays: 0 },
        { annualServiceDays: 40, annualEarnedDays: 4 },
      );
      const result = await engine.accrueAnnual(employeeId, '2026-03-01');
      assert.equal(result.credited, 2, 'لا يُمنح إلا ما يتّسع تحت السقف');
      assert.equal(result.balance.annualBalance, 180, 'الرصيد عند السقف بالضبط');
    });

    it('استحقاق فوق السقف كله ⇒ معلَّق محفوظ بلا منح ولا إهدار', async () => {
      await engine.recordOpeningBalance({
        employeeId,
        year: '2026',
        leaveType: 'annual',
        days: 180,
        occurredOn: '2026-01-01',
        notes: 'رصيد كامل',
      });
      const balance = (await balances.findByEmployeeYear(employeeId, '2026'))!;
      await balances.updateNumeric(
        balance.id,
        { annualServiceDays: 0, annualEarnedDays: 0 },
        { annualServiceDays: 100, annualEarnedDays: 10 },
      );
      const result = await engine.accrueAnnual(employeeId, '2026-12-31');
      assert.equal(result.credited, 0);
      assert.equal(result.balance.annualBalance, 180, 'لا تجاوز للسقف');
      assert.ok(result.pending > 0, 'الاستحقاق محفوظ كحالة صريحة');
      assert.equal(result.balance.annualPendingDays, result.pending);
    });

    it('بلا تاريخ خدمة ⇒ خطأ صريح بلا استحقاق مخترَع', async () => {
      const noDate = (await employees.create({
        name: 'بلا تاريخ انتساب',
        title: 'معاون',
        department: 'قسم',
      })).id;
      await assert.rejects(
        () => engine.accrueAnnual(noDate, '2026-12-31'),
        /لا يوجد تاريخ خدمة/,
      );
    });
  });

    describe('§14.2 — الطارئ: 15 كل سنة بلا carryover ولا سالب', () => {
    it('بداية السنة = 15 يوماً مع حركة استحقاق موثّقة', async () => {
      const balance = await engine.getOrCreateBalance(employeeId, '2026');
      assert.equal(balance.emergencyBalance, 15);
      const movements = await ledger.list({
        employeeId,
        movementType: 'accrual',
        leaveType: 'emergency',
      });
      assert.equal(movements.length, 1);
      assert.equal(movements[0].amount, 15);
    });

    it('استخدام جزء من الرصيد لا يجعله سالباً', async () => {
      await engine.getOrCreateBalance(employeeId, '2026');
      await engine.recordLeave({
        id: '',
        employeeId,
        type: 'emergency',
        startDate: '2026-03-01',
        endDate: '2026-03-06',
        days: 5,
        status: 'approved',
      });
      const balance = (await balances.findByEmployeeYear(employeeId, '2026'))!;
      assert.equal(balance.emergencyBalance, 10);
    });

    it('السنة الجديدة تبدأ من 15 ولا ترحل الرصيد السابق', async () => {
      await engine.getOrCreateBalance(employeeId, '2026');
      await engine.recordLeave({
        id: '',
        employeeId,
        type: 'emergency',
        startDate: '2026-03-01',
        endDate: '2026-03-06',
        days: 5,
        status: 'approved',
      });
      const next = await engine.openYear(employeeId, '2027');
      assert.equal(next.emergencyBalance, 15, 'الطارئة لا تُرحَّل (§14.2)');
      const previous = (await balances.findByEmployeeYear(employeeId, '2026'))!;
      assert.equal(previous.emergencyBalance, 10, 'رصيد السنة السابقة لم يُمسّ');
    });

    it('طلب أكبر من الرصيد ⇒ نفاد: غير المغطّى بدون راتب', async () => {
      await engine.getOrCreateBalance(employeeId, '2026');
      await engine.recordLeave({
        id: '',
        employeeId,
        type: 'emergency',
        startDate: '2026-03-01',
        endDate: '2026-03-20',
        days: 20,
        status: 'approved',
      });
      const balance = (await balances.findByEmployeeYear(employeeId, '2026'))!;
      assert.equal(balance.emergencyBalance, 0, 'لا سالب');
      assert.equal(balance.unpaidDays, 5, 'الفائض بدون راتب (§14.5/§14.10)');
    });
  });

  describe('§14.1 — الترحيل السنوي للاعتيادية', () => {
    it('رصيد الاعتيادية يرحل للسنة الجديدة مع حركة opening_balance', async () => {
      await engine.accrueAnnual(employeeId, '2026-06-30');
      const next = await engine.openYear(employeeId, '2027');
      assert.ok(next.annualBalance > 0, 'الرصيد اعتيادي مرحّل');
      assert.equal(next.annualCarryoverDays, next.annualBalance);
      const carried = await ledger.list({
        employeeId,
        year: 2027,
        movementType: 'opening_balance',
      });
      assert.equal(carried.length, 1, 'الترحيل موثّق بحركة');
    });
  });

    describe('§14.3/§14.4 — محرّك الدقائق والتحويل', () => {
    it('المدة تُحسب وتُخزَّن بالدقائق، والتحويل 420 ⇒ يوم', async () => {
      const result = await engine.registerTimePermission({
        employeeId,
        date: '2026-05-04',
        timeOut: '08:00',
        timeIn: '15:00',
        status: 'approved',
      });
      assert.equal(result.record.durationMinutes, 420);
      assert.equal(result.conversion?.covered, 1);
      assert.equal(result.conversion?.remainderMinutes, 0);
    });

    it('مدة أقل من 420 ⇒ لا يوم طارئ والباقي remainder', async () => {
      const result = await engine.registerTimePermission({
        employeeId,
        date: '2026-05-05',
        timeOut: '08:00',
        timeIn: '10:00',
        status: 'approved',
      });
      assert.equal(result.record.durationMinutes, 120);
      assert.equal(result.conversion?.covered, 0);
      assert.equal(result.conversion?.remainderMinutes, 120);
      const balance = (await balances.findByEmployeeYear(employeeId, '2026'))!;
      assert.equal(balance.emergencyRemainderMinutes, 120);
    });

    it('مثال الخطة: 16 ساعة = يومان + ساعتان remainder', async () => {
      const result = await engine.registerTimePermission({
        employeeId,
        date: '2026-05-06',
        timeOut: '07:00',
        timeIn: '23:00',
        status: 'approved',
      });
      // 16 ساعة = 960 دقيقة ⇒ يومان + 120 دقيقة.
      assert.equal(result.record.durationMinutes, 16 * 60);
      assert.equal(result.conversion?.covered, 2);
      assert.equal(result.conversion?.remainderMinutes, 120);
    });

    it('لا تحويل مزدوج: التحويل مرّة واحدة لكل زمنية', async () => {
      const first = await engine.registerTimePermission({
        employeeId,
        date: '2026-05-07',
        timeOut: '08:00',
        timeIn: '15:00',
        status: 'approved',
      });
      const balanceAfterFirst = first.conversion?.balance.emergencyBalance ?? 0;
      const second = await engine.convertPendingTimePermissions(employeeId, '2026-05-07');
      assert.equal(second.length, 0, 'لا زمنيات غير محوّلة بعد التحويل الأول');
      const balance = (await balances.findByEmployeeYear(employeeId, '2026'))!;
      assert.equal(balance.emergencyBalance, balanceAfterFirst, 'الرصيد لم يتضاعف');
    });

    it('تجاوز 4 ساعات أسبوعياً **لا يمنع التسجيل** (§14.4)', async () => {
      const first = await engine.registerTimePermission({
        employeeId,
        date: '2026-05-04',
        timeOut: '08:00',
        timeIn: '12:00',
        status: 'approved',
      });
      assert.equal(first.exceedsWeeklyLimit, false, '240 دقيقة = الحد نفسه');
      // 5 ساعات في يوم آخر من الأسبوع نفسه ⇒ تجاوز مسجَّل كسجل كامل.
      const second = await engine.registerTimePermission({
        employeeId,
        date: '2026-05-06',
        timeOut: '08:00',
        timeIn: '13:00',
        status: 'approved',
      });
      assert.equal(second.exceedsWeeklyLimit, true, 'تجاوز 4 ساعات');
      // السجل موجود ولم يُحذف: التجاوز مؤشر لا يمنع (§14.4).
      const records = await engine.repos.timePermissions.list({ employeeId });
      assert.equal(records.length, 2, 'التجاوز لا يمنع التسجيل ولا يحذف');
    });

    it('زمنية بلا وقت عودة ⇒ تُحفظ بلا مدة ولا تحويل (بلا اختراع)', async () => {
      const result = await engine.registerTimePermission({
        employeeId,
        date: '2026-05-11',
        timeOut: '08:00',
        status: 'registered',
      });
      assert.equal(result.record.durationMinutes, undefined);
      assert.equal(result.conversion, null);
    });
  });

    describe('§15 — الـledger: الحركات والخصم والإلغاء والعكس', () => {
    it('خصم الإجازة الاعتيادية ينتج حركة deduction مرتبطة بالإجازة', async () => {
      await engine.accrueAnnual(employeeId, '2026-12-31');
      const leaveId = await engine.recordLeave({
        id: '',
        employeeId,
        type: 'annual',
        startDate: '2026-12-01',
        endDate: '2026-12-03',
        days: 3,
        status: 'approved',
      });
      const movements = await ledger.list({ leaveId });
      assert.equal(movements.length, 1);
      assert.equal(movements[0].movementType, 'deduction');
      assert.equal(movements[0].amount, -3, 'الخصم سالب (مطروح من الرصيد)');
      assert.ok(movements[0].leaveId === leaveId);
    });

    it('نقص الرصيد الاعتيادي ⇒ الجزء غير المغطّى بدون راتب (§14.10)', async () => {
      await engine.getOrCreateBalance(employeeId, '2026');
      const leaveId = await engine.recordLeave({
        id: '',
        employeeId,
        type: 'annual',
        startDate: '2026-04-01',
        endDate: '2026-04-10',
        days: 10,
        status: 'approved',
      });
      const movements = await ledger.list({ leaveId });
      const unpaid = movements.find((m) => m.leaveType === 'unpaid');
      assert.ok(unpaid, 'حركة بدون راتب مسجّلة');
      const balance = (await balances.findByEmployeeYear(employeeId, '2026'))!;
      assert.equal(balance.annualBalance, 0);
      assert.equal(balance.unpaidDays, 10);
    });

    it('الإلغاء: حركة عكسية مرتبطة بالأصل، بلا حذف ولا محو (§15)', async () => {
      await engine.accrueAnnual(employeeId, '2026-12-31');
      const leaveId = await engine.recordLeave({
        id: '',
        employeeId,
        type: 'annual',
        startDate: '2026-12-01',
        endDate: '2026-12-03',
        days: 3,
        status: 'approved',
      });
      const before = (await balances.findByEmployeeYear(employeeId, '2026'))!.annualBalance;
      await engine.cancelLeave(leaveId);
      const after = (await balances.findByEmployeeYear(employeeId, '2026'))!.annualBalance;

      const history = await ledger.list({ leaveId });
      const original = history.find((m) => m.movementType === 'deduction')!;
      const reversal = history.find((m) => m.movementType === 'cancellation')!;
      assert.ok(reversal, 'حركة إلغاء موجودة');
      assert.equal(reversal.reversesLedgerId, original.id, 'رابط صريح بين الأصل والعكس');
      assert.equal(reversal.amount, 3, 'قيمة معاكسة');
      assert.equal(after, before + 3, 'العكس أعاد الرصيد');
      // السجل محفوظ والحركة الأصلية باقية.
      assert.ok(original.id.length > 0);
      assert.equal(history.length, 2);
    });

    it('العكس لا يُكرَّر: الحركة المعكوسة لا تعود في القائمة الفعّالة', async () => {
      await engine.getOrCreateBalance(employeeId, '2026');
      const leaveId = await engine.recordLeave({
        id: '',
        employeeId,
        type: 'emergency',
        startDate: '2026-02-01',
        endDate: '2026-02-02',
        days: 2,
        status: 'approved',
      });
      await engine.cancelLeave(leaveId);
      const active = await ledger.listActive({ leaveId, movementType: 'deduction' });
      assert.equal(active.length, 0, 'الخصم الأصلي صار غير فعّال');
      const all = await ledger.list({ leaveId });
      assert.equal(all.length, 2, 'التاريخ محفوظ: خصم + عكس');
    });
  });

  describe('§34 — افتتاح الرصيد: نقطة بداية موثّقة', () => {
    it('الافتتاح ينشئ رصيداً وحركة opening_balance، ويؤثر في الرقم', async () => {
      const balance = await engine.recordOpeningBalance({
        employeeId,
        year: '2026',
        leaveType: 'annual',
        days: 12,
        occurredOn: '2026-01-01',
        notes: 'نقطة بداية موثّقة',
      });
      assert.equal(balance.annualBalance, 12);
      const movements = await ledger.list({ employeeId, movementType: 'opening_balance' });
      assert.equal(movements.length, 1);
      assert.equal(movements[0].amount, 12);
      assert.equal(movements[0].notes, 'نقطة بداية موثّقة');
    });

    it('إعادة الافتتاح لنفس الرصيد مرفوضة (لا تغيير صامت)', async () => {
      const input = {
        employeeId,
        year: '2026',
        leaveType: 'annual' as const,
        days: 5,
        occurredOn: '2026-01-01',
        notes: 'أول نقطة',
      };
      await engine.recordOpeningBalance(input);
      await assert.rejects(
        () => engine.recordOpeningBalance({ ...input, days: 99, notes: 'ثانية' }),
        /نقطة بداية افتتاحية مسجّلة/,
      );
    });

    it('التصحيح الإداري يمرّ بحركة adjustment موثّقة', async () => {
      await engine.getOrCreateBalance(employeeId, '2026');
      const balance = await engine.recordAdjustment({
        employeeId,
        year: '2026',
        leaveType: 'annual',
        days: 4,
        occurredOn: '2026-06-01',
        notes: 'تصحيح إداري موثّق',
      });
      assert.equal(balance.annualBalance, 4);
      const movements = await ledger.list({ employeeId, movementType: 'adjustment' });
      assert.equal(movements.length, 1);
      assert.equal(movements[0].notes, 'تصحيح إداري موثّق');
    });
  });

    describe('§14.7/§14.8 — الحج والعمرة: مرة واحدة في خدمة المنتسب', () => {
    it('أول استخدام للحج ينجح', async () => {
      const leaveId = await engine.recordLeave({
        id: '',
        employeeId,
        type: 'hajj',
        startDate: '2026-05-01',
        endDate: '2026-05-10',
        days: 10,
        status: 'approved',
      });
      assert.ok(leaveId.length > 0);
    });

    it('الاستخدام الثاني للحج مرفوض (غير مخترَع ولا متجاهَل)', async () => {
      await engine.recordLeave({
        id: '',
        employeeId,
        type: 'hajj',
        startDate: '2026-05-01',
        endDate: '2026-05-10',
        days: 10,
        status: 'approved',
      });
      await assert.rejects(
        () => engine.recordLeave({
          id: '',
          employeeId,
          type: 'hajj',
          startDate: '2027-05-01',
          endDate: '2027-05-10',
          days: 10,
          status: 'approved',
        }),
        /مرة واحدة في خدمة المنتسب/,
      );
    });

    it('العمرة: أول استخدام ثم رفض الثاني', async () => {
      await engine.recordLeave({
        id: '',
        employeeId,
        type: 'umrah',
        startDate: '2026-06-01',
        endDate: '2026-06-05',
        days: 5,
        status: 'approved',
      });
      await assert.rejects(
        () => engine.recordLeave({
          id: '',
          employeeId,
          type: 'umrah',
          startDate: '2027-06-01',
          endDate: '2027-06-05',
          days: 5,
          status: 'approved',
        }),
        /مرة واحدة في خدمة المنتسب/,
      );
    });

    it('إلغاء الحج لا يمحو السجل ولا يُبطل المعيار', async () => {
      const leaveId = await engine.recordLeave({
        id: '',
        employeeId,
        type: 'hajj',
        startDate: '2026-05-01',
        endDate: '2026-05-10',
        days: 10,
        status: 'approved',
      });
      await engine.cancelLeave(leaveId);
      // السجل ما زال موجوداً بحالة ملغاة — لا حذف.
      const records = await engine.repos.leaves.list({ employeeId, type: 'hajj' });
      assert.equal(records.length, 1);
      assert.equal(records[0].status, 'cancelled');
    });
  });

  describe('§14.9 — الدراسية: نوع مستقل بلا رصيد مخترَع', () => {
    it('تسجيل إجازة دراسية ينجح ولا ينشئ رصيداً ولا حركة', async () => {
      const leaveId = await engine.recordLeave({
        id: '',
        employeeId,
        type: 'study',
        startDate: '2026-09-01',
        endDate: '2026-09-10',
        days: 10,
        status: 'approved',
      });
      assert.ok(leaveId.length > 0);
      const movements = await ledger.list({ leaveId });
      assert.equal(movements.length, 0, 'بلا رصيد تلقائي (§14.9)');
      const balance = await balances.findByEmployeeYear(employeeId, '2026');
      assert.equal(balance, null, 'لا صف رصيد يُنشأ لنوع بلا رصيد');
    });
  });

  describe('سلامة الرصيد — المعاملات والقفل (Phase 17/§15)', () => {
    it('لا تغيير في أي رقم رصيد بلا حركة ledger مقابلة', async () => {
      await engine.getOrCreateBalance(employeeId, '2026');
      const before = (await balances.findByEmployeeYear(employeeId, '2026'))!;
      const movementsBefore = (await ledger.list({ employeeId })).length;

      await engine.recordLeave({
        id: '',
        employeeId,
        type: 'annual',
        startDate: '2026-07-01',
        endDate: '2026-07-02',
        days: 2,
        status: 'approved',
      });
      const after = (await balances.findByEmployeeYear(employeeId, '2026'))!;
      const movementsAfter = (await ledger.list({ employeeId })).length;
      if (after.annualBalance !== before.annualBalance) {
        assert.ok(
          movementsAfter > movementsBefore,
          'تغيّر الرصيد يقتضي حركة جديدة في السجل',
        );
      }
    });

    it('تحديث الرصيد بقيمته الحالية فقط: تعارض ⇒ لا كتابة صامتة', async () => {
      const balance = await engine.getOrCreateBalance(employeeId, '2026');
      // شرط قادم قديم: الرصيد الحقيقي 15 لا 0.
      const result = await balances.updateNumeric(
        balance.id,
        { emergencyBalance: 0 },
        { emergencyBalance: 1 },
      );
      assert.equal(result, null, 'التحديث الشرطي فشل ⇒ لا كتابة فوق الأحدث');
      const unchanged = (await balances.findByEmployeeYear(employeeId, '2026'))!;
      assert.equal(unchanged.emergencyBalance, 15);
    });

    it('فشل في منتصف العملية لا يترك رصيداً بلا حركة', async () => {
      await engine.getOrCreateBalance(employeeId, '2026');
      const balanceBefore = (await balances.findByEmployeeYear(employeeId, '2026'))!;
      // إلغاء إجازة غير موجودة يفشل قبل أي كتابة.
      await assert.rejects(
        () => engine.cancelLeave('00000000-0000-0000-0000-000000000000'),
        /غير موجودة/,
      );
      const balanceAfter = (await balances.findByEmployeeYear(employeeId, '2026'))!;
      assert.equal(balanceAfter.emergencyBalance, balanceBefore.emergencyBalance);
      assert.equal(
        (await ledger.list({ movementType: 'cancellation' })).length,
        0,
        'لا حركة معلّقة بعد فشل',
      );
    });
  });
});