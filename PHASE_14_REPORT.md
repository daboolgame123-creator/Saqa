# PHASE_14_REPORT — Attachments & Central File Storage

> المرجع الملزم: `ALSQAYA_PLAN.md` §30. هذا التقرير يتبع بروتوكول §53 (عشرة بنود).
> لا يعيد تعريف المرحلة ولا يوسّعها؛ يوثّق ما نُفِّذ فعلاً فقط.

---

## 1. Scope implemented · النطاق المُنفَّذ

| بند §30 | الحالة | الموضع |
|---|---|---|
| التخزين المركزي هو المصدر المعتمد للملفات | ✅ | `server/src/storage/fileStorage.ts` |
| البايتات خارج PostgreSQL والـmetadata داخله | ✅ | `fileStorage.ts` + `repositories/attachmentRepository.ts` |
| الوصول عبر Backend بعد التحقق من الصلاحية | ✅ | `api/routes/resources.ts` + `api/services/attachmentService.ts` |
| لا مشاركة مباشرة لمجلد الأرشيف عبر Windows | ✅ | لا `express.static` في أي مكان (حارس آلي) |
| عدم الاعتماد على مسار مجلد الجود إنتاجياً | ✅ | `historicalArchiveImport.ts` يقرأ المصدر للفحص فقط |
| metadata كاملة (stable ID · filename · MIME · size · created date · hash · storage key · OCR · integrity) | ✅ | الترحيل `0007` + `AttachmentRecord` |
| الاسم الأصلي لا يُستخدم كمعرّف | ✅ | `sanitizeOriginalFilename` + `buildStorageKey(stableId)` |
| منع path traversal | ✅ | `assertPathWithinRoot` + فحص شكل المعرّف |
| MIME validation من المحتوى لا الامتداد | ✅ | `detectMimeType` بتوقيعات بايتية |
| size limits | ✅ | `attachmentMaxFileSizeBytes` (الطلب + الخدمة) |
| filename sanitization | ✅ | `sanitizeOriginalFilename` |
| access check | ✅ | `requireVisibleTransaction` قبل أي لمسة للقرص |
| هوية وmetadata مستقلان لكل مرفق | ✅ | كل صف مرفق مستقل بمعرّفه |
| دعم بنية `attachfile/` من الجود | ✅ | `ARCHIVE_ATTACHMENTS_DIRNAME` + `inspectArchiveFolder` |
| مطابقة حرفية للاسم/المرجع حصراً | ✅ | `mapArchiveReferencesToFiles` |
| مرجع بلا ملف ⇒ يُكتشف | ✅ | `report.missing` |
| ملف بلا مرجع ⇒ لا يُحذف ويُسجَّل | ✅ | `report.unreferenced` |
| سلامة المرفق أثناء الاستيراد | ✅ | `inspectArchiveFolder` |

**لم يُنفَّذ تنفيذ الاستيراد الفعلي** (Phase 31) ولا قراءة Excel — الطبقة تُنتج التقرير فقط.

---

## 2. Files changed · الملفات المتغيّرة

### جديد — القاعدة (1)

`server/migrations/0007_attachment_storage.sql` — إضافة `size_bytes` · `created_date` · `integrity_state` + CHECK + فهرس فريد على `storage_key`.

### جديد — طبقة التخزين (7)

`server/src/storage/` — `index.ts` · `fileValidation.ts` · `fileStorage.ts` · `integrity.ts` · `integrityState.ts` · `storageErrors.ts` · `historicalArchiveImport.ts`

### جديد — المستودع وطبقة الـAPI (5)

`server/src/repositories/attachmentRepository.ts` · `server/src/api/dto/attachment.ts` · `server/src/api/services/attachmentService.ts` · `server/src/api/controllers/attachmentController.ts` · `server/src/api/validation/attachmentUpload.ts`

### جديد — الاختبارات (2)

`server/tests/storage.test.ts` (28 حالة) · `server/tests/api/attachments.test.ts` (12 حالة)

### مُعدَّل (كود — 9)

| الملف | التغيير |
|---|---|
| `server/src/config/env.ts` | `attachmentStorageDir` + `attachmentMaxFileSizeBytes` والتحقق منهما |
| `server/src/repositories/contracts.ts` | `AttachmentRecord` · `CreateStoredAttachmentInput` · `AttachmentRepository` |
| `server/src/repositories/index.ts` | تصدير `PgAttachmentRepository` |
| `server/src/api/dto/index.ts` | تصدير DTOs المرفق |
| `server/src/api/services/index.ts` | مستودع المرفقات + `AttachmentApiService` + تمرير `FileStorage` |
| `server/src/api/controllers/index.ts` | تصدير controllers المرفق |
| `server/src/api/controllers/shared.ts` | `uploadInput` (قراءة ترويسات الرفع) |
| `server/src/api/routes/resources.ts` | المسارات الأربعة + `rawAttachmentBody` |
| `server/tests/db/testDb.ts` | تعليق: لا جداول جديدة في 0007 |

### مُعدَّل (اختبارات — 4)

