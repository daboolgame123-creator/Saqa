# PHASE 8 REPORT — Backend Foundation

**التاريخ:** 2026-09-25
**المرجع الوحيد:** `ALSQAYA_PLAN.md` (القسم 24 — PHASE 8)
**الفرع:** `phase-0-baseline`
**نقطة الاسترجاع الرسمية قبل المرحلة:** `d1dd8bc` — لم تُعدّل ولم تُحذف
**الحالة:** ✅ مكتملة ومُختبرة (لا Git commit — حسب التعليمات)

---

## 1. الحالة (Status)

**مكتملة — بما فيها بنود القسم 24 الإضافية.** أُنشئ هيكل Backend مستقل وقابل للتوسع في `server/`، مع:

* فصل كامل بين إنشاء تطبيق Express (`app.ts`) وتشغيل HTTP server (`server.ts`).
* طبقة إعدادات مركزية (`config/env.ts`) تتحقق من القيم وترفض غير الصالح.
* فحوصات صحّة منفصلتين: `GET /health` (العملية تعمل) و`GET /health/ready` (جاهز لاستقبال الطلبات).
* معرّف طلب لكل طلب HTTP (`requestId`) يظهر في الاستجابة وفي كل سجل وخطأ.
* سجل تقني منظم (structured logging) بمستويات وتصفية (redaction) — دون تسجيل أجسام أو ترويسات أو سلسلة استعلام.
* معالجة أخطاء مركزية (404 + 500 + `AppError`/`ValidationError`).
* طبقة تحقق من مدخلات HTTP (`validation/`) بنتيجة مميّزة صريحة (`kind: 'valid' | 'invalid'`).
* بنية أساسية للعمليات المجدولة (`jobs/`: سجل + مشغّل) بلا أي وظيفة أعمال بعد.
* `graceful shutdown` متدرّج وقابل للتكرار.
* اختبارات آلية (54 اختبارًا في 12 مجموعة) عبر `node:test` دون أي تبعية اختبار جديدة.

لم يُنفَّذ أي جزء من المراحل اللاحقة، ولم يُلمس أي كود Frontend قائم.

---

## 2. الملفات التي أُنشئت أو عُدِّلت (Files Changed)

### ملفات جديدة — Backend

