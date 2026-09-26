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
    // api مستثناة: نُفِّذت في Phase 10 (طبقة الـAPI فوق المستودعات).
    const reservedLayers = ['auth', 'authorization', 'audit', 'storage', 'services'];

    for (const layer of reservedLayers) {
      const entries = readdirSync(join(srcRoot, layer));
      assert.deepEqual(entries, ['.gitkeep'], `${layer}/ يجب أن تبقى محجوزة في Phase 10`);
    }
  });

  test('طبقة api مفصولة في DTO/validation/services/controllers/routes', () => {
    const entries = readdirSync(join(srcRoot, 'api'));
    for (const layer of ['dto', 'validation', 'services', 'controllers', 'routes']) {
      assert.ok(entries.includes(layer), `api/${layer} مطلوبة في Phase 10`);
    }
  });

  test('سلامة ترميز الملفات العربية في طبقات Phase 10', () => {
    // حارس ضد تلف الترميز: إعادة كتابة مجمّعة بـPowerShell بامتداد
    // ترميز افتراضي (cp1256) تحوّل UTF-8 إلى نص ظاهر سليم لكنه فعلياً
    // محارف مغلوطة، فتُرفض قيمة عربية صالحة دون أن يظهر خطأ في الكونسول.
    // العلامة: الحرف العربي الصحيح يقع حصراً في U+0600–U+06FF.
    const CORRUPT_MARKERS = /[\uFB50-\uFDFF\uFE70-\uFEFF\uFFFD]/;
    const REAL_ARABIC = /[\u0600-\u06FF]/;

    const roots = [join(srcRoot, 'api'), join(serverRoot, 'tests', 'api')];
    for (const root of roots) {
      for (const name of readdirSync(root)) {
        if (!name.endsWith('.ts')) continue;
        const file = join(root, name);
        const content = readFileSync(file, 'utf8');
        assert.ok(
          !CORRUPT_MARKERS.test(content),
          `${file}: يحتوي محارف Presentation Forms/بديل — غالباً تلف ترميز.`,
        );
        // إن كان الملف يحمل نصاً عربياً، فيجب أن يكون بحروف عربية حقيقية.
        if (/[\u00C0-\u00FF]{2,}/.test(content)) {
          assert.ok(
            REAL_ARABIC.test(content),
            `${file}: نصوص بامتداد لاتيني بلا حروف عربية — راجع ترميز الملف.`,
          );
        }
      }
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