| الملف | التغيير |
|---|---|
| `server/tests/db/migrations.test.ts` | 6 ← 7 إصدارات · تراجع خطوتين · `ALTER TABLE`/`DROP COLUMN` |
| `server/tests/scope.test.ts` | حارس «storage محجوز» ← حارس تنفيذ Phase 14 + حارس عدم خدمة القرص |
| `server/tests/api/apiTestHelpers.ts` | `postAttachment` · `getAttachmentContent` · حقن `FileStorage` |
| `server/tests/api/apiTestSuite.ts` | تمرير `FileStorage` الاختياري |

### مُعدَّل (توثيق — 4)

`ALSQAYA_PLAN.md` (حالة المرحلة + تقرير الإنجاز) · `README.md` · `.env.example` · `PHASE_14_REPORT.md` (هذا الملف)

### محذوف (1)

`server/src/storage/.gitkeep` — المجلد لم يعد محجوزاً.

---

## 3. Files intentionally untouched · ملفات لم تُلمس عمداً

| الملف/المجلد | السبب |
|---|---|
| `src/**` بالكامل (React) | تغيير الواجهة ليس من نطاق §30 |
| `src/utils/attachmentUtils.ts` | `processUploadedFile`/`getAttachmentPreviewUrl` سلوك واجهة |
| `server/src/audit/**` | Phase 15 — ما زالت محجوزة بحارس آلي |
| `server/src/auth/**` · `server/src/authorization/**` | Phase 11/12 مكتملة ولا تعارض |
| `server/migrations/0001`–`0006` | لا تعديل على ترحيلات مُطبَّقة (checksum يرفضه) |
| `server/src/repositories/transactionRepository.ts` | مسار المرفقات الوصفية القائم بقي كما هو |
| `server/tests/api/availability.test.ts` | 6 أخطاء أنواع قديمة من Phase 13 — خارج النطاق |
| `src/core/models/transaction.ts` | نموذج الواجهة — لا حقل خُترع فيه |

---

## 4. Tests executed · الاختبارات المُنفَّذة

| # | الأمر | النطاق |
|---|---|---|
| 1 | `npm run lint` (`tsc --noEmit`) | فحص الأنواع |
| 2 | `npm run build` (`vite build`) | بناء الواجهة |
| 3 | `npm run test:server` | وحدة الخادم (يشمل `storage.test.ts`) |
| 4 | `npm run test:db` | الترحيلات والقاعدة |
| 5 | `npm run test:api` | تكامل HTTP (يشمل `attachments.test.ts`) |
| 6 | `npm run test:all` | السلسلة الكاملة |

### بنود §30 المُغطّاة

| بند الاختبار | الاختبار |
|---|---|
| upload | `رفع مرفق: 201، metadata كاملة…` |
| download authorized | `تحميل مصرَّح به: البايتات نفسها…` |
| download denied | `تحميل مرفق كتاب خارج النطاق ممنوع: 404 لا 403…` |
| corrupted file detection | `كشف الملف التالف… ⇒ corrupted` |
| hash verification | `التحقق من البصمة…` + `البصمة تُحسب وتُقرأ` |
| multiple attachments | `قائمة مرفقات الكتاب: مرفق واحد أو عدة…` |
| attachment-to-document relation | نفس الاختبار + `مرفق بـtransactionId مختلف ⇒ 404` |
| historical attachment import mapping | `مطابقة فعلية: المرجع يربط ملفه…` |
| missing referenced attachment detection | `مرجع بلا ملف ⇒ missing` |
| unreferenced attachment reporting | `ملف بلا مرجع ⇒ unreferenced…` |
| MIME validation | `امتداد .pdf ومحتوى نصي ⇒ رفض` · `اختلاف النوع المعلن…` |
| path traversal protection | `مسار في الاسم يُسقط…` · `مفتاح يخرج من الجذر مرفوض` · `معرّف فيه محرف مسار مرفوض` |

**زيادة على المطلوب** (بنود صرّحت بها §30): `الملف المفقود ⇒ missing` · `بلا جلسة ⇒ 401` · `المنتسب مرفوض من الرفع بـ403` · `لا ربط بترتيب الملفات` · `لا ربط بتشابه الاسم` · `مجلد attachfile غير موجود ⇒ لا صمت`.

---

## 5. Test results · النتائج

| الفحص | النتيجة |
|---|---|
| `npm run build` | ✅ نجح — `1728 modules transformed`، `built in 25.56s`. تحذير حجم الحزمة >500kB **قائم مسبقاً** |
| `npm run test:server` | ✅ **110 / 110** — 0 فشل (كان 82 قبل المرحلة) |
| `npm run test:db` | ✅ **43 / 43** — 0 فشل |
| `npm run test:api` | ✅ **125 / 125** — 0 فشل (كان 113 قبل المرحلة) |
| `npm run test:all` | ✅ **278 / 278** — 0 فشل |
| `npm run lint` | ⚠️ **يفشل بـ6 أخطاء قديمة** خارج نطاق المرحلة (بند 7) |

`storage.test.ts` وحدها: 28/28. `attachments.test.ts` وحدها: 12/12.


---