| الملف | المسؤولية |
|------|-----------|
| `server/src/app.ts` | إنشاء تطبيق Express وربط middleware + routes (بلا فتح منفذ، بلا منطق أعمال) |
| `server/src/server.ts` | نقطة التشغيل: `startBackend` (الوظائف ثم الخادم) + `startServer` / `closeServer` / `createShutdownHandler` / `registerShutdownHandlers` |
| `server/src/config/env.ts` | الإعدادات المركزية (`NODE_ENV`، `PORT`، `LOG_LEVEL`) + التحقق منها |
| `server/src/config/index.ts` | barrel |
| `server/src/errors/AppError.ts` | الخطأ الأساسي (statusCode + code + isOperational) |
| `server/src/errors/NotFoundError.ts` | خطأ 404 منظم |
| `server/src/errors/index.ts` | barrel |
| `server/src/middleware/errorHandler.ts` | معالج الأخطاء المركزي + تصنيف الأخطاء + منع تسريب التفاصيل |
| `server/src/middleware/notFoundHandler.ts` | تحويل أي مسار غير مطابق إلى `NotFoundError` |
| `server/src/middleware/index.ts` | barrel |
| `server/src/health/healthService.ts` | بناء استجابة فحص الصحة (بلا فحص قاعدة بيانات) |
| `server/src/health/index.ts` | barrel |
| `server/src/controllers/healthController.ts` | `GET /health` و`GET /health/ready` handlers |
| `server/src/controllers/index.ts` | barrel |
| `server/src/routes/healthRoutes.ts` | راوتر `/health` و`/health/ready` منفصل عن بقية الـAPI |
| `server/src/routes/index.ts` | الراوتر الأساسي الذي يُركِّب الراوترات الفرعية |
| `server/src/errors/ValidationError.ts` | خطأ 400 للمدخلات غير الصالحة (يحتوي قائمة المشاكل) |
| `server/src/middleware/requestId.ts` | تثبيت معرّف طلب آمن لكل طلب (قبول القيمة الآمنة من العميل أو توليده) |
| `server/src/middleware/requestLogger.ts` | سجل كل طلب مكتمل: الطريقة والمسار والحالة والمدة ومعرّف الطلب |
| `server/src/middleware/requestPath.ts` | مصدر موحّد للمسار في السجلات والأخطاء — بديل `req.path` ويحذف سلسلة الاستعلام |
| `server/src/logging/logTypes.ts` | أنواع السجل ومستوياته وحقول التصفية |
| `server/src/logging/logger.ts` | `TechnicalLogger` المنظم (مستويات + redaction + صيغة JSON سطرية) |
| `server/src/logging/index.ts` | barrel |
| `server/src/validation/validationTypes.ts` | نتيجة التحقق المميّزة (`kind: 'valid' \| 'invalid'`) |
| `server/src/validation/validateRequest.ts` | `createValidationMiddleware` — middleware للتحقق من مدخلات HTTP |
| `server/src/validation/index.ts` | barrel |
| `server/src/jobs/jobTypes.ts` | عقد الوظيفة المجدولة ونتيجة تشغيلها |
| `server/src/jobs/jobRegistry.ts` | سجل الوظائف (يبدأ فارغًا — لا وظائف أعمال في Phase 8) |
| `server/src/jobs/jobRunner.ts` | مشغّل دوري بلا تراكب، يسجّل أخطاء الوظائف دون إسقاط العملية |
| `server/src/jobs/index.ts` | barrel |
| `server/src/health/readinessService.ts` | بناء استجابة الجاهزية (`GET /health/ready`) — 503 عند البدء/الإغلاق |
| `server/src/utils/lifecycleState.ts` | حالة دورة حياة العملية (`starting/ready/shutting-down`) |
| `server/src/utils/index.ts` | barrel |
| `server/tests/helpers.ts` | أدوات الاختبار (تشغيل تطبيق، التقاط السجلات، انتظار الاستماع) |
| `server/tests/*.test.ts` (8 ملفات) | 54 اختبارًا: الصحة/الجاهزية، الأخطاء، السجل، معرّف الطلب، التحقق، الوظائف المجدولة، دورة الحياة، النطاق |
| `server/src/auth/.gitkeep` | مجلد محجوز — Phase 11 |
| `server/src/authorization/.gitkeep` | مجلد محجوز — Phase 12 |
| `server/src/storage/.gitkeep` | مجلد محجوز — Phase 14 |
| `server/src/audit/.gitkeep` | مجلد محجوز — Phase 15 |
| `server/src/services/.gitkeep` | مجلد محجوز — طبقة الخدمات |
| `server/src/repositories/.gitkeep` | مجلد محجوز — طبقة المستودعات |

> `.gitkeep` هي الطريقة الوحيدة لتثبيت مجلدات الهيكل المحجوزة في Git دون إضافة ملفات كود غير مستخدمة — ولا تحتوي أي منطق.

### ملفات معدّلة

| الملف | التعديل |
|------|---------|
| `package.json` | ثلاثة سكربات جديدة (`server:dev`، `server:start`، `test:server`) + إضافة `express` في dependencies + `@types/express` و`tsx` في devDependencies |
| `package-lock.json` | ناتج `npm install` لتبعيات الـBackend (express + شجرة تبعياته). **لم يُحذف أي حزمة قائمة** |
| `.env.example` | توثيق `NODE_ENV` و`PORT` (4000) و`LOG_LEVEL` |

### ملفات لم تُلمس

كل `src/**` (Frontend)، وكل `docs/**`، و`vite.config.ts`، و`tsconfig.json`، و`index.html`، و`ALSQAYA_PLAN.md`، و`Architecture.md`، و`PROJECT_RULES.md`، و`PROJECT_VISION.md`، و`README.md`، وتقارير المراحل 0–7 — **بدون أي تعديل**.

### تبعيات جديدة (مُبرَّرة)

| الحزمة | النوع | الإصدار | السبب |
|------|------|---------|------|
| `express` | dependency | `^5.2.1` | مطلوبة صراحة في Phase 8 (Node.js + Express + TypeScript) |
| `@types/express` | devDependency | `^5.0.6` | أنواع TypeScript لـExpress (بدونها لا يمر `tsc`) |
| `tsx` | devDependency | `^4.23.15` | تشغيل ملفات TypeScript للـBackend مباشرة (`server:start`/`server:dev`) |

