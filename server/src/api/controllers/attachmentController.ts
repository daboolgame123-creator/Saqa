/**
 * رفع وتحميل مرفقات الكتب (Phase 14).
 *
 * HTTP فقط. ثلاث مسؤوليات موزّعة كما يجب:
 *   - المسار `GET /content` يكتب **الملف** لا JSON، فترويسات
 *     `Content-Type` و`Content-Disposition` تُبنى هنا. لا `json()` هنا.
 *   - الرفع يستقبل بايتات خام (`rawAttachmentBody`) لا `multipart/form-data`.
 *     السبب قرار: `express.json()` أضيق، وملف واحد لكل طلب يبسّط الفحص
 *     والحساب ولا يحتاج مكتبة رفع خارجية. `multipart` مجرّد التفاف.
 *   - `attachmentUploadHeaders` يقرأ الترويسات بعد التحقق منها، فلا يقرأ
 *     الـcontroller من `req.headers` مباشرة.
 */
import type { RequestHandler } from 'express';
import { servicesOf } from '../serviceContext';
import { transactionScopeOf } from '../../authorization';
import { auditActor, asyncHandler, created, ok, pathId, uploadInput } from './shared';
import { rawAttachmentBody } from '../validation/attachmentUpload';
import { config } from '../../config';

/** GET /api/transactions/:id/attachments — مرفقات كتاب ضمن النطاق. */
export const listAttachments: RequestHandler = asyncHandler(async (req, res) => {
  const scope = transactionScopeOf(req) ?? undefined;
  const services = servicesOf(req);
  ok(res, await services.attachments.list(pathId(req), scope));
});

/**
 * POST /api/transactions/:id/attachments — رفع مرفق واحد.
 *
 * البايتات تصل كـBuffer خام. الفحص كله في الخدمة (الحجم، MIME من المحتوى،
 * التنظيف، البصمة)؛ هنا فقط الترويسات والحجم العرضي.
 */
export const uploadAttachment: RequestHandler = asyncHandler(async (req, res) => {
  const scope = transactionScopeOf(req) ?? undefined;
  const services = servicesOf(req);
  const headers = uploadInput(req);

  created(
    res,
    await services.attachments.upload(
      {
        transactionId: pathId(req),
        originalFilename: headers.originalFilename,
        declaredMimeType: headers.declaredMimeType,
        content: headers.content,
        // `type` يأتي من العميل لكنه **مُتحقَّق منه** بقائمة الخطة، فلا
        // قيمة حرة. الافتراضي كatalog قيمة قائمة لا نص حر.
        type: headers.attachmentType,
        createdDate: headers.createdDate,
        maxSizeBytes: config.attachmentMaxFileSizeBytes,
        fileSize: headers.fileSize,
      },
      scope,
    ),
  );
});

/**
 * GET /api/transactions/:id/attachments/:attachmentId/content — تحميل الملف.
 *
 * **هذا هو المسار الوحيد الذي يلمس بايتات الملف** (§30: يُقدَّم عبر Backend
 * بعد authorization). لا يوجد مسار آخر في النظام يقرأ من القرص.
 */
export const downloadAttachmentContent: RequestHandler = asyncHandler(async (req, res) => {
  const scope = transactionScopeOf(req) ?? undefined;
  const services = servicesOf(req);
  const result = await services.attachments.download(
    pathId(req),
    pathId(req, 'attachmentId'),
    scope,
  );

  // الترتيب الأمني (§31): المصادقة ← التفويض ← النطاق ← الوصول ←
  // **الآن** حدث `sensitive_file_access`. محاولة مرفوضة (404/403) لا
  // تصل إلى هنا فلا تُسجَّل كوصول ناجح، ولا يجعل التدقيق ممراً للوصول.
  await services.audit.recordAttachmentAccess(auditActor(req), {
    transactionId: pathId(req),
    attachmentId: pathId(req, 'attachmentId'),
    originalFilename: result.originalFilename,
    mimeType: result.mimeType,
  });

  res.setHeader('Content-Type', result.mimeType);
  // `attachment` لا `inline`: الملف لا يُنفَّذ في سياق الصفحة، ولا يُستخدم
  // كـURL دائم يمكن تداوله خارج النظام. الاسم في `filename`-encoded لأن
  // الأسماء العربية لا تُنقل بترميز latin1 في الترويسة.
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(result.originalFilename)}`,
  );
  res.setHeader('Content-Length', String(result.content.length));
  // لا تخزين مؤقت: الوصول مرتبط بصلاحية قد تتغير، والملف حسّاس.
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(result.content);
});

/**
 * GET /api/transactions/:id/attachments/:attachmentId/integrity
 * — فحص السلامة: يعيد حالة الملف كما قُرئ من القرص ويحدّثها.
 *
 * مسار قراءة (`GET`) لا يفرض `update` لأنه لا يغيّر العمل، بل يحدّث
 * **مشاهدة** مشتقّة (حالة السلامة) — وهي قراءة من القرص لا كتابة على العمل.
 */
export const verifyAttachmentIntegrity: RequestHandler = asyncHandler(async (req, res) => {
  const scope = transactionScopeOf(req) ?? undefined;
  const services = servicesOf(req);
  ok(
    res,
    await services.attachments.verifyIntegrity(
      pathId(req),
      pathId(req, 'attachmentId'),
      scope,
    ),
  );
});
