/**
 * اختبارات السجل التقني المهيكل (Structured Technical Logging) — Phase 8.
 * الفصل عن Audit Log: هذا السجل تقني فقط ولا يكتب أحداث أعمال.
 */
import assert from 'node:assert/strict';
import express from 'express';
import { afterEach, describe, test } from 'node:test';
import { createApp } from '../src/app';
import { createErrorHandler, notFoundHandler } from '../src/middleware';
import {
  REDACTED_VALUE,
  TechnicalLogger,
  formatLogRecord,
  redactFields,
} from '../src/logging';
import { LifecycleState } from '../src/utils';
import { captureLogs, delay, jsonOf, listenApp, waitForListening } from './helpers';

describe('السجل التقني المهيكل', () => {
  afterEach(() => {
    TechnicalLogger.reset();
    LifecycleState.reset();
  });

  test('يكتب سجلًا يحتوي الحقول المنظمة المطلوبة', () => {
    const logs = captureLogs('debug');

    TechnicalLogger.info('hello', {
      requestId: 'req-1',
      source: 'test',
      data: { answer: 42 },
    });

    assert.equal(logs.records.length, 1);
    const record = logs.records[0];
    assert.equal(record.level, 'info');
    assert.equal(record.message, 'hello');
    assert.equal(record.requestId, 'req-1');
    assert.equal(record.source, 'test');
    assert.equal(record.environment, 'development');
    assert.equal(typeof record.timestamp, 'string');
    assert.ok(!Number.isNaN(Date.parse(record.timestamp)));
    assert.deepEqual(record.data, { answer: 42 });
  });

  test('يحترم أدنى مستوى مسموح', () => {
    const logs = captureLogs('warn');

    TechnicalLogger.debug('hidden');
    TechnicalLogger.info('hidden');
    TechnicalLogger.warn('visible');
    TechnicalLogger.error('visible');

    assert.deepEqual(
      logs.records.map((record) => record.level),
      ['warn', 'error'],
    );
  });

  test('لا يسجّل كلمات المرور ولا OTP ولا الرموز', () => {
    const logs = captureLogs('debug');

    TechnicalLogger.info('login attempt', {
      data: {
        username: 'user-1',
        password: 'super-secret',
        otp: '123456',
        nested: { token: 'abc', authorization: 'Bearer x' },
      },
    });

    const data = logs.records[0].data as Record<string, unknown>;
    assert.equal(data.username, 'user-1');
    assert.equal(data.password, REDACTED_VALUE);
    assert.equal(data.otp, REDACTED_VALUE);
    assert.deepEqual(data.nested, { token: REDACTED_VALUE, authorization: REDACTED_VALUE });
  });

  test('redactFields وformatLogRecord سلوكهما متوقع', () => {
    assert.deepEqual(redactFields({ secret: 'x', keep: 'y' }), {
      secret: REDACTED_VALUE,
      keep: 'y',
    });

    const line = formatLogRecord({
      timestamp: '2026-09-25T00:00:00.000Z',
      level: 'info',
      message: 'm',
      environment: 'test',
    });
    assert.ok(!line.includes('\n'));
    assert.deepEqual(Object.keys(JSON.parse(line)), ['timestamp', 'level', 'message', 'environment']);
  });

  test('يسجّل كل طلب HTTP مكتمل مع requestId والحالة', async () => {
    const logs = captureLogs('info');
    LifecycleState.markReady();

    const server = createApp().listen(0);

    try {
      const port = await waitForListening(server);

      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { 'x-request-id': 'log-check-1' },
      });
      assert.equal(response.status, 200);

      await delay(60);

      const httpRecord = logs.records.find((record) => record.source === 'http');
      assert.ok(httpRecord !== undefined, 'expected a http log record');
      assert.equal(httpRecord.requestId, 'log-check-1');
      assert.equal((httpRecord.data as Record<string, unknown>).path, '/health');
      assert.equal((httpRecord.data as Record<string, unknown>).statusCode, 200);
      assert.equal(typeof (httpRecord.data as Record<string, unknown>).durationMs, 'number');
    } finally {
      // تنظيف دائم حتى لا يبقى مقبس مفتوح يعطّل انتهاء عملية الاختبار.
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('لا يسجّل سلسلة الاستعلام (خصوصية) لكنه يسجّل المسار الصحيح', async () => {
    const logs = captureLogs('info');
    LifecycleState.markReady();

    const server = createApp().listen(0);

    try {
      const port = await waitForListening(server);

      const response = await fetch(
        `http://127.0.0.1:${port}/health?token=very-secret&page=2`,
      );
      assert.equal(response.status, 200);

      await delay(60);

      const httpRecord = logs.records.find((record) => record.source === 'http');
      assert.ok(httpRecord !== undefined, 'expected a http log record');
      assert.equal((httpRecord.data as Record<string, unknown>).path, '/health');
      // لا أثر لسلسلة الاستعلام في أي حقل من حقول السجل.
      const serialized = JSON.stringify(httpRecord);
      assert.ok(!serialized.includes('very-secret'));
      assert.ok(!serialized.includes('page'));
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('الأخطاء تُسجَّل تقنيًا عبر معالج الأخطاء المركزي', async () => {
    const logs = captureLogs('debug');

    const app = express();
    app.use(notFoundHandler);
    app.use(createErrorHandler({ exposeDetails: false }));
    const running = await listenApp(app);

    await jsonOf(await fetch(`${running.baseUrl}/does-not-exist`));

    const record = logs.records.find((candidate) => candidate.message === 'request failed with operational error');
    assert.ok(record !== undefined);
    assert.equal(record.level, 'warn');
    assert.equal((record.data as Record<string, unknown>).code, 'NOT_FOUND');

    await running.shutdown();
  });

  test('الأخطاء غير المتوقعة تُسجَّل بمستوى error مع السبب', async () => {
    const logs = captureLogs('debug');

    const app = express();
    app.get('/boom', () => {
      throw new Error('unexpected failure');
    });
    app.use(createErrorHandler({ exposeDetails: false }));
    const running = await listenApp(app);

    await jsonOf(await fetch(`${running.baseUrl}/boom`));

    const record = logs.records.find((candidate) => candidate.level === 'error');
    assert.ok(record !== undefined);
    assert.equal(record.message, 'unhandled error');
    assert.equal((record.data as Record<string, unknown>).error, 'unexpected failure');

    await running.shutdown();
  });
});
