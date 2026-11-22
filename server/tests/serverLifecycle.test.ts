/**
 * اختبارات نقطة تشغيل الـBackend ودورة حياته — Phase 8.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, describe, test } from 'node:test';
import { type BackendRuntime, closeServer, createShutdownHandler, startBackend, startServer } from '../src/server';
import { JobRunner } from '../src/jobs';
import { LifecycleState } from '../src/utils';
import { delay, jsonOf, silenceLogs, waitForListening } from './helpers';

describe('نقطة تشغيل الـBackend ودورة حياته', () => {
  silenceLogs();

  let runtime: BackendRuntime | undefined;

  after(async () => {
    if (runtime !== undefined) {
      runtime.server.closeAllConnections();
      await runtime.shutdown();
    }
    // تنظيف مستمعي الإشارات حتى تنتهي عملية الاختبار بلا تعليق.
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    LifecycleState.reset();
  });

  test('استيراد server.ts لا يشغّل الخادم تلقائيًا', async () => {
    // لو كان الاستيراد يشغّل الخادم لانتقلت الحالة إلى ready عند الاستماع.
    assert.equal(LifecycleState.getPhase(), 'starting');
    await delay(200);
    assert.equal(LifecycleState.getPhase(), 'starting');
  });

  test('startBackend يشغّل الخادم ويجعله جاهزًا ويخدم /health', async () => {
    runtime = startBackend(0);
    const port = await waitForListening(runtime.server);

    assert.equal(runtime.server.listening, true);
    assert.equal(LifecycleState.getPhase(), 'ready');
    assert.equal(runtime.jobRunner.isRunning(), true);

    // ربط الإشارات مسجَّل حتى يتمكن الإغلاق المتدرّج من العمل.
    assert.ok(process.listenerCount('SIGINT') >= 1);
    assert.ok(process.listenerCount('SIGTERM') >= 1);

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.equal((await jsonOf<{ status: string }>(response)).status, 'ok');
  });

  test('الإغلاق المتدرّج يُوقف الوظائف ويُغلق الخادم ويجعل النظام غير جاهز', async () => {
    assert.ok(runtime !== undefined);
    const target = runtime as BackendRuntime;

    // إغلاق اتصالات الاختبار المعلّقة حتى يكتمل server.close.
    target.server.closeAllConnections();
    await target.shutdown();

    assert.equal(target.server.listening, false);
    assert.equal(target.jobRunner.isRunning(), false);
    assert.equal(LifecycleState.getPhase(), 'shutting-down');
  });

  test('تكرار الإغلاق لا يغيّر النتيجة', async () => {
    assert.ok(runtime !== undefined);
    await (runtime as BackendRuntime).shutdown();
    assert.equal(LifecycleState.getPhase(), 'shutting-down');
  });

  test('الإشارات المتكررة تنتظر الإغلاق نفسه وموارد الخادم تُغلق بعد الوظائف', async () => {
    let completeJob!: () => void;
    let startedJob!: () => void;
    const gate = new Promise<void>((resolve) => { completeJob = resolve; });
    const started = new Promise<void>((resolve) => { startedJob = resolve; });
    const runner = new JobRunner([{
      name: 'pending-job',
      intervalMs: 100_000,
      run: async () => {
        startedJob();
        await gate;
      },
    }]);
    const server = createServer((_req, res) => res.end('ok'));
    server.listen(0);
    await waitForListening(server);
    LifecycleState.markReady();

    const inFlight = runner.runNow('pending-job');
    await started;
    const shutdown = createShutdownHandler({ server, jobRunner: runner });
    const first = shutdown();
    const repeated = shutdown();

    assert.strictEqual(first, repeated, 'every caller must await the same teardown promise');
    assert.equal(LifecycleState.getPhase(), 'shutting-down');
    let done = false;
    void first.then(() => { done = true; });
    await delay(20);
    assert.equal(done, false, 'do not close sockets/database ahead of pending jobs');
    assert.equal(server.listening, true);

    completeJob();
    await Promise.all([first, repeated, inFlight]);
    assert.equal(done, true);
    assert.equal(server.listening, false);
    assert.equal(runner.isRunning(), false);
    LifecycleState.reset();
  });

  test('startServer وحده يجعل النظام جاهزًا', async () => {
    LifecycleState.reset();
    const server = startServer(0);

    try {
      await waitForListening(server);
      assert.equal(LifecycleState.getPhase(), 'ready');
    } finally {
      // إغلاق الخادم دائمًا حتى لا يبقى مقبس مفتوح يعطّل انتهاء العملية.
      server.closeAllConnections();
      await closeServer(server);
    }
  });
});
