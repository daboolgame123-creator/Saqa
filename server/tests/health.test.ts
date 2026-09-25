/**
 * اختبارات Health وReadiness (Phase 8).
 * الفرق المقصود: Health = العملية تعمل، Readiness = النظام جاهز لاستقبال الطلبات.
 */
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { closeServer, startServer } from '../src/server';
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

  test('GET /health/ready -> 200 عندما يكون النظام جاهزًا', async () => {
    LifecycleState.markReady();
    const response = await fetch(`${baseUrl}/health/ready`);
    const body = await jsonOf<ReadinessBody>(response);

    assert.equal(response.status, 200);
    assert.equal(body.status, 'ready');
    assert.equal(body.checks?.length, 1);
    assert.equal(body.checks?.[0].name, 'lifecycle');
    assert.equal(body.checks?.[0].ready, true);
    assert.equal(typeof body.timestamp, 'string');
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

  test('readiness لا يفحص قاعدة بيانات في Phase 8', async () => {
    LifecycleState.markReady();
    const body = await jsonOf<ReadinessBody>(await fetch(`${baseUrl}/health/ready`));
    assert.deepEqual(
      body.checks?.map((check) => check.name),
      ['lifecycle'],
    );
  });
});