> ملاحظة: هذه الحزم الثلاث كانت قد أُزيلت في Phase 0 لأنها كانت بقايا قالب AI Studio **غير مستخدمة**. في Phase 8 أصبحت مطلوبة فعليًا، ولذلك أُعيدت. لا توجد أي حزمة أخرى مضافة.

---

## 3. المعمارية (Architecture)

### الهيكل الفعلي

```text
server/
├── tests/                    8 ملفات اختبار + helpers (node:test — بلا تبعيات جديدة)
└── src/
    ├── app.ts                  إنشاء تطبيق Express (بلا منفذ، بلا منطق أعمال)
    ├── server.ts               تشغيل HTTP server + الإغلاق المتدرّج
    ├── config/                 الإعدادات المركزية (NODE_ENV / PORT / LOG_LEVEL)
    ├── routes/                 الراوتر الأساسي + راوتر /health و/health/ready
    ├── controllers/            معالجات الطلبات
    ├── health/                 فحص الصحة + فحص الجاهزية
    ├── logging/                السجل التقني المهيكل (مستويات + تصفية)
    ├── validation/             عقد التحقق و middleware التحقق من المدخلات
    ├── jobs/                   سجل الوظائف المجدولة + المشغّل (فارغ من الوظائف)
    ├── utils/                  حالة دورة حياة العملية
    ├── middleware/             requestId + requestLogger + requestPath + 404 + الأخطاء
    ├── errors/                 AppError + NotFoundError + ValidationError
    ├── auth/                   (محجوز — Phase 11)
    ├── authorization/          (محجوز — Phase 12)
    ├── storage/                (محجوز — Phase 14)
    ├── audit/                  (محجوز — Phase 15)
    ├── services/               (محجوز)
    └── repositories/           (محجوز)
```

### مسار الطلب

```text
HTTP request
   ↓
requestIdMiddleware       (معرّف طلب آمن + ترويسة X-Request-Id)
   ↓
requestLogger             (يستعد لتسجيل الطلب عند اكتماله)
   ↓
express.json()            (قراءة JSON)
   ↓
createRoutes()  →  /health  →  getHealth     →  HealthService
                →  /health/ready → getReadiness →  ReadinessService
   ↓ (تحقق من المدخلات عند الحاجة)
createValidationMiddleware → 400 + قائمة المشاكل عند الفشل
   ↓ (لا مطابقة)
notFoundHandler  →  NotFoundError  (المسار فقط — بلا سلسلة استعلام)
   ↓ (أي خطأ)
createErrorHandler  →  { error: { code, message, details?, stack?, requestId? } }
```

### الفصل بين Health و Readiness

| | `GET /health` | `GET /health/ready` |
|---|---|---|
| المعنى | هل العملية حيّة؟ | هل النظام جاهز لاستقبل الطلبات الآن؟ |
| حالة البدء (`starting`) | 200 | **503** |
| حالة التشغيل (`ready`) | 200 | 200 |
| حالة الإغلاق (`shutting-down`) | 200 | **503** |
| فحص قاعدة بيانات | لا (لا توجد قاعدة في Phase 8) | لا (يُضاف لاحقًا عند وجودها) |

### القرارات التصميمية

