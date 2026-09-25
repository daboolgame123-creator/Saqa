/**
 * اختبارات طبقة التحقق من المدخلات وخطأ التحقق المنظم — Phase 8.
 */
import assert from 'node:assert/strict';
import express from 'express';
import { after, before, describe, test } from 'node:test';
import { AppError, ValidationError } from '../src/errors';
import { createErrorHandler } from '../src/middleware';
import {
  createValidationMiddleware,
  invalidOutcome,
  issue,
  validOutcome,
  type ValidationOutcome,
} from '../src/validation';
import { jsonOf, listenApp, silenceLogs, type RunningApp } from './helpers';

interface Body<T> {
  error?: { code?: string; message?: string; details?: T };
}

interface ValidationIssueShape {
  field: string;
  message: string;
}

describe('خطأ التحقق (ValidationError)', () => {
  test('هو AppError برمز 400 وحالة تشغيلية', () => {
    const error = new ValidationError([issue('body.name', 'الحقل مطلوب.')]);

    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 400);
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(error.isOperational, true);
    assert.equal(error.issues.length, 1);
    assert.equal(error.details, error.issues);
  });

  test('أدوات بناء النتائج تعمل كما هو متوقع', () => {
    assert.deepEqual(validOutcome(5), { kind: 'valid', value: 5 });
    assert.deepEqual(invalidOutcome([issue('x', 'y')]), {
      kind: 'invalid',
      issues: [{ field: 'x', message: 'y' }],
    });
  });
});

describe('middleware التحقق من مدخلات HTTP', () => {
  silenceLogs();

  let app: RunningApp;

  // مخطط تحقق تجريبي — ليس قاعدة أعمال.
  const bodyValidator = (input: unknown): ValidationOutcome<unknown> => {
    if (typeof input === 'object' && input !== null && 'name' in input) {
      return validOutcome(input);
    }
    return invalidOutcome([issue('name', 'الحقل name مطلوب.')]);
  };

  before(async () => {
    const validationApp = express();
    validationApp.use(express.json());
    validationApp.post(
      '/things',
      createValidationMiddleware({ body: { validator: bodyValidator } }),
      (_req, res) => {
        res.status(201).json({ ok: true });
      },
    );
    validationApp.use(createErrorHandler({ exposeDetails: false }));
    app = await listenApp(validationApp);
  });

  after(async () => {
    await app.shutdown();
  });

  test('مدخلات غير صالحة -> 400 منظم مع قائمة المشاكل', async () => {
    const response = await fetch(`${app.baseUrl}/things`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await jsonOf<Body<ValidationIssueShape[]>>(response);

    assert.equal(response.status, 400);
    assert.equal(body.error?.code, 'VALIDATION_ERROR');
    assert.deepEqual(body.error?.details, [{ field: 'body.name', message: 'الحقل name مطلوب.' }]);
  });

  test('مدخلات صالحة تمر إلى المعالج', async () => {
    const response = await fetch(`${app.baseUrl}/things`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'قيمة' }),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await jsonOf<{ ok: boolean }>(response), { ok: true });
  });

  test('بلا مخطط تحقق لا يحدث أي تغيير على المسار', async () => {
    const plainApp = express();
    let called = false;
    plainApp.get('/plain', createValidationMiddleware({}), (_req, res) => {
      called = true;
      res.status(200).json({ ok: true });
    });
    const plain = await listenApp(plainApp);

    const response = await fetch(`${plain.baseUrl}/plain`);
    assert.equal(response.status, 200);
    assert.equal(called, true);

    await plain.shutdown();
  });
});
