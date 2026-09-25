/**
 * اختبارات التوجيه (404) ومعرّف الطلب (Request ID) — Phase 8.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app';
import {
  MAX_REQUEST_ID_LENGTH,
  REQUEST_ID_HEADER,
  SAFE_REQUEST_ID_PATTERN,
  resolveRequestId,
} from '../src/middleware';
import { LifecycleState } from '../src/utils';
import { jsonOf, listenApp, silenceLogs, type RunningApp } from './helpers';

interface ErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
    stack?: string;
    requestId?: string;
  };
}

describe('مصادر معرّف الطلب (Request ID)', () => {
  test('ينشئ معرّفًا آمنًا عند غياب الترويسة', () => {
    const generated = resolveRequestId(undefined);
    assert.ok(generated.length > 0);
    assert.ok(SAFE_REQUEST_ID_PATTERN.test(generated));
    assert.notEqual(generated, resolveRequestId(undefined));
  });

  test('يحافظ على معرّف العميل الموثوق', () => {
    assert.equal(resolveRequestId('req-123.abc_XY:z'), 'req-123.abc_XY:z');
    assert.equal(resolveRequestId('  trimmed-id  '), 'trimmed-id');
  });

  test('يرفض المعرّفات غير الآمنة ويولّد بديلًا', () => {
    const unsafeValues = ['has space', 'with\nnewline', '<script>', 'a'.repeat(MAX_REQUEST_ID_LENGTH + 1), ''];

    for (const unsafe of unsafeValues) {
      const resolved = resolveRequestId(unsafe);
      assert.notEqual(resolved, unsafe);
      assert.ok(SAFE_REQUEST_ID_PATTERN.test(resolved), `should regenerate for: ${JSON.stringify(unsafe)}`);
    }
  });

  test('لا يحتوي المعرّف المولَّد على أي بيانات شخصية', () => {
    assert.ok(SAFE_REQUEST_ID_PATTERN.test(resolveRequestId(undefined)));
  });
});

describe('التوجيه ومعرّف الطلب داخل التطبيق', () => {
  silenceLogs();
  let app: RunningApp;

  before(async () => {
    LifecycleState.markReady();
    app = await listenApp(createApp());
  });

  after(async () => {
    await app.shutdown();
    LifecycleState.reset();
  });

  test('مسار غير موجود -> 404 منظم', async () => {
    const response = await fetch(`${app.baseUrl}/api/unknown`);
    const body = await jsonOf<ErrorBody>(response);

    assert.equal(response.status, 404);
    assert.equal(body.error?.code, 'NOT_FOUND');
    assert.equal(typeof body.error?.message, 'string');
  });

  test('method غير مدعوم على /health -> 404', async () => {
    const response = await fetch(`${app.baseUrl}/health`, { method: 'POST' });
    assert.equal(response.status, 404);
  });

  test('كل استجابة تحمل ترويسة X-Request-Id', async () => {
    const ok = await fetch(`${app.baseUrl}/health`);
    const missing = await fetch(`${app.baseUrl}/api/unknown`);

    assert.ok(ok.headers.get('x-request-id'));
    assert.ok(missing.headers.get('x-request-id'));
  });

  test('المعرّف المولَّد يطابق النمط الآمن', async () => {
    const response = await fetch(`${app.baseUrl}/health`);
    const headerValue = response.headers.get('x-request-id');
    assert.ok(headerValue !== null && SAFE_REQUEST_ID_PATTERN.test(headerValue));
  });

  test('يُحافظ على معرّف الطلب المرسل من العميل', async () => {
    const response = await fetch(`${app.baseUrl}/health`, {
      headers: { [REQUEST_ID_HEADER]: 'client-request-77' },
    });

    assert.equal(response.headers.get('x-request-id'), 'client-request-77');
  });

  test('يُستبدل معرّف الطلب غير الآمن', async () => {
    const response = await fetch(`${app.baseUrl}/health`, {
      headers: { [REQUEST_ID_HEADER]: 'bad value with spaces' },
    });

    const headerValue = response.headers.get('x-request-id');
    assert.notEqual(headerValue, 'bad value with spaces');
    assert.ok(headerValue !== null && SAFE_REQUEST_ID_PATTERN.test(headerValue));
  });

  test('معرّف الطلب يظهر في استجابة الخطأ', async () => {
    const response = await fetch(`${app.baseUrl}/api/unknown`, {
      headers: { [REQUEST_ID_HEADER]: 'trace-me-1' },
    });
    const body = await jsonOf<ErrorBody>(response);

    assert.equal(response.status, 404);
    assert.equal(body.error?.requestId, 'trace-me-1');
    assert.equal(response.headers.get('x-request-id'), 'trace-me-1');
  });
});