| القرار | التفصيل |
|------|---------|
| فصل App عن Server | `createApp()` لا تفتح منفذًا؛ `startServer()` هي المسؤولة عن `listen`. يسمح بتشغيل التطبيق في الاختبارات على منفذ عشوائي |
| نقطة تشغيل واحدة | `server.ts` يشغّل الخادم عند التنفيذ المباشر فقط (`isDirectRun`) — الاستيراد لا يشغّل خادمًا |
| حارس التنفيذ المباشر | يُقارن `process.argv[1]` مع `import.meta.url` عبر `realpathSync` (متوافق مع tsx وWindows) |
| الإعدادات | تُقرأ من `process.env` فقط؛ لا `dotenv` ولا إعداد قاعدة بيانات/JWT/تخزين ملفات. قيمة غير صالحة تُفشل التشغيل برسالة واضحة |
| المنفذ الافتراضي | `4000` (تقني — لتجنّب التعارض مع منفذ Vite وهو 3000) |
| صيغة الأخطاء | `{ error: { code, message, stack? } }` موحّدة لكل الأخطاء؛ `stack` يُضاف **فقط** خارج `production` |
| منع التسريب | أي خطأ غير معروف يُترجم إلى `500 / INTERNAL_ERROR` برسالة عامة، ويُسجَّل تقنيًا في مخرجات الخادم |
| لغة العقد | الرسائل بالعربية (لأن العميل عربي)، وأكواد الأخطاء بالإنكليزية (`NOT_FOUND`, `INTERNAL_ERROR`) |
| الإغلاق المتدرّج | `SIGINT`/`SIGTERM` → إيقاف مشغّل الوظائف، تعليم النظام «غير جاهز»، ثم إغلاق الخادم وانتظار الاتصالات القائمة. المتكرر لا يغيّر النتيجة (idempotent) |
| الصحة مقابل الجاهزية | `Health` = العملية تعمل؛ `Readiness` = جاهز لاستقبال الطلبات. `Readiness` يعيد 503 أثناء البدء والإغلاق بينما يبقى `Health` 200 |
| معرّف الطلب | `requestIdMiddleware` أول middleware: يقبل قيمة العميل إذا طابقت النمط الآمن والأطول 128، وإلا يولّد UUID. يُعاد في `X-Request-Id` وفي كل سجل وفي جسم الخطأ |
| السجل التقني | `TechnicalLogger` بمستويات (`debug/info/warn/error`) من `LOG_LEVEL`، صيغة JSON سطرية واحدة لكل سطر، مصادر (`http`, `server`, `jobs`، …) |
| خصوصية السجل | لا يُسجَّل جسم الطلب ولا الترويسات ولا سلسلة الاستعلام؛ الكلمات الحساسة (password/otp/token/secret/…) تُصفّى تلقائيًا. المسار يُؤخذ من `originalUrl` عبر `getRequestPath` لا من `req.path` (الذي يقصّه الراوتر) |
| التحقق من المدخلات | نتيجة مميّزة `kind: 'valid' \| 'invalid'` (وليس مُميّز boolean — راجع §5.2) تضيق التضييق النوعي دون حيل، و`ValidationError` = 400 منظم بقائمة مشاكل |
| العمليات المجدولة | `jobRegistry` (تسجيل/إزالة/منع التكرار) + `jobRunner` (مؤقتات بلا تراكب، لا يُسقط أخطاء الوظائف بل يسجّلها). السجل **فارغ** في Phase 8: لا وظيفة أعمال قبل موعدها |
| دورة الحياة | `LifecycleState` أحادي الحالة (`starting/ready/shutting-down`) تُشتق منه الجاهزية؛ يصبح `ready` عند إطلاق حدث `listening` فعليًا لا قبله |
| TypeScript | لا يوجد `tsconfig` جديد — كود الـBackend يمرّ تحت `tsconfig.json` الحالي كما هو (بلا تعارض) |

---

## 4. الاختبارات (Tests)

### أوامر المشروع

| الأمر | النتيجة | ملاحظة |
|------|--------|--------|
| `npm run lint` (= `tsc --noEmit` — وهو فحص الأنواع في هذا المشروع) | ✅ exit 0 | لا يوجد سكربت باسم `typecheck` في المشروع؛ `lint` هو فحص TypeScript |
| `npm run build` (Vite) | ✅ exit 0 | `1721 modules transformed` — الواجهة ما زالت تبنى بنجاح (تحذير حجم الحزمة >500kB **قائم مسبقًا** وليس من هذه المرحلة) |
| `npm run test:server` | ✅ 54/54 | `node --import tsx --test "server/tests/**/*.test.ts"` — 54 اختبارًا في 12 مجموعة، بلا أي تبعية اختبار جديدة |
| `git diff --check` | ✅ exit 0 | لا أخطاء مسافات/أسطر. تظهر تحذيرات LF/CRLF وهي سلوك Git قائم مسبقًا على كل ملفات المستودع (كلها LF، بدون BOM) |
| `npm run typecheck` | — | السكربت غير موجود في المشروع؛ `npm run lint` هو فحص الأنواع (انظر §5) |

### فحوصات Phase 8 التشغيلية (18/18 ناجحة)

شُغّلت عبر سكربت تحقق مؤقت (بحذف نهائي بعد التشغيل — غير موجود الآن في المشروع):

