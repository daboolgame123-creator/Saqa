# تقرير فحص المرحلة الثامنة — Phase 08 / Backend Foundation

**تاريخ الفحص:** 23 نوفمبر 2026  
**نوع العمل:** مراجعة الشيفرة وسجل اختبارات CI القائمة ومقارنة فروع المرشحين، **توثيق فقط دون تغيير التطبيق أو بيانات المستخدم أو تشغيل اختبارات جديدة**.  
**مرجع المرحلة:** [Draft PR #67](https://github.com/daboolgame123-creator/Saqa/pull/67)، SHA `8fac8363e6a900abd64fdea4d3d830ec89d428a1`، الأساس `phase-10-api-data-layer`.  
**مرجع التداخل:** Draft PR96 SHA `0f16837a437dc9a9d76de395f95ddb80de947129` **ليس** مجمعًا رسميًا مع PR67، ومقارنته ضرورية لتفادي تراجع صامت عند الدمج.  
**نتيجة المسح:** `REVIEWED_WITH_FINDINGS / FIXES_DEFERRED / RELEASE_NO_GO`.

## 1. النطاق والبنية

النطاق الرسمي من `ALSQAYA_PLAN.md` Phase8: أساس Backend، دورة التشغيل، التقارير التقنية، الوظائف المجدولة، Health/Readiness ومعالجة الأخطاء. جُردت **10 ملفات معدلة** في PR67: `server/src/{server.ts,health/readinessService.ts,jobs/jobRunner.ts,logging/logger.ts}`، اختبارات `{health,jobs,logging,serverLifecycle}.test.ts`، Workflow وتقرير التدقيق.

قُرئت أيضًا ملفات السياق: `server/src/{app.ts,routes/index.ts,routes/healthRoutes.ts,config/env.ts,database/pool.ts,logging/logTypes.ts,middleware/{errorHandler,requestLogger}.ts,jobs/{jobRegistry,reminderDispatcher}.ts}`، وراجعت `server/src/server.ts` عند SHA مرشح Phase15-N2 لتثبيت التعارض في السلوك. لا يصح عدّ تغيير PR67 في ملف `server.ts` مستقرًا في PR96 ما لم ينفذ **دمج مصدر مع مراجعة دلالية**.

## 2. ما تأكدت سلامته من الشيفرة والـCI السابق

1. **تكوين واضح:** `config/env.ts` يتحقق من `NODE_ENV/PORT/LOG_LEVEL/DATABASE_URL/AUTH_SECRET_KEY` دون تسجيل القيم السرية في رسائل أخطاء التهيئة؛ `express.json()` وإخفاء `x-powered-by` وRequest ID وHTTP logger قبل المسارات، و404/Error handler في النهاية (`app.ts:11–35`).
2. **حدود HTTP:** `routes/index.ts` يفصل health العام عن `/api/auth` ومسارات `/api` المقيدة بالجلسة؛ تفاصيل أخطاء 500 لا ترجع للمستخدم في production. HTTP logger لا يكتب نص query أو body أو authorization headers (`requestLogger.ts:1–30`).
3. **إغلاق تدريجي صحيح ضمن اختبارات المرشح:** `createShutdownHandler:66–103` يحفظ Promise واحدة لاستدعاءات الإغلاق المتكررة؛ ينفذ وقف jobs ثم HTTP ثم Pool، ويحاول بقية خطوات التنظيف حتى عند فشل سابقة، ويجعل النتيجة Exit Code فاشلًا عند الحاجة؛ حدث listening لا يرفع readiness بعد `shutting-down`.
4. **وظائف مجدولة:** `JobRunner` يمنع تداخل تنفيذ الوظيفة نفسها، وينتظر تشغيل `runNow` اليدوي الجاري قبل إغلاق DB، ويمنع بدء تشغيل جديد أثناء `stopping=true`. اختبارات `jobs.test.ts` تدقق الانتظار والاشتراك في Promise أثناء التوقف.
5. **Health/Readiness:** فحص Database بـ`SELECT 1` مع مهلة HTTP قدرها ثانيتان، وإعادة استخدام Probe واحد ما دام الاستعلام معلقًا؛ 503 العام يستعمل رسالة لا تعرض بيانات اتصال PostgreSQL، بخلاف السجل الداخلي. تنظيف المؤقت في finally.
6. **البيانات التقنية:** `redactFields` ينقي المفاتيح الحساسة داخل كائنات ومصفوفات متداخلة دون تعديل المدخل (`logger.ts:19–39`). هذا **لا يعني** تنظيف النصوص الحرّة؛ انظر AUD-08-01.

**نتيجة CI السابقة الموثقة:** [GitHub Actions #45065758623](https://github.com/daboolgame123-creator/Saqa/actions/runs/45065758623)، ثلاث وظائف `completed/success` على SHA PR67: TypeScript 5.8 مقفل وVite build، وتجربة React/Vite الأحدث مع TS5 في Runner مستقل، وتركيب مرشحي Phases1–8 المؤقت دون Push/Merge. **417 اختبار خادم ناجح +230 PostgreSQL +290 API = 937 PASS، 0 FAIL، 1 SKIP**. تجارب Phase8 المركزة داخلة في العداد؛ لا تُضاف مرة ثانية. فحص `npm audit --omit=dev --audit-level=high` مر بنجاح وفق وصف PR67، وبقيت تبعيتان moderate وTypeScript7 غير معتمدين.

## 3. الملاحظات المسجلة للتصحيح/التحقق لاحقًا

### AUD-08-01 — الأسرار قد تبقى ضمن نص الخطأ الحر في السجلات التقنية (P2 / سرية Logs)

**SOURCE_CONFIRMED_GAP / SECRET_DISCLOSURE_NOT_REPRODUCED.**  
`server/src/logging/logger.ts:19–39,115–129` ينقي القيم فقط إذا **اسم المفتاح نفسه** مدرج ضمن `SENSITIVE_KEYS`، أو داخل كائن/مصفوفة تحمل هذه المفاتيح. لكنه لا يعالج قيمة نصية في المفتاح العام `error` أو `stack` أو `message`. `server/src/health/readinessService.ts:121–132` يسجل `data:{error:error.message}` خامًا، و`server/src/middleware/errorHandler.ts:81–91` يسجل `error.message` و`error.stack`، و`database/pool.ts:69–74,120–127` يسجل رسائل DB أيضًا. إن احتوى الاستثناء نص اتصال، أو قيمة اعتماد، أو استجابة موفر خارجي، فالتنقية الحالية **لا تستطيع حجبها من السجل**، رغم أن جسم 503 العام لا يكشفها.

**لا يوجد إثبات حالي أن pg طبع كلمة مرور حقيقية في سجل؛ خطر محتمل مشروط بمحتوى الاستثناء.** أولوية المعالجة أمن السجلات: اختبار اصطناعي لخطأ يحوي رابط DB وهميًا وOTP وهميًا في `message/stack`، ثم صياغة سياسة آمنة لتسجيل `code`/نوع الخطأ وحقول موثوقة دون إفشاء المحتوى، مع الاحتفاظ بدليل تشخيصي آمن. لا يُنسخ السر للاختبارات الواقعية.

### AUD-08-02 — فحص جاهزية بدأ قبل الإغلاق قد يُرجع 200 بعد تبدّل Lifecycle (P2 / سباق جاهزية)

**SOURCE_ORDER_CONFIRMED / CONCURRENT_HTTP_TEST_PENDING.**  
`readinessService.ts:59–71` يستدعي `runChecks()` فيلتقط `checkLifecycle()` **متزامنًا** ويبدأ Probe DB غير المتزامن، ثم ينتظر `Promise.all`. لو بدأت عملية الإغلاق بعد التحقق الأولي وقبل عودة `SELECT 1`، تظل نتيجة `lifecycle.ready=true` القديمة ويُعاد `status=ready` عندما ينجح الاستعلام؛ لا يوجد فحص Lifecycle نهائي بعد `await`. هذا لا يعني أن كل طلب أثناء الإغلاق يُقبل، لكنه يكسر توقع readiness بعد تغيير الحالة.

**معيار الإثبات لاحقًا:** اختبار متزامن بعائق قابل للتحكم في Probe DB، ثم `markShuttingDown()` قبل تحرير العائق، والتأكد من `503` بدل `200`؛ مراجعة إعادة فحص lifecycle بعد انتظار الاستعلام دون تكثير probes.

### AUD-08-03 — بعد انتهاء `JobRunner.stop()` يستطيع `runNow` تنفيذ عمل جديد (P3 / سياسة إغلاق وظائف)

**SOURCE_CONFIRMED_METHOD_STATE / LIVE_SHUTDOWN_REPRODUCTION_NOT_DONE.**  
`jobRunner.ts:65–91` يضبط `stopping=true` أثناء Drain فقط، ثم يعيده `false` ويُفرغ `stopPromise` بعد الانتهاء، و`execute:100–114` يرفض التشغيل فقط إذا `stopping`، **دون رفض `active=false`**. ولذلك يسمح `runner.runNow('job')` بعد اكتمال `stop`، حتى إذا كان Runtime قد أغلق Pool. قد يكون تشغيل يدوي بعد `stop` مقصودًا في أداة إدارة jobs مستقلة، فلا نسميه خطأ نشر مثبتًا قبل تحديد عقد API/الاختبار. في سياق `createShutdownHandler` يجب عدم استئناف أعمال بعد إغلاق الموارد.

**معيار القبول:** اختبار `stop → await stop → runNow`، واتخاذ قرار `terminal shutdown` مقابل `restartable pause`؛ إذا كان الإغلاق نهائيًا يلزم منع التشغيل حتى إعادة تهيئة Runner صريحة.

### AUD-08-04 — دمج Phase8 وPhase15-N له تعارض دلالي في `server.ts` (P2 / تكامل Release)

**SOURCE_CONFIRMED_BETWEEN_DRAFTS / CROSSREF `AUD-15-06` و`AUD-15-01`.**  
مرشح **PR67** يستعمل إغلاقًا محسّنًا (Promise مشتركة وخطوات تنظيف منفصلة) وحماية `listening` من إحياء الجاهزية، **لكنه يسجّل** `registerReminderDispatchJob(getSharedPool)` في `server.ts:140–145`؛ وهو سابق لقرار المالك **إلغاء جميع الإشعارات**. مرشح **PR96** يحذف تسجيل وظيفة التذكير في `server.ts:110–116`، **لكنه يحتفظ** بإصدار أقدم من `createShutdownHandler` (`shuttingDown:boolean`، `return` فوري في النداء الثاني، و`catch` واحد يمنع إكمال التنظيف)، ويستدعي `markReady` داخل `listening` دون فحص حالة الإغلاق. هذا فرق واضح بين **مرشحين منفصلين لم يدمجا**؛ مجرد اعتماد أحد الملفين كاملًا يعيد خللًا قديمًا أو يُعيد إرسال إشعارات محظورة.

**معيار التكامل النهائي:** في Merge/RC رسمي لاحق، الحفاظ على **إيقاف إرسال التذكيرات/الإشعارات** من PR96 **مع** تحسينات إغلاق/جاهزية PR67؛ اختبارات صريحة لكلا المطلبين على **نفس SHA** وUAT عند اللزوم. **لا يُفتح إصلاح مستقل قبل انتهاء جولة مسح المراحل**؛ يحكمه دفتر العوائق `AUD-15-06`.

### AUD-08-05 — إيقاف HTTP/Pool قد يتأخر بلا حدّ عند تعليق الاتصال (P3 / مرونة التشغيل)

**RISK_FROM_SOURCE / HANG_NOT_REPRODUCED.**  
`server/src/server.ts:48–58,78–97` ينتظر `server.close` ثم `closeSharedPool` دون Deadline/Abort عام، و`server/src/database/pool.ts:63–85` لا يحدد `connectionTimeoutMillis` أو `query_timeout`، و`closeSharedPool:107–115` ينتظر `pool.end()`. ورغم أن **استجابة** readiness تنتهي بعد 2000 ms (`readinessService.ts:103–117`)، فهذا لا يعني إلغاء استعلام PostgreSQL المعلق. في تعثر غير عادي قد يتأخر الإغلاق إلى ما بعد سقف خدمة المضيف أو تعطل استدعاء الإيقاف.

**ليس توقفًا مثبتًا**؛ اختبار شبكة معزولة يتعمّد اتصالًا/استعلامًا معلقًا مع Deadline قصير على بيئة اصطناعية، ثم اعتماد سياسة timeout/cancel مناسبة لعدم كسر معاملة قيد التنفيذ عند إغلاق طبيعي.

## 4. شروط قبول المرحلة والتوزيع

- **لا يفتح نجاح CI وحده بوابة النشر**، ولا يثبت صحة ترقيات TypeScript7، ولا يبرر إلغاء `HTTP 503 REPORTS_UNAVAILABLE`.
- **الأمان:** تسجيل `AUD-08-01` كخطر سرية محتمل حتى تتضح سلوكيات أخطاء موفري DB على المضيف؛ لا ادعاء بتسريب واقع. **التشغيل:** `AUD-08-02/03/05` تحتاج اختبارات تزامن/قبول عقد. **التكامل:** `AUD-08-04` مانع منطقي عند جمع فروع المرحلة 8 والمرحلة 15.
- لا تغييرات SQL أو TypeScript في هذا PR الوثائقي، ولم تُرسَل أية مهمة مراجعة جديدة إلى OpenCode. لا استدعاء مستخدم لقاعدة `alsqaya_staging`.
- **الخطوة التالية:** Phase09 — PostgreSQL/Migrations/Persistence Foundation، جرد الترحيلات وأنواع التواريخ وفصل قواعد الاختبار والبيانات والعزل قبل التوثيق.

**الحالة:** `PHASE08_REVIEWED_WITH_FINDINGS / FIXES_DEFERRED / RELEASE_NO_GO`.
