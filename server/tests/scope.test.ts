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
    // auth مستثناة: نُفِّذت في Phase 11 (مصادقة وحسابات وجلسات).
    // authorization مستثناة: نُفِّذت في Phase 12 (فرض الصلاحيات).
    // storage مستثناة: نُفِّذت في Phase 14 (التخزين المركزي للمرفقات).
    //
    // `audit` و`services` تبقيان **محجوزتين**: لم تُنفَّذ لهما مرحلة بعد
    // (Audit/View Logs هي Phase 15). صيانة هذا الحدّ هي وظيفة الحارس نفسه.
    const reservedLayers = ['audit', 'services'];

    for (const layer of reservedLayers) {
      const entries = readdirSync(join(srcRoot, layer));
      assert.deepEqual(entries, ['.gitkeep'], `${layer}/ يجب أن تبقى محجوزة`);
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

  test('طبقة auth منفّذة في Phase 11 (مصادقة وحسابات وجلسات)', () => {
    const authEntries = readdirSync(join(srcRoot, 'auth'));
    assert.ok(!authEntries.includes('.gitkeep'), 'auth/.gitkeep أُزيل بتنفيذ المرحلة');
    assert.ok(authEntries.includes('index.ts'), 'auth/index.ts مطلوب في Phase 11');
    for (const file of ['authService.ts', 'sessionMiddleware.ts', 'authRoutes.ts', 'authController.ts']) {
      assert.ok(authEntries.includes(file), `auth/${file} مطلوب في Phase 11`);
    }
  });

  test('طبقة authorization منفَّذة في Phase 12 ومربوطة بالمسارات الحساسة', () => {
    // حارس المرحلة: RBAC منفَّذ في مكانه، ومسارا الإدارة في auth/
    // (اللذان أعلنا في Phase 11 أنهما ينتظران فحص الدور) مرتبطان فعلاً.
    const authzEntries = readdirSync(join(srcRoot, 'authorization'));
    assert.ok(!authzEntries.includes('.gitkeep'), 'authorization/.gitkeep أُزيل بتنفيذ المرحلة');
    for (const file of ['index.ts', 'permissions.ts', 'requirePermission.ts', 'authorizationErrors.ts']) {
      assert.ok(authzEntries.includes(file), `authorization/${file} مطلوب في Phase 12`);
    }

    const authRoutesSource = readFileSync(join(srcRoot, 'auth', 'authRoutes.ts'), 'utf8');
    assert.ok(
      authRoutesSource.includes("requirePermission('manage_accounts')"),
      'مسار إعادة الضبط مفروض عليه `manage accounts` (§11.7)',
    );
    assert.ok(
      authRoutesSource.includes("requirePermission('manage_security')"),
      'مسار كشف الرمز مفروض عليه `manage security` (§11.8)',
    );

    const apiRoutesSource = readFileSync(join(srcRoot, 'api', 'routes', 'index.ts'), 'utf8');
    assert.ok(
      apiRoutesSource.includes('requireResourcePermission'),
      'موارد /api/* مفروض عليها فرض الصلاحيات نقطة واحدة',
    );
  });

  test('نطاق الرؤية وإتاحة الكتب منفّذان في Phase 13 ومربوطان بالمسارات والمستودعات', () => {
    // حارس Phase 13: وحدة accessScope منفَّذة ومصدَّرة من authorization/
    const authzFiles = readdirSync(join(srcRoot, 'authorization'));
    assert.ok(authzFiles.includes('accessScope.ts'), 'authorization/accessScope.ts مطلوب في Phase 13');

    // مستودع الإتاحة منفَّذ ومسجَّل
    const repoFiles = readdirSync(join(srcRoot, 'repositories'));
    assert.ok(repoFiles.includes('availabilityRepository.ts'), 'repositories/availabilityRepository.ts مطلوب في Phase 13');
    assert.ok(repoFiles.includes('transactionScopeSql.ts'), 'repositories/transactionScopeSql.ts مطلوب في Phase 13');

    // attachAccessScope مربوط في راوتر الـAPI
    const apiRoutesSource = readFileSync(join(srcRoot, 'api', 'routes', 'index.ts'), 'utf8');
    assert.ok(
      apiRoutesSource.includes('attachAccessScope'),
      'راوتر /api/* يركّب وسيط attachAccessScope',
    );

    // مسارات الإتاحة مربوطة ومحميّة بحارس الصلاحية manage_availability
    const resourcesSource = readFileSync(join(srcRoot, 'api', 'routes', 'resources.ts'), 'utf8');
    assert.ok(
      resourcesSource.includes("requirePermission('manage_availability')"),
      'مسارات إتاحة الكتب مفروض عليها صلاحية manage_availability (§9.5)',
    );
  });

  test('التخزين المركزي للمرفقات منفَّذ في Phase 14، وسجلات التدقيق (Phase 15) ما زالت محجوزة', () => {
    // حارس Phase 14: طبقة `storage/` منفَّذة ومصدَّرة.
    const storageFiles = readdirSync(join(srcRoot, 'storage'));
    assert.ok(!storageFiles.includes('.gitkeep'), 'storage/.gitkeep أُزيل بتنفيذ المرحلة');
    for (const file of [
      'index.ts',
      'fileValidation.ts',
      'fileStorage.ts',
      'integrity.ts',
      'integrityState.ts',
      'storageErrors.ts',
      'historicalArchiveImport.ts',
    ]) {
      assert.ok(storageFiles.includes(file), `storage/${file} مطلوب في Phase 14`);
    }

    // مستودع المرفقات والمترجَمات وطبقة الـAPI مربوطة.
    const repositoryFiles = readdirSync(join(srcRoot, 'repositories'));
    assert.ok(
      repositoryFiles.includes('attachmentRepository.ts'),
      'repositories/attachmentRepository.ts مطلوب في Phase 14',
    );
    const apiRoutesSource = readFileSync(join(srcRoot, 'api', 'routes', 'resources.ts'), 'utf8');
    assert.ok(
      apiRoutesSource.includes('downloadAttachmentContent'),
      'مسار تحميل محتوى المرفق مربوط في الراوتر',
    );

    // **الحارس الأهم في هذه المرحلة**: لا مسار يخدم ملفات القرص مباشرة.
    // §30 يشترط أن يبقى الوصول عبر Backend بعد authorization، فلا يجوز
    // أن يظهر `express.static` (أو أي serve) على جذر التخزين.
    //
    // الفحص على **الكود لا التعليق**: يُجرَّد أول سطرين من كل ملف (رأس
    // التوثيق) قبل البحث، وإلا ضُرب الحارس بنفسه لأن تعليقاتنا تذكر الاسم
    // الذي تحظره. ما يُقاس هو الاستدعاء الفعلي لا ذكره.
    const stripDocHeader = (source: string): string =>
      source.replace(/^[\s\S]*?\*\/\s*\n/, '');
    for (const file of storageFiles.filter((name) => name.endsWith('.ts'))) {
      const content = stripDocHeader(readFileSync(join(srcRoot, 'storage', file), 'utf8'));
      assert.ok(
        !content.includes('express.static'),
        `storage/${file}: لا يجوز خدمة ملفات القرص مباشرة — الوصول عبر Backend فقط.`,
      );
    }
    const appSource = stripDocHeader(readFileSync(join(srcRoot, 'app.ts'), 'utf8'));
    assert.ok(
      !appSource.includes('express.static'),
      'app.ts: لا express.static على أي مسار ملفات (§30 · لا مشاركة مباشرة للمجلد).',
    );

    // سجلات التدقيق والاطلاع (Phase 15) تبقى محجوزة بلا تنفيذ.
    assert.deepEqual(
      readdirSync(join(srcRoot, 'audit')),
      ['.gitkeep'],
      'audit/ يجب أن تبقى محجوزة قبل Phase 15',
    );

    // لا مكتبة رفع خارجية: الرفع يمرّ بـ`express.raw` المدمج.
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDependencies = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.equal(
      allDependencies['multer'],
      undefined,
      'multer غير مستخدم: الرفع عبر express.raw بلا مكتبة خارجية',
    );
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