| # | الفحص | النتيجة |
|---|------|--------|
| 1 | استيراد `server.ts` لا يشغّل خادمًا تلقائيًا | PASS |
| 2 | الإعدادات: القيم الافتراضية `development` + `4000` | PASS |
| 3 | الإعدادات: قراءة `production` + `5050` | PASS |
| 4 | الإعدادات: رفض `NODE_ENV` غير صالح | PASS |
| 5 | الإعدادات: رفض `PORT` غير صالح | PASS |
| 6 | `GET /health` → 200 | PASS |
| 7 | `GET /health` يحمل `status: "ok"` + `uptimeSeconds` + `timestamp` ISO | PASS |
| 8 | مسار غير موجود → 404 | PASS |
| 9 | جسم 404 منظم (`code: NOT_FOUND` + رسالة) | PASS |
| 10 | `POST /health` → 404 (method غير مدعوم) | PASS |
| 11 | خطأ غير متوقع → 500 منظم | PASS |
| 12 | 500 عام + **بلا** `stack` | PASS |
| 13 | `AppError` مخصص يحافظ على `statusCode/code` وبلا `stack` | PASS |
| 14 | في وضع التطوير يظهر `stack` للتشخيص | PASS |
| 15 | في وضع التطوير يبقى 404 منظّمًا | PASS |
| 16 | `startServer` يستمع فعلًا | PASS |
| 17 | `startServer` يخدم `/health` | PASS |
| 18 | الإغلاق المتدرّج عند `SIGINT` يُغلق الخادم | PASS |

**TOTAL 18 | PASS 18 | FAIL 0**

> هذه الفحوصات نُفِّذت في الجولة الأولى من المرحلة قبل إنشاء `tests/`، وبقيت نتائجها سارية.

### الاختبارات الآلية — `npm run test:server` (54/54 ناجحة)

| الملف | المجموعة | الاختبارات | ما يغطيه |
|---|---|---|---|
| `health.test.ts` | Health & Readiness | 6 | `/health` 200، `/health/ready` 200/503، الفصل بينهما، غياب فحص قاعدة البيانات |
| `errors.test.ts` | الأخطاء المركزية + النطاق | 6 | 500 بلا تسريب، `AppError`، `NotFoundError`، `stack` في التطوير، `requestId` في كل خطأ، غياب مسارات المراحل اللاحقة |
| `requestId.test.ts` | معرّف الطلب + التوجيه | 11 | توليد/قبول/رفض المعرّفات، خلوّه من بيانات شخصية، 404 منظم، `X-Request-Id` في كل ردّ |
| `validation.test.ts` | `ValidationError` + middleware التحقق | 5 | بُعد 400 وحالته التشغيلية، أدوات النتيجة، 400 مع قائمة مشاكل، تمرير المدخلات الصالحة، عدم التغيير بلا مخطط |
| `logging.test.ts` | السجل التقني المهيكل | 8 | الحقول المنظمة، المستوى الأدنى، التصفية، سجل الطلب الكامل، عدم تسجيل سلسلة الاستعلام، تسجيل الأخطاء |
| `jobs.test.ts` | سجل + مشغّل الوظائف | 9 | السجل فارغ، رفض التكرار/الاسم الفارغ، العزل، تتابع بلا تراكب، إسقاط الوظيفة لا العملية |
| `serverLifecycle.test.ts` | نقطة التشغيل ودورة الحياة | 5 | الاستيراد لا يشغّل خادمًا، `startBackend` يصبح جاهزًا، الإغلاق المتدرّج وتكراره، `startServer` وحده |
| `scope.test.ts` | حواجز النطاق | 4 | وجود كل الطبقات المطلوبة، خلوّ المحجوزات، غياب تبعيات قاعدة/مصادقة، غياب الوظائف المجدولة |
| **المجموع** | **12 مجموعة** | **54/54** | |

```text
> npm run test:server
ℹ tests 54
ℹ suites 12
ℹ pass 54
ℹ fail 0
```

### عيوب اكتُشفت وأُصلحت بفضل الاختبارات

