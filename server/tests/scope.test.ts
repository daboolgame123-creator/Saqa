/**
 * حواجز نطاق Phase 8: بنية الطبقات، وغياب أي تنفيذ لمراحل لاحقة.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { JobRegistry } from '../src/jobs';

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(serverRoot, 'src');
const packageJsonPath = join(serverRoot, '..', 'package.json');

describe('حواجز نطاق Phase 8', () => {
  test('كل الطبقات المطلوبة في بنية Phase 8 موجودة', () => {
    const layers = [
      'config',
      'routes',
      'controllers',
      'services',
      'repositories',
      'validation',
      'middleware',
      'auth',
      'authorization',
      'audit',
      'storage',
      'jobs',
      'logging',
      'utils',
    ];

    for (const layer of layers) {
      assert.ok(readdirSync(srcRoot).includes(layer), `${layer}/ مطلوبة في بنية Phase 8`);
    }

    assert.ok(readdirSync(serverRoot).includes('tests'), 'tests/ مطلوبة في بنية Phase 8');
    assert.ok(existsSync(join(srcRoot, 'app.ts')), 'app.ts مطلوب');
    assert.ok(existsSync(join(srcRoot, 'server.ts')), 'server.ts مطلوب');
  });

  test('الطبقات المحجوزة لا تحتوي أي تنفيذ لمراحل لاحقة', () => {
    const reservedLayers = ['auth', 'authorization', 'audit', 'storage', 'services', 'repositories'];

    for (const layer of reservedLayers) {
      const entries = readdirSync(join(srcRoot, layer));
      assert.deepEqual(entries, ['.gitkeep'], `${layer}/ يجب أن تبقى محجوزة في Phase 8`);
    }
  });

  test('لا تبعيات قاعدة بيانات أو مصادقة في Phase 8', () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDependencies = { ...pkg.dependencies, ...pkg.devDependencies };
    const forbidden = [
      'pg',
      'pg-pool',
      'prisma',
      '@prisma/client',
      'sequelize',
      'typeorm',
      'mongoose',
      'knex',
      'jsonwebtoken',
      'bcrypt',
      'bcryptjs',
      'passport',
      'express-session',
      'cookie-session',
      'multer',
    ];

    for (const name of forbidden) {
      assert.equal(allDependencies[name], undefined, `${name} يجب ألا تكون تبعية في Phase 8`);
    }
  });

  test('لا وظائف أعمال مجدولة مسجّلة في Phase 8', () => {
    assert.deepEqual(JobRegistry.list(), []);
  });
});
