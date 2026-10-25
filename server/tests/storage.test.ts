/**
 * اختبارات وحدة لطبقة التخزين المركزي للمرفقات (Phase 14 — §30).
 *
 * تغطي البنود التي لا تحتاج خادم HTTP: فحص المحتوى، التنظيف، منع path
 * traversal، بناء المفتاح من الـstable ID، البصمة وحالة السلامة، ومطابقة
 * أرشيف الجود. اختبارات الرفع والتحميل عبر HTTP في
 * `tests/api/attachments.test.ts` (حيث تُختبر authorization وAccess Scope).
 *
 * **لا بيانات عمل حقيقية**: كل بايت هنا اصطناعية (توقيع PDF صحيح مولَّد)،
 * وكل مجلد مؤقت في `os.tmpdir()` ويُنظَّف بعد كل اختبار.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import {
  ARCHIVE_ATTACHMENTS_DIRNAME,
  assertPathWithinRoot,
  AttachmentTooLargeError,
  AttachmentValidationError,
  buildStorageKey,
  computeContentHash,
  detectMimeType,
  FileStorage,
  inspectArchiveFolder,
  InvalidFilenameError,
  isVerifiableHash,
  mapArchiveReferencesToFiles,
  MimeMismatchError,
  resolveIntegrityState,
  sanitizeOriginalFilename,
  UnsupportedMediaTypeError,
  validateAttachmentContent,
  verifyContentHash,
} from '../src/storage';

/** ملف PDF اصطناعي: التوقيع الصحيح متبوعا ببايتات محتوى. */
function fakePdf(marker = 'content'): Buffer {
  return Buffer.concat([Buffer.from('%PDF-1.7\n', 'latin1'), Buffer.from(marker, 'latin1')]);
}

