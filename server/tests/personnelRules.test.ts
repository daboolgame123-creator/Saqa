/**
 * اختبارات قواعد الإجازات والزمنيات الخالصة (Phase 18 — §14/§34).
 *
 * هذه الدوال **بلا قاعدة بيانات وبلا I/O**: هي نواتج الحساب في
 * `server/src/services/personnelRules.ts`، واختبارها هنا يثبت القواعد
 * نفسها لا مساراً تقنياً. الفحص على القاعدة (المعاملات والـledger) في
 * `db/leaveRulesEngine.test.ts`، وعلى HTTP في `api/leaveRules.test.ts`.
 *
 * لا React هنا ولا في أي مكان: المحرك منفصل عن الواجهة (§34).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ANNUAL_BALANCE_CAP,
  ANNUAL_SERVICE_DAYS_PER_DAY,
  EMERGENCY_DAYS_PER_YEAR,
  HAJJ_DAYS_ONCE,
  MINUTES_PER_EMERGENCY_DAY,
  SICK_FULL_BAND_DAYS,
  SICK_REDUCED_BAND_DAYS,
  UMRAH_DAYS_ONCE,
  WEEKLY_LIMIT_MINUTES,
  annualAccrualFromServiceDays,
  applyAnnualCap,
  computeDurationMinutes,
  consumesBalance,
  daysBetweenInclusive,
  isOncePerService,
  minutesToEmergencyDays,
  serviceDaysUntil,
  sickBandSplit,
  splitEmergencyConversion,
  weekRange,
  weeklyLimitExceeded,
  yearOf,
} from '../src/services/personnelRules';

describe('Phase 18 — الثوابت المعتمدة من §14', () => {
  it('كل رقم من نصّه في الخطة: 10 · 180 · 15 · 420 · 4 ساعات · 45/45 · 30 · 12', () => {
    assert.equal(ANNUAL_SERVICE_DAYS_PER_DAY, 10);
    assert.equal(ANNUAL_BALANCE_CAP, 180);
    assert.equal(EMERGENCY_DAYS_PER_YEAR, 15);
    assert.equal(MINUTES_PER_EMERGENCY_DAY, 420);
    assert.equal(WEEKLY_LIMIT_MINUTES, 240);
    assert.equal(SICK_FULL_BAND_DAYS, 45);
    assert.equal(SICK_REDUCED_BAND_DAYS, 45);
    assert.equal(HAJJ_DAYS_ONCE, 30);
    assert.equal(UMRAH_DAYS_ONCE, 12);
  });
});

describe('Phase 18 — §14.1 الاستحقاق: كل 10 أيام خدمة = +1 يوم', () => {
  it('0 أيام خدمة ⇒ لا استحقاق ولا remainder', () => {
    assert.deepEqual(annualAccrualFromServiceDays(0), { earned: 0, remainder: 0 });
  });

  it('أقل من 10 (9 أيام) ⇒ لا استحقاق و remainder محفوظ', () => {
    assert.deepEqual(annualAccrualFromServiceDays(9), { earned: 0, remainder: 9 });
  });

  it('10 أيام بالضبط ⇒ +1 يوم و remainder صفر', () => {
    assert.deepEqual(annualAccrualFromServiceDays(10), { earned: 1, remainder: 0 });
  });

  it('20 يوماً بالضبط ⇒ +2 يوم', () => {
    assert.deepEqual(annualAccrualFromServiceDays(20), { earned: 2, remainder: 0 });
  });

  it('الـremainder لا يسقط مع دورة جديدة (10⇒1/0 · 15⇒1/5 · 19⇒1/9 · 20⇒2/0)', () => {
    assert.deepEqual(annualAccrualFromServiceDays(15), { earned: 1, remainder: 5 });
    assert.deepEqual(annualAccrualFromServiceDays(19), { earned: 1, remainder: 9 });
    // الانتقال من 19 إلى 20 لا يفقد الـ9 ولا يحسبها مرتين: +1 فقط.
    assert.deepEqual(annualAccrualFromServiceDays(20), { earned: 2, remainder: 0 });
  });

  it('أيام الخدمة محسوبة من تاريخ الانتساب شاملةً', () => {
    assert.equal(serviceDaysUntil('2026-01-01', '2026-01-01'), 1, 'يوم الانتساب نفسه يوم خدمة');
    assert.equal(serviceDaysUntil('2026-01-01', '2026-01-10'), 10);
    assert.equal(serviceDaysUntil('2026-01-01', '2026-01-11'), 11);
    // 2028 سنة كبيسة: 28 فبراير → 1 مارس = ثلاثة أيام شاملة الطرفين.
    assert.equal(daysBetweenInclusive('2028-02-28', '2028-03-01'), 3);
    assert.equal(daysBetweenInclusive('2026-02-28', '2026-03-01'), 2);
  });

  it('تاريخ غير صالح يرمي خطأً واضحاً بدل رقم مخترَع', () => {
    assert.throws(() => serviceDaysUntil('غير-تاريخ', '2026-01-10'), /تاريخ غير صالح/);
  });
});

describe('Phase 18 — §14.1 سقف 180: حالة صريحة بلا سلوك مخترَع', () => {
  it('رصيد أقل من السقف يستوعب الاستحقاق كاملاً', () => {
    assert.deepEqual(applyAnnualCap(0, 3), { credited: 3, pending: 0 });
    assert.deepEqual(applyAnnualCap(170, 3), { credited: 3, pending: 0 });
    assert.deepEqual(applyAnnualCap(179, 1), { credited: 1, pending: 0 });
  });

  it('تجاوز 180: يُمنح ما يتّسع والباقي **محفوظ** لا ممنوع ولا مهدر', () => {
    // 178 + 5 = 183 ⇒ يُمنح 2 ويبقى 3 معلّقاً. لم يُقرَّر له شيء.
    assert.deepEqual(applyAnnualCap(178, 5), { credited: 2, pending: 3 });
  });

  it('لا يُمنح فائض أصلاً: الرصيد لا يتجاوز 180 مهما كان الاستحقاق', () => {
    assert.deepEqual(applyAnnualCap(180, 99), { credited: 0, pending: 99 });
  });

  it('صفر أو سالب ⇒ لا استحقاق جديد ولا معلَّق', () => {
    assert.deepEqual(applyAnnualCap(10, 0), { credited: 0, pending: 0 });
    assert.deepEqual(applyAnnualCap(10, -3), { credited: 0, pending: 0 });
  });
});

describe('Phase 18 — §14.3 محرك الدقائق: 420 دقيقة = يوم طارئ واحد', () => {
  it('أقل من 420 ⇒ لا يوم، والباقي كله remainder', () => {
    assert.deepEqual(minutesToEmergencyDays(0), { days: 0, remainderMinutes: 0 });
    assert.deepEqual(minutesToEmergencyDays(419), { days: 0, remainderMinutes: 419 });
  });

  it('420 بالضبط ⇒ يوم واحد بلا remainder', () => {
    assert.deepEqual(minutesToEmergencyDays(420), { days: 1, remainderMinutes: 0 });
  });

  it('840 (يومان) بالضبط ⇒ يومان بلا remainder', () => {
    assert.deepEqual(minutesToEmergencyDays(840), { days: 2, remainderMinutes: 0 });
  });

  it('حالة تحويل + remainder معاً (مثال الخطة: 16 ساعة = يومان + ساعتان)', () => {
    // 16 ساعة = 960 دقيقة = 2×420 + 120
    assert.deepEqual(minutesToEmergencyDays(16 * 60), { days: 2, remainderMinutes: 120 });
  });

  it('السالب يُعامَل كأصفار ولا ينتج يوماً سالباً', () => {
    assert.deepEqual(minutesToEmergencyDays(-5), { days: 0, remainderMinutes: 0 });
  });
});

describe('Phase 18 — §14.5 نفاد الطارئ: المتاح أولاً والباقي بدون راتب', () => {
  it('تغطية كاملة حين يكفي الرصيد', () => {
    assert.deepEqual(splitEmergencyConversion(2, 15), { covered: 2, unpaid: 0 });
  });

  it('تغطية جزئية عند نقص الرصيد', () => {
    assert.deepEqual(splitEmergencyConversion(4, 2), { covered: 2, unpaid: 2 });
  });

  it('لا رصيد إطلاقاً ⇒ كل الأيام بدون راتب', () => {
    assert.deepEqual(splitEmergencyConversion(3, 0), { covered: 0, unpaid: 3 });
  });

  it('الرصيد لا يصبح سالباً مهما زاد المطلوب', () => {
    for (const [days, available] of [[10, 3], [180, 0], [5, 1]] as const) {
      const { covered } = splitEmergencyConversion(days, available);
      assert.ok(covered <= available, `المغطّى ${covered} ≤ المتاح ${available}`);
      assert.ok(available - covered >= 0, 'الرصيد لا يصبح سالباً');
    }
  });
});

describe('Phase 18 — §14.6 شرائح المرضية: بلا فترة قياس مفترضة', () => {
  it('1–45 يوم ⇒ 100% بلا نسبة مخفّضة', () => {
    assert.deepEqual(sickBandSplit(1), { fullPaidDays: 1, reducedPaidDays: 0, unpaidDays: 0 });
    assert.deepEqual(sickBandSplit(45), { fullPaidDays: 45, reducedPaidDays: 0, unpaidDays: 0 });
  });

  it('46–90 يوم ⇒ 45 يوماً بشريحة 100% والباقي بشريحة 80%', () => {
    assert.deepEqual(sickBandSplit(46), { fullPaidDays: 45, reducedPaidDays: 1, unpaidDays: 0 });
    assert.deepEqual(sickBandSplit(90), { fullPaidDays: 45, reducedPaidDays: 45, unpaidDays: 0 });
  });

  it('ما بعد 90 ⇒ ما زاد بدون راتب', () => {
    assert.deepEqual(sickBandSplit(91), { fullPaidDays: 45, reducedPaidDays: 45, unpaidDays: 1 });
    assert.deepEqual(sickBandSplit(100), { fullPaidDays: 45, reducedPaidDays: 45, unpaidDays: 10 });
  });

  it('الشرائح لا تتراكم ولا تُصفَّر تلقائياً: الدالة عدّاد صفر بلا حالة', () => {
    // النداء الثاني بنفس العدد يعطي النتيجة نفسها — لا reset ولا تراكم.
    const first = sickBandSplit(50);
    const second = sickBandSplit(50);
    assert.deepEqual(first, second);
    // و50 في «دورة خدمة» جديدة ليست 95 ولا 5: الدالة لا تعرف الدورات.
    assert.deepEqual(sickBandSplit(50), { fullPaidDays: 45, reducedPaidDays: 5, unpaidDays: 0 });
  });

  it('صفر أو سالب ⇒ لا أيام في أي شريحة', () => {
    assert.deepEqual(sickBandSplit(0), { fullPaidDays: 0, reducedPaidDays: 0, unpaidDays: 0 });
    assert.deepEqual(sickBandSplit(-4), { fullPaidDays: 0, reducedPaidDays: 0, unpaidDays: 0 });
  });
});

describe('Phase 18 — §14.4 الحد الأسبوعي: مؤشر لا حاجز', () => {
  it('الحد نفسه 240 دقيقة والتجاوز فوقه فقط', () => {
    assert.equal(weeklyLimitExceeded(239), false);
    assert.equal(weeklyLimitExceeded(240), false, 'بلوغ الحد ليس تجاوزاً');
    assert.equal(weeklyLimitExceeded(241), true);
  });

  it('نطاق الأسبوع: من الإثنين إلى الأحد', () => {
    assert.deepEqual(weekRange('2026-09-09'), { from: '2026-09-07', to: '2026-09-13' });
    assert.deepEqual(weekRange('2026-09-13'), { from: '2026-09-07', to: '2026-09-13' });
    // الأحد ينهي النطاق الذي يبدأ به الإثنين التالي مباشرةً.
    assert.deepEqual(weekRange('2026-09-14'), { from: '2026-09-14', to: '2026-09-20' });
  });
});

describe('Phase 18 — المدة بالدقائق من وقتَي الخروج والعودة (§14.3)', () => {
  it('وقت عودة بعد وقت خروج ⇒ المدة بالدقائق', () => {
    assert.equal(computeDurationMinutes('10:30', '13:00'), 150);
    assert.equal(computeDurationMinutes('08:00', '08:01'), 1);
    assert.equal(computeDurationMinutes('08:00', '16:00'), 480);
  });

  it('غياب وقت العودة ⇒ لا مدة (سجل غير مكتمل، بلا اختراع)', () => {
    assert.equal(computeDurationMinutes('10:30', undefined), undefined);
  });

  it('تجاوز منتصف الليل ⇒ لا مدة ولا سياسة مخترَعة (غير محسومة في الخطة)', () => {
    assert.equal(computeDurationMinutes('22:00', '02:00'), undefined);
    assert.equal(computeDurationMinutes('08:00', '08:00'), undefined);
  });

  it('وقت غير صالح ⇒ لا مدة (لا NaN ولا صفر مخترَع)', () => {
    assert.equal(computeDurationMinutes('aa:bb', '10:00'), undefined);
  });
});

describe('Phase 18 — أنواع الإجازة واستحقاقها', () => {
  it('الدراسية لا تستهلك رصيداً إطلاقاً (§14.9)', () => {
    assert.equal(consumesBalance('study'), false);
    assert.equal(consumesBalance('excuse'), false);
    assert.equal(consumesBalance('maternity'), false);
    assert.equal(consumesBalance('transfer'), false);
    assert.equal(consumesBalance('other'), false);
  });

  it('الاعتيادية والطارئة تستهلكان رصيداً', () => {
    assert.equal(consumesBalance('annual'), true);
    assert.equal(consumesBalance('emergency'), true);
  });

  it('الحج والعمرة «مرة واحدة في خدمة المنتسب» (§14.7/§14.8)', () => {
    assert.equal(isOncePerService('hajj'), true);
    assert.equal(isOncePerService('umrah'), true);
    assert.equal(isOncePerService('annual'), false);
    assert.equal(isOncePerService('study'), false);
  });

  it('سنة التاريخ بصيغة YYYY', () => {
    assert.equal(yearOf('2026-09-25'), '2026');
  });
});