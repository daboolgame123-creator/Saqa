/**
 * اختبارات البنية الأساسية للعمليات المجدولة (Scheduled Operations) — Phase 8.
 * لا تُسجَّل هنا أي وظيفة أعمال؛ الاختبارات تستخدم وظائف تجريبية فقط.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { JobRegistry, JobRunner } from '../src/jobs';
import { TechnicalLogger } from '../src/logging';
import { captureLogs, delay } from './helpers';

describe('سجل الوظائف المجدولة', () => {
  afterEach(() => {
    JobRegistry.clear();
    TechnicalLogger.reset();
  });

  test('يبدأ السجل فارغًا — لا وظائف أعمال في Phase 8', () => {
    assert.deepEqual(JobRegistry.list(), []);
  });

  test('يرفض الأسماء المكررة والفاصل غير الصالح والاسم الفارغ', () => {
    JobRegistry.register({ name: 'probe', intervalMs: 1000, run: () => undefined });

    assert.throws(() => JobRegistry.register({ name: 'probe', intervalMs: 1000, run: () => undefined }), /تسجيل مسبق/);
    assert.throws(() => JobRegistry.register({ name: 'bad-interval', intervalMs: 0, run: () => undefined }), /الفاصل الزمني/);
    assert.throws(() => JobRegistry.register({ name: '   ', intervalMs: 1000, run: () => undefined }), /اسم الوظيفة/);
  });

  test('list يعيد نسخة ولا يسمح بالتلاعب بالسجل', () => {
    JobRegistry.register({ name: 'probe', intervalMs: 1000, run: () => undefined });

    const listed = JobRegistry.list();
    listed.pop();

    assert.equal(JobRegistry.list().length, 1);
    assert.equal(JobRegistry.has('probe'), true);
  });

  test('unregister يزيل الوظيفة', () => {
    JobRegistry.register({ name: 'probe', intervalMs: 1000, run: () => undefined });

    assert.equal(JobRegistry.unregister('probe'), true);
    assert.equal(JobRegistry.unregister('probe'), false);
    assert.equal(JobRegistry.has('probe'), false);
  });
});

describe('مشغّل الوظائف المجدولة', () => {
  afterEach(() => {
    JobRegistry.clear();
    TechnicalLogger.reset();
  });

  test('يشغّل الوظائف المسجّلة وفق فواصلها ويتوقف عند stop', async () => {
    const logs = captureLogs('debug');
    let runs = 0;

    JobRegistry.register({
      name: 'probe',
      intervalMs: 25,
      run: () => {
        runs += 1;
      },
    });

    const runner = new JobRunner();
    assert.deepEqual(runner.getJobNames(), ['probe']);
    assert.equal(runner.isRunning(), false);

    runner.start();
    assert.equal(runner.isRunning(), true);

    await delay(130);
    await runner.stop();

    const runsAtStop = runs;
    assert.ok(runsAtStop >= 2, `expected at least 2 runs, got ${runsAtStop}`);
    assert.equal(runner.isRunning(), false);
    assert.ok(logs.records.some((record) => record.message === 'scheduled job completed'));
    assert.ok(logs.records.some((record) => record.message === 'scheduled runner stopped'));

    await delay(90);
    assert.equal(runs, runsAtStop, 'لا تنفيذ بعد الإيقاف');
  });

  test('يمنع تراكب تشغيل الوظيفة نفسها', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    JobRegistry.register({
      name: 'slow',
      intervalMs: 100_000,
      run: async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await delay(60);
        concurrent -= 1;
      },
    });

    const runner = new JobRunner();
    const results = await Promise.all([runner.runNow('slow'), runner.runNow('slow')]);

    assert.equal(maxConcurrent, 1);
    assert.equal(results.filter((result) => result === undefined).length, 1);
    assert.equal(results.filter((result) => result?.success === true).length, 1);
  });

  test('لا يُسقط أخطاء الوظائف، بل يسجّلها ويعيد نتيجة فاشلة', async () => {
    const logs = captureLogs('debug');

    JobRegistry.register({
      name: 'boom',
      intervalMs: 100_000,
      run: () => {
        throw new Error('job exploded');
      },
    });

    const runner = new JobRunner();
    const result = await runner.runNow('boom');

    assert.equal(result?.success, false);
    assert.equal(result?.error, 'job exploded');

    const failure = logs.records.find((record) => record.message === 'scheduled job failed');
    assert.ok(failure !== undefined);
    assert.equal(failure.level, 'error');
    assert.equal(failure.source, 'jobs');
  });

  test('يرفض تشغيل وظيفة غير مسجّلة', async () => {
    const runner = new JobRunner([]);
    await assert.rejects(() => runner.runNow('missing'), /وظيفة غير مسجّلة/);
  });

  test('start قابل للتكرار دون مضاعفة المؤقتات', async () => {
    let runs = 0;
    JobRegistry.register({
      name: 'probe',
      intervalMs: 25,
      run: () => {
        runs += 1;
      },
    });

    const runner = new JobRunner();
    runner.start();
    runner.start();

    await delay(60);
    await runner.stop();

    assert.ok(runs <= 4, `expected no duplicated timers, got ${runs} runs`);
  });
});