## 6. Known limitations · قيود معروفة

1. **تنفيذ الاستيراد التاريخي غير موجود** — الطبقة تُنتج `ArchiveImportReport` فقط. التنفيذ هو Phase 31، ولم يُحاكَ.
2. **قراءة Excel غير موجودة** — `mapArchiveReferencesToFiles` يستقبل `ArchiveAttachmentReference[]` جاهزة. قارئ Excel قرار Phase 30/31.
3. **لا حذف مرفق** — لا مسار HTTP للحذف. Phase 16 (Soft Delete).
4. **`ocr_state` بلا قيم** — `NULL` دائماً حتى Phase 17.
5. **الصيغ المدعومة 6** (PDF · PNG · JPEG · GIF · TIFF · WebP). أي صيغة أخرى — بما فيها `text/plain` و`.docx` غير المضغوط — تُرفض لأن محتواها لا يمكن التحقق منه بتوقيع ثابت. **توسيع القائمة قرار يحتاج نصاً في الخطة**، ولم يُخترع.
6. **الرفع ملف واحد لكل طلب** — الرفع المتعدد يقتضي نداءات متعددة، وقصور مقصود للتبسيط.
7. **`file_size`/`upload_date` نصية تبقى نصية** — لم تُحوَّل إلى أرقام (بند 7.2).
8. **لا مسح لليتيمة** — إن فشل الحفظ بعد إنشاء السجل، يبقى بـ`integrity_state='missing'`. التنظيف الآلي لم يُخترع.

---

## 7. Deviations from plan · انحرافات عن الخطة

### 7.1 ستة أخطاء أنواع قديمة في `availability.test.ts` — **لم تُصلَح**

خارج نطاق §30. موثّقة أصلاً في `PHASE_13_REPORT.md` كبند مستقل:

| السطر | الخطأ |
|---|---|
| 55 | `phoneNumber` غير موجود في `NewAccountOptions` (المفتاح `phone`) |
| 106 | `visibility` غير موجود في `TransactionBody` |
| 175 · 177 | `JsonResponse<TransactionBody>` يُسند إلى `ApiErrorBody` |
| 312 · 313 | `subject` غير موجود في `TransactionBody` |

الأثر: `npm run lint` يفشل، لكن `test:api` يمرّ كاملاً (يُشغَّل بـ`tsx` الذي يتجاهل الأنواع). الإصلاح توسيع `TransactionBody` و`NewAccountOptions` — تغيير في اختبارات Phase 13 لا علاقة له بالمرفقات، وتُرك لتفادي تعديل خارج النطاق.

### 7.2 تعليق `file_size`/`upload_date` في الترحيل 0002

الترحيل 0002 يقول: «التحليل إلى قيم رقمية/تواريخ موحدة عند Phase 14». **لم يُنفَّذ** لأنه يقتضي كتابة فوق بيانات تاريخية (القيم نص عرض). أُضيفت أعمدة رقمية جديدة بدلاً منه — وهذا يوافق قاعدة «لا ترحيل تدميري» التي تعلو على التعليق التوجيهي.

### 7.3 `attachments` تحت مسار `/transactions`

§30 لا ينص على شكل المسار. الاختيار `/api/transactions/:id/attachments` لأنه يجعل **رؤية الكتاب** شرطاً بنيوياً في المسار نفسه، فلا يمكن طلب مرفق دون التصريح بكتابه.


---

## 8. Business-rule decisions used · قرارات استخدام القواعد

**لا قاعدة أعمال جديدة.** كل قرار هو **تنفيذ تقني** لبنود §30، والقيم مشتقّة من نصها:

| القرار | سند §30 |
|---|---|
| `integrity_state` أربع قيم (`verified`/`corrupted`/`missing`/NULL) | §30 «integrity state» + بنود «corrupted file detection» و«hash verification» |
| `NULL` تعني «لم يُفحص» لا «سليم» | مبدأ fail-closed في الخطة |
| البصمة بمعرّف الخوارزمية `sha256:<hex>` | §30 «hash»؛ العمود بلا قيد فالقيمة الغامضة لا تُصدَّق |
| المفتاح من stable ID لا من الاسم | §30 «دون استخدام الاسم الأصلي كمعرّف داخلي أساسي» |
| المطابقة حرفية بلا تطبيع | §30 «وليس التخمين… أو تشابه الاسم» |
| الملف غير المرتبط لا يُحذف ولا يُربط | §30 «الملفات غير المرتبطة» |
| 404 لا 403 لكتاب خارج النطاق | Phase 13 §29 (موروث ولا يُغيَّر) |
| `ocr_state = NULL` | §30 يذكر الحقل؛ القيم في Phase 17 |
| لا مسار حذف | §13/§32 + Phase 16 (Soft Delete) |

---

## 9. Git commit

```text
feat(storage): implement phase 14 - attachments and central file storage
```

---

## 10. Stop

**توقّف.** Phase 15 لم تبدأ ولم يُكتب منها سطر. مجلد `audit/` ما زال محجوزاً بـ`.gitkeep` ويحرسه `server/tests/scope.test.ts`.

---