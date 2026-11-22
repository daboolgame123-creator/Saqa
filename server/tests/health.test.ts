/**
 * اختبارات Health وReadiness (Phase 8).
 * الفرق المقصود: Health = العملية تعمل، Readiness = النظام جاهز لاستقبال الطلبات.
 */
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { closeServer, startServer } from '../src/server';
import { config } from '../src/config';
import { closeSharedPool } from '../src/database';
import { LifecycleState } from '../src/utils';
import { jsonOf, silenceLogs, waitForListening } from './helpers';

interface HealthBody {
  status?: string;
  uptimeSeconds?: number;
  timestamp?: string;
}

interface ReadinessBody {
  status?: string;
  checks?: { name: string; ready: boolean; message?: string }[];
  timestamp?: string;
}

describe('Health & Readiness', () => {
  silenceLogs();

  let server: Server;
  let baseUrl: string;

  before(async () => {
    server = startServer(0);
    const port = await waitForListening(server);
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    LifecycleState.reset();
    server.closeAllConnections();
    await closeServer(server);
  });

  test('GET /health -> 200 ويؤكد أن العملية تعمل', async () => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await jsonOf<HealthBody>(response);

    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.uptimeSeconds, 'number');
    assert.equal(typeof body.timestamp, 'string');
    assert.ok(!Number.isNaN(Date.parse(body.timestamp as string)));
  });

  test('readiness يعيد 503 منظمًا عند بدء الإغلاق', async () => {
    LifecycleState.markShuttingDown();
    const response = await fetch(`${baseUrl}/health/ready`);
    const body = await jsonOf<ReadinessBody>(response);

    assert.equal(response.status, 503);
    assert.equal(body.status, 'not-ready');
    assert.equal(body.checks?.[0].ready, false);
    assert.equal(typeof body.checks?.[0].message, 'string');
    assert.equal(typeof body.timestamp, 'string');
  });

  test('readiness يعيد 503 قبل بدء الاستماع الفعلي', async () => {
    LifecycleState.reset();
    const response = await fetch(`${baseUrl}/health/ready`);
    assert.equal(response.status, 503);
  });

  test('Health يبقى 200 حتى عندما يكون Readiness غير جاهز', async () => {
    LifecycleState.reset();

    const health = await fetch(`${baseUrl}/health`);
    const readiness = await fetch(`${baseUrl}/health/ready`);

    assert.equal(health.status, 200);
    assert.equal(readiness.status, 503);
  });

  test('readiness لا يكشف بيانات الاتصال عند فشل PostgreSQL', async () => {
    const previousUrl = config.databaseUrl;
    // This loopback port deliberately has no PostgreSQL server. No external
    // network, real database, or user data are touched by this test.
    config.databaseUrl = 'postgresql://internal-user:very-private-password@127.0.0.1:1/hidden-db';
    LifecycleState.markReady();
    try {
      const response = await fetch(`${baseUrl}/health/ready`);
      const body = await jsonOf<ReadinessBody>(response);
      assert.equal(response.status, 503);
      const check = body.checks?.find((item) => item.name === 'database');
      assert.deepEqual(check, {
        name: 'database',
        ready: false,
        message: 'تعذّر الاتصال بقاعدة البيانات.',
      });
      const serialized = JSON.stringify(body);
      for (const secret of ['internal-user', 'very-private-password', 'hidden-db']) {
        assert.equal(serialized.includes(secret), false);
      }
    } finally {
      await closeSharedPool();
      config.databaseUrl = previousUrl;
    }
  });

  test('readiness يفحص قاعدة البيانات في Phase 10', async () => {
    // lifecycle جاهز لكن DATABASE_URL غير مضبوط في بيئة الاختبار:
    // الجاهزية تبقى 503 لأن خادماً بلا قاعدة لا يخدم مسارات /api.
    LifecycleState.markReady();
    const response = await fetch(`${baseUrl}/health/ready`);
    const body = await jsonOf<ReadinessBody>(response);

    assert.equal(response.status, 503);
    assert.deepEqual(
      body.checks?.map((check) => check.name),
      ['lifecycle', 'database'],
      'فحص القاعدة أُضيف مع طبقة البيانات في Phase 10',
    );
    assert.equal(body.checks?.[0].ready, true, 'lifecycle جاهز');
    assert.equal(body.checks?.[1].ready, false, 'قاعدة البيانات غير مهيأة');
    assert.equal(typeof body.checks?.[1].message, 'string');
  });
});