/** PNG اصطناعي: التوقيع الثماني بايتات. */
function fakePng(marker = 'x'): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(marker, 'latin1'),
  ]);
}
describe('Phase 14 — التخزين المركزي للمرفقات (وحدة)', () => {
  describe('MIME validation من محتوى الملف لا من امتداده (§30)', () => {
    test('يكشف PDF وPNG من توقيعهما البايتي', () => {
      assert.equal(detectMimeType(fakePdf()).mime, 'application/pdf');
      assert.equal(detectMimeType(fakePng()).mime, 'image/png');
    });

    test('امتداد PDF على محتوى غير PDF ⇒ لا يُكتشف PDF من الامتداد', () => {
      // الملف اسمه .pdf في طبقة الواجهة، لكن محتواه نص عادي. الفحص
      // البايتي يجب أن يفشل — وهذا جوهر «لا تعتمد على الامتداد وحده».
      const notAPdf = Buffer.from('هذا نص عادي وليس PDF', 'utf8');
      assert.equal(detectMimeType(notAPdf).mime, null);
      assert.throws(
        () => validateAttachmentContent(notAPdf, 'application/pdf', 1024 * 1024),
        UnsupportedMediaTypeError,
      );
    });

    test('محتوى غير معروف يُرفض (fail-closed) لا يُقبل كـ octet-stream', () => {
      assert.throws(
        () => validateAttachmentContent(Buffer.from('random junk'), null, 1024 * 1024),
        UnsupportedMediaTypeError,
      );
    });

    test('اختلاف النوع المعلن عن المكتشف رفضٌ لا تفضيل', () => {
      // عميل يقول PNG ومحتواه PDF ⇒ رفض.
      assert.throws(
        () => validateAttachmentContent(fakePdf(), 'image/png', 1024 * 1024),
        MimeMismatchError,
      );
    });

    test('المحتوى السليم يُقبل ويعيد النوع المكتشف', () => {
      assert.equal(
        validateAttachmentContent(fakePdf(), 'application/pdf', 1024 * 1024),
        'application/pdf',
      );
    });

    test('تجاوز حد الحجم مرفوض قبل أي معالجة', () => {
      const big = fakePdf('a'.repeat(2000));
      assert.throws(() => validateAttachmentContent(big, 'application/pdf', 100), AttachmentTooLargeError);
    });
  });

  describe('filename sanitization و path traversal (§30)', () => {
    test('الاسم الأصلي يُحفظ كما ورد، والنسخة الآمنة نظيفة', () => {
      const result = sanitizeOriginalFilename('كتاب رسمي (1).pdf');
      assert.equal(result.original, 'كتاب رسمي (1).pdf');
      assert.equal(result.safe, 'كتاب رسمي (1).pdf');
    });

    test('مسار في الاسم يُسقط ولا يبقى منه مسار على القرص', () => {
      const result = sanitizeOriginalFilename('../../etc/passwd.pdf');
      assert.equal(result.original, '../../etc/passwd.pdf', 'الأصل محفوظ كما ورد');
      assert.equal(result.safe, 'passwd.pdf', 'لا مجلد مسار في النسخة الآمنة');
    });

    test('اسم عربي بمسار backslashes يُقصّ إلى المقطع الأخير', () => {
      const result = sanitizeOriginalFilename('..\\..\\كتاب.pdf');
      assert.equal(result.safe, 'كتاب.pdf');
    });

    test('اسم يصبح فارغاً بعد التنظيف ⇒ رفض', () => {
      assert.throws(() => sanitizeOriginalFilename('../..'), InvalidFilenameError);
      assert.throws(() => sanitizeOriginalFilename('///'), InvalidFilenameError);
    });

    test('المسار داخل الجذر مقبول، وخارجه مرفوض', () => {
      const root = join(os.tmpdir(), 'alsqaya-root-check');
      assert.ok(assertPathWithinRoot(root, join(root, 'blobs', 'aa', 'bb', 'x')).includes('blobs'));
      assert.throws(
        () => assertPathWithinRoot(root, join(root, '..', 'outside', 'x')),
        AttachmentValidationError,
      );
    });
  });

  describe('مفتاح التخزين مشتقّ من الـstable ID لا من اسم الملف (§30)', () => {
    test('المفتاح من المعرّف، مقسَّم على مستويين', () => {
      const key = buildStorageKey('abcdef01-2345-6789-abcd-ef0123456789');
      assert.equal(key, 'blobs/ab/cd/abcdef01-2345-6789-abcd-ef0123456789');
    });

    test('معرّف فيه محرف مسار أو `..` مرفوض قبل لمس القرص', () => {
      assert.throws(() => buildStorageKey('../../etc'), AttachmentValidationError);
      assert.throws(() => buildStorageKey('short'), AttachmentValidationError);
    });

    test('مفتاحان لمعرّفين مختلفين لا يتطابقان (لا تصادم بالاسم)', () => {
      const a = buildStorageKey('aaaaaaaa-1111-2222-3333-444444444444');
      const b = buildStorageKey('bbbbbbbb-1111-2222-3333-444444444444');
      assert.notEqual(a, b);
    });
  });

  describe('البصمة وحالة السلامة (§30 · hash + integrity)', () => {
    test('البصمة تُحسب وتُقرأ، ونفس المحتوى يعطي نفس البصمة', () => {
      const content = fakePdf('same');
      const first = computeContentHash(content);
      assert.equal(first, computeContentHash(fakePdf('same')));
      assert.ok(isVerifiableHash(first));
      assert.ok(verifyContentHash(first, content));
    });

    test('تغيّر البايتات ⇒ لا تطابقة', () => {
      const stored = computeContentHash(fakePdf('original'));
      assert.equal(verifyContentHash(stored, fakePdf('tampered')), false);
    });

    test('بصمة غير قابلة للتحقق (بلا بادئة) لا تُعامل كطابقة', () => {
      assert.equal(isVerifiableHash('deadbeef'), false);
      assert.equal(isVerifiableHash(''), false);
      assert.equal(isVerifiableHash(null), false);
      // محتوى مطابق تماماً لكن البصمة المحفوظة بلا بادئة: لا نقول «verified».
      assert.equal(resolveIntegrityState('deadbeef', fakePdf()), 'unknown');
    });

    test('الحالة تُشتقّ من القراءة: verified / corrupted / missing', () => {
      const content = fakePdf('payload');
      const hash = computeContentHash(content);
      assert.equal(resolveIntegrityState(hash, content), 'verified');
      assert.equal(resolveIntegrityState(hash, fakePdf('other')), 'corrupted');
      // الملف غير موجود على القرص ⇒ محتوى null ⇒ missing (لا «corrupted»).
      assert.equal(resolveIntegrityState(hash, null), 'missing');
    });
  });

  describe('التخزين على القرص: كتابة وقراءة ومسار داخل الجذر', () => {
    let root = '';
    let storage: FileStorage;

    before(async () => {
      root = await mkdtemp(join(os.tmpdir(), 'alsqaya-storage-'));
      storage = new FileStorage({ rootDir: root });
    });

    after(async () => {
      if (root !== '') {
        await rm(root, { recursive: true, force: true });
      }
    });

    test('يكتب الملف ويعيد نفس البايتات', async () => {
      const id = 'abcdef01-2345-6789-abcd-ef0123456789';
      const content = fakePdf('stored');
      const path = await storage.write(id, content);
      assert.ok(existsSync(path), 'الملف موجود على القرص بعد الحفظ');
      assert.deepEqual(await storage.read(buildStorageKey(id)), content);
    });

    test('مفتاح يخرج من الجذر مرفوض عند القراءة', () => {
      assert.throws(
        () => storage.absolutePathFor('../../outside'),
        AttachmentValidationError,
      );
    });

    test('قراءة مفتاح غير موجود ⇒ AttachmentFileMissing (و readIfPresent ⇒ null)', async () => {
      const missingKey = buildStorageKey('99999999-1111-2222-3333-444444444444');
      await assert.rejects(() => storage.read(missingKey), /غير موجود/);
      assert.equal(await storage.readIfPresent(missingKey), null);
    });
  });

  describe('مطابقة أرشيف الجود التاريخي بالاسم/المرجع فقط (§30)', () => {
    let exportRoot = '';
    let attachDir = '';

    /** يبني حزمة تصدير مصغّرة: مجلد `attachfile` بالملفات المطلوبة. */
    async function buildExportFolder(files: Record<string, Buffer>): Promise<string> {
      exportRoot = await mkdtemp(join(os.tmpdir(), 'alsqaya-joud-'));
      attachDir = join(exportRoot, ARCHIVE_ATTACHMENTS_DIRNAME);
      await mkdir(attachDir, { recursive: true });
      for (const [name, content] of Object.entries(files)) {
        await writeFile(join(attachDir, name), content);
      }
      return attachDir;
    }

    after(async () => {
      if (exportRoot !== '') {
        await rm(exportRoot, { recursive: true, force: true });
      }
    });

    test('مطابقة فعلية: المرجع يربط ملفه بالنظر إلى الاسم', async () => {
      await buildExportFolder({ 'كتاب-1.pdf': fakePdf('one') });
      const files = await inspectArchiveFolder(attachDir);
      const report = mapArchiveReferencesToFiles(
        [{ reference: 'كتاب-1.pdf', transactionId: 'tx-1' }],
        files,
      );
      assert.equal(report.matched.length, 1);
      assert.equal(report.matched[0].filename, 'كتاب-1.pdf');
      assert.equal(report.matched[0].detectedMimeType, 'application/pdf');
      assert.ok(isVerifiableHash(report.matched[0].contentHash));
    });

    test('مرجع بلا ملف ⇒ missing (لا ربط، ولا حذف)', async () => {
      await buildExportFolder({ 'موجود.pdf': fakePdf('a') });
      const files = await inspectArchiveFolder(attachDir);
      const report = mapArchiveReferencesToFiles(
        [{ reference: 'غير-موجود.pdf', transactionId: 'tx-1' }],
        files,
      );
      assert.equal(report.missing.length, 1);
      assert.equal(report.missing[0].reference, 'غير-موجود.pdf');
      assert.equal(report.matched.length, 0);
    });

    test('ملف بلا مرجع ⇒ unreferenced: يُبلَّغ، لا يُربط ولا يُحذف', async () => {
      await buildExportFolder({
        'مرتبط.pdf': fakePdf('linked'),
        'يتيم.pdf': fakePdf('orphan'),
      });
      const files = await inspectArchiveFolder(attachDir);
      const report = mapArchiveReferencesToFiles(
        [{ reference: 'مرتبط.pdf', transactionId: 'tx-1' }],
        files,
      );
      assert.equal(report.matched.length, 1);
      assert.equal(report.unreferenced.length, 1);
      assert.equal(report.unreferenced[0].filename, 'يتيم.pdf');
      // الملف اليتيم ما زال موجوداً على القرص: «لا يُحذف» (§30).
      assert.ok(existsSync(join(attachDir, 'يتيم.pdf')), 'الملف غير المرتبط لم يُحذف');
    });

    test('لا ربط بترتيب الملفات ولا برقم الصف', async () => {
      // ترتيب معكوس عمداً: الملف الثاني في القرص مرتبط بالصف الأول.
      await buildExportFolder({
        'أ.pdf': fakePdf('first-by-name'),
        'ب.pdf': fakePdf('second-by-name'),
      });
      const files = await inspectArchiveFolder(attachDir);
      const report = mapArchiveReferencesToFiles(
        [
          { reference: 'ب.pdf', transactionId: 'tx-1' },
          { reference: 'أ.pdf', transactionId: 'tx-2' },
        ],
        files,
      );
      // كلٌّ ربط بالاسم الصحيح ولو اختلف عن ترتيب الصف.
      assert.equal(report.matched.length, 2);
      assert.equal(report.matched[0].filename, 'ب.pdf');
      assert.equal(report.matched[1].filename, 'أ.pdf');
    });

    test('لا ربط بتشابه الاسم: مرجع مختلف لا يطابق ملفاً قريب', async () => {
      await buildExportFolder({ 'كتاب-1.pdf': fakePdf('x') });
      const files = await inspectArchiveFolder(attachDir);
      // لا نطابق «كتاب-2.pdf» بـ«كتاب-1.pdf» ولا نبحث عن «أقرب مرشّح»:
      // المطابقة حرفية، والتشابه ليس دليلاً (§30).
      const report = mapArchiveReferencesToFiles(
        [{ reference: 'كتاب-2.pdf', transactionId: 'tx-1' }],
        files,
      );
      assert.equal(report.matched.length, 0);
      assert.equal(report.missing.length, 1);
      assert.equal(report.unreferenced.length, 1, 'الملف صار غير مرتبط لا محذوفاً');
    });

    test('مجلد داخل attachfile لا يُحسب ملفاً قابلاً للقراءة', async () => {
      exportRoot = await mkdtemp(join(os.tmpdir(), 'alsqaya-joud-bad-'));
      attachDir = join(exportRoot, ARCHIVE_ATTACHMENTS_DIRNAME);
      await mkdir(attachDir, { recursive: true });
      // مجلد بدل ملف: ليس ملفاً، فلا يدخل الجرد ولا يُربط.
      await mkdir(join(attachDir, 'تالف.pdf'), { recursive: true });

      const files = await inspectArchiveFolder(attachDir);
      assert.equal(files.length, 0, 'المجلد لا يُحسب ملفاً');
    });

    test('مجلد attachfile غير موجود ⇒ لا ملفات ولا ارتباط (لا صمت)', async () => {
      const missing = join(os.tmpdir(), 'alsqaya-no-such-export-dir');
      const files = await inspectArchiveFolder(missing);
      assert.deepEqual(files, []);
      const report = mapArchiveReferencesToFiles(
        [{ reference: 'أي.pdf', transactionId: 'tx-1' }],
        files,
      );
      assert.equal(report.missing.length, 1);
    });
  });
});