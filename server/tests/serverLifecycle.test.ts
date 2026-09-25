/**
 * اختبارات نقطة تشغيل الـBackend ودورة حياته — Phase 8.
 */
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { type BackendRuntime, closeServer, startBackend, startServer } from '../src/server';
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