| # | العيب | الأثر | الإصلاح |
|---|------|-------|---------|
| 1 | `waitForListening` كان يعود بمجرد أن تصبح `server.listening = true` — وهذه تسبق إطلاق حدث `listening` في Node | الاختبار كان يقرأ الحالة `starting` بدل `ready` | انتظار حدث `listening` نفسه (مع توثيق السبب في `helpers.ts`) |
| 2 | `req.path` تعود `/` لمسار `/health` بعد اكتمال الردّ (الراوتر يقصّها) | سجل الطلب كان يكتب مسارًا خاطئًا للمسارات المتداخلة | مساعد `getRequestPath` يعتمد `originalUrl` ويحذف سلسلة الاستعلام |
| 3 | سكربت `test:server` كان يمرّر مجلدًا فيرفضه Node (`ERR_UNSUPPORTED_DIR_IMPORT`) | الاختبارات لا تعمل كمجموعة | استُبدل بنمط `server/tests/**/*.test.ts` |
| 4 | اختبار يفشل كان يسرّب خادمًا مفتوحًا فيمنع انتهاء العملية | تعليق كامل لمجموعة الاختبارات قبل طباعة تفاصيل الفشل | لُفّ الإغلاق في `finally` في كل اختبار يفتح خادمًا |
| 5 | `AppError` التشغيلي يُسجَّل بمستوى `warn` لا `error` | اختبار «الخطأ غير المتوقع» كان يستهدف سلوكًا خاطئًا | صحّح الاختبار ليستخدم `Error` عاديًا (خطأ غير متوقع حقيقيًا) |

### اختبار نقطة التشغيل الحقيقية

```text
> npm run server:start
> tsx server/src/server.ts
{"level":"info","message":"scheduled runner started",...,"data":{"jobCount":0,"jobs":[]}}
{"level":"info","message":"backend listening",...,"data":{"port":4000,"environment":"development"}}
```

```text
GET http://127.0.0.1:4000/health
HTTP_STATUS 200
BODY {"status":"ok","uptimeSeconds":7,"timestamp":"2026-09-25T16:04:25.232Z"}

GET http://127.0.0.1:4000/health/ready
HTTP_STATUS 200
BODY {"status":"ready","checks":[{"name":"lifecycle","ready":true}],"timestamp":"2026-09-25T16:04:25.311Z"}

سجّل الخادم الطلبين بصيغة المنظمة:
{"level":"info","message":"http request completed","requestId":"…","source":"http",
 "data":{"method":"GET","path":"/health","statusCode":200,"durationMs":7.15}}
{"level":"info","message":"http request completed","requestId":"…","source":"http",
 "data":{"method":"GET","path":"/health/ready","statusCode":200,"durationMs":4.1}}
```

ثم أُوقفت العملية، وتُحقّق أن المنفذ 4000 **حرّ** (`FREE`) بعد إغلاقها، وأن لا عملية خادم متبقية.

---

## 5. المشاكل والقرارات غير المحسومة (Problems)

### 5.1 تعارض نطاق بين «الخطة» و«المهمة المنفذة» — **مُحسم**

كان القسم 24 في `ALSQAYA_PLAN.md` يذكر ضمن Phase 8 بنودًا إضافية لم تكن في المهمة الأصلية. **نُفِّدت جميعها الآن داخل Phase 8:**

| البند في الخطة | الحالة |
|------|-----------|
| Readiness check | ✅ `GET /health/ready` — `503` أثناء البدء والإغلاق، `200` عند الجاهزية، **بلا** فحص قاعدة بيانات (لا توجد قاعدة بعد) |
| Request IDs | ✅ `requestIdMiddleware` + ترويسة `X-Request-Id` + ظهور المعرّف في كل سجل وفي جسم الخطأ |
| Structured technical logging | ✅ `logging/` — `TechnicalLogger` بمستويات وتصفية وصيغة JSON سطرية |
| البنية الأساسية للعمليات المجدولة | ✅ `jobs/` — `jobRegistry` + `jobRunner` **بلا** أي وظيفة أعمال (السجل فارغ by design) |
| مجلدات `auth/ authorization/ audit/ storage/ utils/` ومجلد `tests/` | ✅ `auth`/`authorization`/`audit`/`storage` محجوزة بـ`.gitkeep` (مراحل لاحقة)، `utils/` يحوي `lifecycleState`، و`tests/` أُنشئ بـ54 اختبارًا |
| اسم الجذر `backend/` | يُستخدم `server/` كما طلبت المهمة — إعادة تسمية تستلزم قرارًا صريحًا من صاحب المشروع |

**القرار:** نُفِّذت بنود الخطة كاملة دون تخمين أي شيء خارجها (لا قاعدة بيانات، ولا مصادقة، ولا وظائف مجدولة حقيقية قبل مواعدها).

### 5.2 أمور تقنية تحتاج تثبيتًا (لم تمنع التنفيذ)

