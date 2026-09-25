/**
 * حواجز النطاق: بنية الطبقات، وغياب أي تنفيذ لمراحل لاحقة غير منفَّذة.
 * مجلد repositories مستثنى لأنه منفَّذ في Phase 9.
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

describe('حواجز النطاق والبنية', () => {
  test('كل الطبقات المطلوبة في البنية الأساسية موجودة', () => {
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
    // repositories مستثناة: نُفِّذت في Phase 9 (مستودعات PostgreSQL).
    const reservedLayers = ['auth', 'authorization', 'audit', 'storage', 'services'];

    for (const layer of reservedLayers) {
      const entries = readdirSync(join(srcRoot, layer));
      assert.deepEqual(entries, ['.gitkeep'], `${layer}/ يجب أن تبقى محجوزة في Phase 9`);
    }
  });

  test('مستودعات Phase 9 منفَّذة، وطبقات المراحل اللاحقة ما زالت محجوزة', () => {
    const repositoryFiles = readdirSync(join(srcRoot, 'repositories')).filter(
      (name) => name !== '.gitkeep',
    );
    assert.ok(repositoryFiles.includes('index.ts'), 'repositories/index.ts مطلوب في Phase 9');
    assert.ok(
      repositoryFiles.some((name) => name.endsWith('Repository.ts')),
      'مستودع واحد على الأقل في Phase 9',
    );
  });

  test('لا تبعيات مصادقة أو تخزين ملفات في Phase 9', () => {
    // pg و embedded-postgres مسموحتان في Phase 9 (بنية بيانات اختبارية)؛
    // ما عداها من تبعيات المصادقة/الجلسات/التخزين يبقى محجوزاً.
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDependencies = { ...pkg.dependencies, ...pkg.devDependencies };
    const forbidden = [
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
      assert.equal(allDependencies[name], undefined, `${name} يجب ألا تكون تبعية في Phase 9`);
    }
  });

  test('لا وظائف أعمال مجدولة مسجّلة في Phase 8', () => {
    assert.deepEqual(JobRegistry.list(), []);
  });
});