| # | البند | الوضع |
|---|------|------|
| 1 | سكربت `npm run typecheck` غير موجود في المشروع | هذا المشروع يعرّف فحص الأنواع كـ`npm run lint` = `tsc --noEmit`. لم يُضف alias مكرر (`صفر سكربتات غير ضرورية`) |
| 2 | لا يوجد إطار اختبار آلي مثبَّت (لا Jest/Vitest) | استُخدم `node:test` المدمج في Node 24 + `tsx` (كان مثبَّتًا أصلًا) — **صفر تبعيات اختبار جديدة**، والسكربت `npm run test:server` |
| 3 | `express` أعيد إضافته | كان قد أُزيل في Phase 0 كبقايا قالب **غير مستخدمة**؛ الآن هو متطلب Phase 8 نفسه، فأُعيد. يستحق تأكيدًا أنه ليس تراجعًا عن تنظيف Phase 0 |
| 4 | المنفذ الافتراضي `4000` | قرار تقني (تجنّب تعارض Vite على 3000) — يحتاج تأكيدًا تشغيليًا قبل النشر على LAN |
| 5 | لغة عقد الأخطاء | الرسائل عربية والأكواد إنكليزية. يحتاج تثبيتًا في عقد API قبل Phase 10 |
| 6 | `express.json()` بالحد الافتراضي (100kb) | لم يُضبط حد مخصص؛ رفع/تحميل الملفات خارج Phase 8 (Phase 17) |
| 7 | ترميز مخرجات الكونسول على Windows | عند تشغيل الخادم في كونسول بصفحة ترميز عربية قد تظهر الرسائل العربية داخل JSON مشوَّهة **على الشاشة فقط**؛ الملفات UTF-8 بدون BOM والاستجابات JSON سليمة (تم التحقق) |
| 8 | مُميّز boolean في `ValidationOutcome` | ضيّق TypeScript النوع دون أن يخطر (سلوك قيود التضييق)؛ استُبدل بمُميّز نصي `kind: 'valid' \| 'invalid'` — أوضح وأقل حِيلاً |
| 9 | `server.listening` تسبق حدث `listening` في Node | الاعتماد عليها في الانتظار يجعل الاختبار يعود قبل اكتمال دوال الاستماع؛ انتظار الحدث نفسه موثَّق في `tests/helpers.ts` |

### 5.3 لا يوجد عيب مفتوح

لم يبقَ أي فشل في `npm run lint` أو `npm run build` أو `npm run test:server` (54/54)، ولم تُكتشف imports مكسورة، ولم تبقَ عمليات أو منافذ معلّقة (المنفذ 4000 حرّ بعد التشغيل). والعيوب المكتشفة أثناء التنفيذ (مسار السجل + سكربت الاختبار + تسريب خادم في اختبار فاشل) أُصلحت جميعها — انظر جدول «عيوب اكتُشفت وأُصلحت» في §4.

---

## 6. خارج النطاق (Out of Scope) — تأكيد

**لم يُنفَّذ أي من التالي** (كلها مراحل لاحقة)، ولم يُضف لها أي كود أو جدول أو إعداد:

PostgreSQL · Prisma/ORM · Database schema · Migrations · Authentication · Password/Secret handling · OTP · Sessions · JWT · RBAC · Permissions · Access Scope · Book Availability · Attachments production storage · Audit Logs · View Logs · Soft Delete · Concurrency · Personnel rules engine · Requests workflow · Notifications · Reminders · OCR · Search · Reports · Backup/Restore · Deployment · Windows packaging · Mobile packaging.

كذلك لم يُعدَّل أي ملف في `src/` (الواجهة)، ولم تُغيَّر أي قاعدة أعمال، ولم يُلمس أي ملف توثيقي قائم، ولم تُحذف نقطة الاسترجاع `d1dd8bc`.

---

## 7. Git

الحالة الحالية للمستودع:

```text
 M .env.example
 M package-lock.json
 M package.json
?? server/
?? PHASE_8_REPORT.md
?? .continue/            (قائم مسبقًا وغير متعلق بالمرحلة)
```

* **لا `commit` ولا `push`** — حسب التعليمات؛ الـcheckpoint مسؤولية صاحب المشروع بعد المراجعة.
* لم يُنشأ أي فرع جديد، ولم يُحذف أي فرع أو وسم.
* المشروع جاهز للمراجعة ثم للـcommit.

**نهاية Phase 8 — لا يبدأ Phase 9.**


