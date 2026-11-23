# السقاية — السجل المركزي لفحص المراحل والمشكلات
**تاريخ إنشاء السجل:** 23 نوفمبر 2026  
**القرار المعتمد من مالك المشروع:** *الفحص أولًا حتى آخر مرحلة وصل إليها المشروع، وتوثيق العيوب، ثم الإصلاح في دفعات لاحقة.*  
**النطاق الحالي:** Phase 1 → Phase 24 (بما فيها 24-H)، والمسارات الملحقة مثل UI/A2، بعد تثبيت نطاق كل مرحلة من خطة المشروع.  
**حالة المشروع العامة:** `AUDIT_IN_PROGRESS / FIXES_DEFERRED / RELEASE_NO_GO`.

> **تحذير:** هذه الوثيقة سجل عمل حي، وليست شهادة بأن المراحل المفهرسة فُحصت أو أُغلقت. الحالات المذكورة بوصفها «معلوم سابقًا» مأخوذة من تقارير واختبارات سابقة ويجب إعادة التحقق عند الوصول إلى المرحلة المعنية. يُمنع استنتاج نجاح الاختبار أو جاهزية النشر من وجود PR أو نتيجة CI منفردة.

## 1. بروتوكول العمل الجديد: فحص شامل ثم إصلاح منظّم

### المسار A — الفحص والتوثيق فقط (الآن)
- نبدأ بالمرحلة 1، ثم 2، ثم نواصل بالترتيب حتى آخر مرحلة منفّذة/قيد التنفيذ، بما فيها أقسام المرحلة وملحقاتها. لا نقف عند أول عيب لإجراء تعديل برمجي.
- لكل مرحلة: **(أ)** جرد الملفات والـAPI وقاعدة البيانات والواجهات والاعتمادات التي تملكها، **(ب)** تتبّع الصلاحيات وعزل الحسابات ومسارات البيانات، **(ج)** التحقق من توافق المكتبات مع الإصدارات الفعلية في `package-lock.json`، **(د)** فحص الاتساق مع المراحل السابقة واللاحقة، **(هـ)** مراجعة الاختبارات وCI بأسماء التشغيل وSHA، **(و)** توثيق الملاحظات والتبعيات.
- التفتيش الافتراضي **READ-ONLY**. يجوز تغيير هذه الوثيقة وحدها أو وثائق الفحص المحددة، ولا تُغيّر كود الإنتاج أو اختبارات التطبيق أو المخطط أثناء المسح.
- ننتقل إلى مرحلة الفحص التالية بعد نشر **تقرير فحص** المرحلة وسجل ملاحظاتها، **دون إعلان إغلاقها التشغيلي** حتى لو كانت خالية من العيوب المثبتة.
- إن وُجد عيب أمن عاجل/تسريب قائم محتمل: سجّل `P0/P1` بدليل محدد، وأبقِ `RELEASE_NO_GO`، وأبلغ المالك مباشرةً بالإجراء الوقائي اللازم. لا تعتبر طلب الاستمرار في الفحص إذنًا بالنشر أو تعطيل الحماية.

### المسار B — الإصلاح والتحقق (بعد انتهاء مسح المراحل)
- تُجمّع الملاحظات حسب الخطورة والتبعيات: أمن/عزل البيانات ← تكامل وتزامن وAudit ← وظيفية ← أداء وتوافق ← تحسينات غير مطلوبة.
- **لا نفتح تحسينات جديدة** بسبب الفحص، ولا نستحدث مرحلة تطوير؛ الإصلاح يكون لمشكلة مثبتة أو قبول وظيفي معروف.
- لكل دفعة إصلاح مستقلة: تثبيت SHA الأساس، خطة اختبارات، فرع Draft، اختبار CI فعلي على الشجرة المدمجة، مراجعة مستقلة عند لزومها، اختبار Host عند الحاجة، ثم قرار صاحب المشروع بشأن الدمج.
- العيب الذي ظهر في مرحلة مبكرة وتكرّر في مرحلة لاحقة له **معرّف واحد** في السجل مع روابط الإحالة، حتى لا يُصلَح مرتين.
- لا يُرفع الحظر عن `HTTP 503 REPORTS_UNAVAILABLE` أو الإطلاق إلا بعد القبول المحدد والمصرّح به.

## 2. توزيع المسؤوليات

- **CHAT:** فحص الشيفرة والفروع ونتائج GitHub، تسجيل الدليل، تحديث هذا السجل، وإعداد ترتيب الإصلاحات. **فرع توثيق الفحص:** `audit/phase1-24-findings-only-20261123`.
- **OPENCODE:** آخر عمل مؤكد من المالك هو مراجعة PR #95 وصدور تقرير `BLOCKERS`. **لا توجد مهمة مراجعة جديدة مؤكدة حاليًا**؛ يمكن إسناد المراجعة المستقلة لاحقًا، من دون افتراض تشغيله في الخلفية.
- **HOST / المالك:** اختبارات Windows والمتصفح والأجهزة وقاعدة قبول مؤسسية، فقط بترخيص صريح وبيانات اصطناعية حيث يلزم.
- **حدود السلامة:** لا كتابة في `C:\Users\dell\ALSQAYA-STAGING` ولا اتصال بـ`alsqaya_staging`، ولا `Merge/Push` إلى الفروع الرسمية، ولا حذف بيانات مستخدمين. حفظ هذا الملف في GitHub لا يساوي دمج كود التطبيق.

## 3. مصفوفة تقدم مسح المراحل

**تعريف الحالات:** `NOT_SCANNED` = لم نفحص هذه المرحلة ضمن المرور الجديد؛ `SCANNING` = بدأ الفحص ولم يكتمل؛ `REVIEWED_WITH_FINDINGS` = انتهى فحصها مع عيوب مسجلة؛ `REVIEWED_NO_CONFIRMED_FINDINGS` = لا عيوب مثبتة ضمن النطاق المعلن (ليس شهادة تشغيلية). كل الحالات منفصلة عن `CLOSED` التشغيلي.

| المرحلة | حالة المسح الحالي | المرجع/النطاق الذي يجب جرده | تقرير الفحص |
|---|---|---|---|
| 01 | REVIEWED_WITH_FINDINGS | نماذج المجال، الهوية، روابط الكتب، نسخ التوافق والاختبارات | [تقرير Phase01](audits/PHASE01_DOMAIN_MODELS_AUDIT_20261123.md) |
| 02 | REVIEWED_WITH_FINDINGS | إنشاء وتحديث المنتسب، حالة الخدمة، حساب المستخدم، الإجازات والزمنيات والاختبارات | [تقرير Phase02](audits/PHASE02_PERSONNEL_AUDIT_20261123.md) |
| 03 | REVIEWED_WITH_FINDINGS | ملف المنتسب وتجميع الكتب والإجازات والزمنيات والتنقل والروابط | [تقرير Phase03](audits/PHASE03_EMPLOYEE_PROFILE_AUDIT_20261123.md) |
| 04 | REVIEWED_WITH_FINDINGS | الاتجاه والحالة والتاريخ الرسمي والتحقق من metadata والتذكير والتحديث | [تقرير Phase04](audits/PHASE04_TRANSACTION_DOMAIN_AUDIT_20261123.md) |
| 05 | REVIEWED_WITH_FINDINGS | علاقة M:N، أدوار المنتسب، حماية الروابط التاريخية، صلاحيات القراءة | [تقرير Phase05](audits/PHASE05_TRANSACTION_EMPLOYEE_AUDIT_20261123.md) |
| 06 | REVIEWED_WITH_FINDINGS | كيان الموقف المستقل، ملكية الروابط، القراءة الإدارية، الإحصاءات وعرض الإرث | [تقرير Phase06](audits/PHASE06_DAILY_SITUATION_AUDIT_20261123.md) |
| 07 | REVIEWED_WITH_FINDINGS | الخط الزمني المشتق، SQL مرئي، إزالة التكرار، فلاتر API والتنقل والأداء | [تقرير Phase07](audits/PHASE07_TIMELINE_AUDIT_20261123.md) |
| 08 | REVIEWED_WITH_FINDINGS | دورة Backend وReadiness وLogging وJobs وتعارض إشعارات Phase15 | [تقرير Phase08](audits/PHASE08_BACKEND_FOUNDATION_AUDIT_20261123.md) |
| 09 | REVIEWED_WITH_FINDINGS | PostgreSQL وذرية الترحيلات وstatus وحماية قواعد Windows التجريبية | [تقرير Phase09](audits/PHASE09_POSTGRES_MIGRATIONS_AUDIT_20261123.md) |
| 10 | REVIEWED_WITH_FINDINGS | عميل API، عزل الحسابات، DTO وcursor وطلب Timeline وتعارض تكامل Phase15 | [تقرير Phase10](audits/PHASE10_API_DATA_LAYER_AUDIT_20261123.md) |
| 11 | REVIEWED_WITH_FINDINGS | OTP ومحدد المعدل، تبديل السر والجلسات، أدوار الإدارة، استعادة الحساب، التوازي وتقييم PR71/72/74 | [تقرير Phase11](audits/PHASE11_AUTH_SECURITY_AUDIT_20261123.md) |
| 12 | NOT_SCANNED | الأدوار والصلاحيات | — |
| 13 | NOT_SCANNED | نطاق الرؤية وإتاحة الكتب | — |
| 14 | NOT_SCANNED | المرفقات والتخزين وسلامة الملفات | — |
| 15 | NOT_SCANNED | الاطلاع الرسمي، Audit، التغييرات الحديثة وعلامة «جديد» | — |
| 16 | NOT_SCANNED | الأرشفة والحذف المنطقي/الاستعادة | — |
| 17 | NOT_SCANNED | النسخ والتزامن/البحث والوظائف المرتبطة وفق الخطة | — |
| 18 | NOT_SCANNED | الإجازات والأرصدة وفق الخطة | — |
| 19 | NOT_SCANNED | الطلبات وسير الموافقات | — |
| 20 | NOT_SCANNED | علاقات الكتب | — |
| 21 | NOT_SCANNED | التذكيرات وآثار إلغاء الإشعارات | — |
| 22 | NOT_SCANNED | تحديد النطاق من خطة المشروع قبل الفحص | — |
| 23 | NOT_SCANNED | التقارير والتصدير وحجب HTTP 503 | — |
| 24 | NOT_SCANNED | قبول الاستضافة/التكامل المؤسسي، 24-H، وملحقات A2/UI | — |

**ملاحظة:** عناوين الصفوف دليل تنقل أولي؛ تُراجع مقابل `ALSQAYA_PLAN.md` وCommitات التنفيذ حين يصل الفحص إليها. لا يعني وجود رقم في الجدول أن جميع مخرجات المرحلة منفذة. نطاق UI-01…UI-06 وA2.3 يُربط بالمرحلة التي تثبته الوثائق بدل افتراض ترقيم مستقل.

### بطاقة تقرير كل مرحلة
```text
Phase: 01 | Inspection SHA: <exact SHA>
Branch / Base / candidate dependencies: ...
Scope covered (files, contracts, migrations, UI): ...
Library versions / compatibility evidence: ...
Security & privacy checks: ...
Data integrity & concurrency checks: ...
Tests/CI actually checked (run IDs, sha, outcomes): ...
Findings (IDs from section 4): ...
External/Host verification needed: ...
Inspection result: REVIEWED_WITH_FINDINGS or REVIEWED_NO_CONFIRMED_FINDINGS
Operational closure: unchanged; never inferred from inspection result
Next: inspect Phase 02 (do not repair automatically)
```

## 4. سجل المشكلات المعلومة قبل بدء هذا المرور (تحتاج إعادة التحقق)

**قواعد الإثبات:** `SOURCE_CONFIRMED` تحليل شيفرة بمسارات وأسطر؛ `CI_CONFIRMED` تشغيل CI محدد؛ `UAT_REPORTED` اختبار مستخدم بتاريخ معلوم؛ `NOT_REPRODUCED` فرضية أو سباق يحتاج اختبارًا؛ `FIX_CANDIDATE` إصلاح في Draft وليس اعتمادًا؛ `HOST_PENDING` بحاجة بيئة تشغيل. عند فحص المرحلة لا تنقل مشكلة إلى «مغلقة» إلا بعد إثبات أن فرعًا مدمجًا معتمدًا حلها.

| ID | المرحلة | الخطورة/النوع | وصف المشكلة أو شرط القبول | آخر دليل معروف | حالة الإصلاح/الفحص |
|---|---|---|---|---|---|
| AUD-10-01 | 07/10 | P2 / عقد timeline sourceTypes | `loadTimeline` يرسل `sourceTypes` نصًا مفصولًا بفواصل، بينما خادم Query يشترط Array؛ فلترة النوع مرشحة للرفض 400 | `apiDataAdapter.ts:250–258`، `apiClient.ts:49–55`، `queryValidators.ts:151–163` | SOURCE_CONFIRMED_CROSS_LAYER / CROSSREF AUD-07-02 / HTTP_TEST_PENDING |
| AUD-10-02 | 07/10 | P2 / عقد timeline limit | `limit=5` النصي من HTTP لا يقبله `positiveInt` الخاص بجسم JSON؛ يحتاج `queryPositiveInt` | `apiDataAdapter.ts:252–259`، `queryValidators.ts:162`، `primitives.ts:55–61` | SOURCE_CONFIRMED_CROSS_LAYER / CROSSREF AUD-07-01 / HTTP_TEST_PENDING |
| AUD-10-03 | 10 | P3 / 2xx غير JSON | `readBody` يعيد النص الخام عند فشل JSON parse حتى في 200 ثم `as T` بلا تحقق؛ قد يفشل Adapter برسالة غير موحدة | `apiClient.ts:59–72,117–145`، `apiDataAdapter.ts:67–73` | SOURCE_CONFIRMED_DESIGN / MALFORMED_PROXY_RESPONSE_NOT_REPRODUCED |
| AUD-10-04 | 10/24 | P2 / ضبط حزمة النشر | اختيار `VITE_DATA_SOURCE=local` متاح حتى في build إنتاج إن ضُبط خطأ؛ لا fallback تلقائي، لكن يلزم حارس release | `src/api/index.ts:16–29` و`LocalDataAdapter` | CONFIG_GATE_PENDING / ليس استغلالًا مثبتًا |
| AUD-10-05 | 10/15 | P2 / مانع تكامل خصوصية | PR69 يعزل استجابات الجلسات بـrevision ويحفظ `targetScope`؛ PR96 المنفرد يحمل `apiClient/sessionToken/mappers` أقدم يفقد هذه الضمانات إذا اختير عند الدمج | PR69 `a3f3fa6e` مقابل PR96 `0f16837a` في الملفات الثلاثة | SOURCE_CONFIRMED_CROSS_DRAFT / RELEASE_NO_GO / CROSSREF AUD-15-06 |
| AUD-10-06 | 10/23/24 | P3 / أداء التحميل | `loadTransactions` يجمع صفحات حجم 100 حتى النهاية بلا سقف إجمالي صفحات/زمن؛ الأداء على أرشيف سنوات غير مقاس | `apiDataAdapter.ts:115–151`، `apiClient.ts:100–104` | SOURCE_CONFIRMED_DESIGN / HOST_BENCHMARK_PENDING |
| AUD-09-01 | 09 | P3 / أمر تشخيصي يكتب | `db:status` ينفذ `CREATE TABLE IF NOT EXISTS schema_migrations` على قاعدة لا تملك الجدول، رغم أنه أمر استعلام ظاهريًا | `migrations.ts:138–149,291–309`، `cli.ts:103–115` | SOURCE_CONFIRMED / HOST_NOT_REPRODUCED / POLICY_TBD |
| AUD-09-02 | 09 | P3 / قراءة حالة متزامنة | `getMigrationStatus` لا يشارك قفل advisory ضمن `up/down`؛ قد يقرأ حالة قديمة أو ينافس أول DDL أثناء الترحيل | `migrations.ts:183–191,236–242,291–309` | SOURCE_CONFIRMED / CONCURRENCY_TEST_PENDING؛ لا فساد مثبت |
| AUD-09-03 | 09/24 | P2 / هوية عنقود اختبار Windows | `testDb.ts` يعيد استعمال عنقود persistent بمجلد ثابت وport 5440 ثم `dropDatabase(alsqaya_test)` دون بصمة هوية مسبقة ظاهرة | `server/tests/db/testDb.ts:24–29,160–194` | SOURCE_CONFIRMED_ENV_GUARD / HOST_NO_TOUCH؛ عنقود مؤقت أو إثبات هوية مطلوب |
| AUD-09-04 | 09/24 | P2 / حماية استدعاء Down | منع التراجع الإنتاجي مشروط بواجهة CLI و`NODE_ENV`؛ استدعاء `rollbackMigrations(pool)` الداخلي لا يتحقق من هوية الهدف | `cli.ts:57–70`، `migrations.ts:226–280` | SOURCE_CONFIRMED_DESIGN / MISUSE_NOT_PROVEN؛ فحص هوية/نسخة احتياطية |
| AUD-09-05 | 01/09/15 | إحالة / الترحيلات اللاحقة | `0016` يحتاج preflight للتكرارات القديمة؛ التراجع عن `0017` قد يزيل سجل فتح «جديد»، رغم ذرية DOWN | `AUD-01-04`، `AUD-15-07`، PR60/PR96 | CROSSREF EXISTING / FINAL_INTEGRATION_AND_HOST_PENDING |
| AUD-08-01 | 08/09/11 | P2 / سرية السجل التقني | تنقية logger بالمفاتيح الحساسة لا تنقّي الرسائل النصية العامة `error/stack`؛ نص استثناء قد يحتوي اعتماد اتصال رغم 503 العام المعقم | `logger.ts:19–39,115–129`؛ `readinessService.ts:121–132`؛ `errorHandler.ts:81–91` | SOURCE_CONFIRMED_GAP / SECRET_DISCLOSURE_NOT_REPRODUCED |
| AUD-08-02 | 08 | P2 / سباق readiness | `getStatus` يلتقط lifecycle قبل انتظار Probe DB، وقد يعيد ready بعد بدء shutdown دون تحقق نهائي | `readinessService.ts:59–71,76–90,103–117` | SOURCE_ORDER_CONFIRMED / CONCURRENCY_HTTP_TEST_PENDING |
| AUD-08-03 | 08/21 | P3 / إغلاق JobRunner | `stop()` يعيد `stopping=false` بعد الانتهاء، و`runNow` يسمح بالتشغيل حتى عند `active=false` ما لم يكن Drain جاريًا | `jobRunner.ts:65–91,100–114` | SOURCE_CONFIRMED_METHOD / RUNTIME_POLICY_DECISION |
| AUD-08-04 | 08/15/21 | P2 / تعارض فروع | PR67 يملك Graceful Shutdown مُحسّنًا لكنه يسجّل reminder dispatch؛ PR96 يلغي الإشعارات لكنه يحوي shutdown أقدم | `server/src/server.ts` عند PR67 `8fac8363` وعند PR96 `0f16837a` | SOURCE_CONFIRMED_BETWEEN_DRAFTS / CROSSREF AUD-15-06؛ دمج دلالي لاحق |
| AUD-08-05 | 08/09 | P3 / مرونة إغلاق | `server.close` و`pool.end()` بلا حد إغلاق شامل، مع بقاء Probe PostgreSQL المعلق بعد مهلة HTTP readiness | `server.ts:48–58,78–97`، `pool.ts:63–85,107–115` | NOT_REPRODUCED / ISOLATED_HANG_TEST_PENDING |
| AUD-07-01 | 07/10 | P2 / تحقق GET limit | `GET /api/timeline?employeeId=…&limit=5` يستخدم `positiveInt` الذي يرفض نصوص Query رغم وجود `queryPositiveInt`؛ متوقع HTTP 400 | `queryValidators.ts:151–163`، `primitives.ts:55–61`، `fields.ts:86–98` | SOURCE_CONFIRMED / HTTP_TEST_PENDING؛ لا إصلاح الآن |
| AUD-07-02 | 07/10 | P3 / تحقق sourceTypes | `?sourceTypes=leave` قيمة واحدة string لا تحقق شرط `arrayOf` (Array)، مع عدم توثيق صيغة GET المكررة | `queryValidators.ts:158`، `primitives.ts:109–119` | SOURCE_CONFIRMED_FOR_SINGLE_QUERY / QUERY_PARSER_RECHECK_PENDING |
| AUD-07-03 | 07/09/10 | P3 / أداء | API يجلب مرفقات جميع الكتب المرتبطة والبيانات الأصلية كلها ثم يطبّق `limit` بعد الاشتقاق في الذاكرة | `transactionRepository.ts:344–369`، `timelineService.ts:68–95,162–165` | SOURCE_CONFIRMED / BENCHMARK_PENDING؛ يجب الحفاظ على إجمالي العدد الصحيح |
| AUD-07-04 | 07/03/06 | P3 / تنقل | `handleTimelineSourceNavigate` يتجاهل `sourceId` إلا للكتاب، فينقل الإجازة/الزمنية/الموقف إلى قسم وليس السجل المحدد | `EmployeesView.tsx:330–354`، `DailySituationsView.tsx:121–141` | SOURCE_CONFIRMED / BROWSER_PENDING؛ قرار deep-link |
| AUD-07-05 | 03/05/07 | إحالة / كتب تاريخية | Timeline الرسمي يستبعد الكتب القديمة بلا رابط `transaction_employees` حقيقي؛ فشل مغلق مقصود، **نفس `AUD-03-01`** | `transactionRepository.ts:344–356` و`AUD-UAT-02` | CROSSREF AUD-03-01 / HISTORICAL_LINKS_PENDING؛ يمنع الربط الآلي بالاسم |
| AUD-06-01 | 06 | P2 / مؤشر غير دقيق | `independentRecordsCount=dailySituations.length` يعرض جميع القيود تحت عنوان «قيود مستقلة» رغم وجود قيود مرتبطة بكتاب موقف | `DailySituationsView.tsx:163–165,369,459` | SOURCE_CONFIRMED / BROWSER_PENDING؛ شرط قبول تسمية/عدد |
| AUD-06-02 | 06/04 | P2 / تصنيف سجل خاطئ | رابط `relatedRecord` إلى كتاب عادي يكفي لظهوره كاستمارة موقف؛ الرابط مسموح FK دون اشتراط نوع الكتاب | `dailySituationRepository.ts:124–152,165–191` و`DailySituationsView.tsx:106–114,149–155` | SOURCE_CHAIN_CONFIRMED / NEEDS_SYNTHETIC_API_UI_TEST |
| AUD-06-03 | 06 | P3 / فلاتر القوائم | فلاتر البحث/التاريخ في قائمة الاستمارات لا تطبق على سجلي الإجازات والزمنيات؛ شريط الفلاتر موجود في تبويب الاستمارات فقط | `DailySituationsView.tsx:195–255,259–348,880–1024` | UX_ACCEPTANCE_PENDING؛ قد يكون مقصودًا |
| AUD-06-04 | 06/15 | P2 / تدقيق العمليات | POST/PATCH لمورد الموقف اليومي لا يكتب Audit مستقلًا للفاعل على مستوى التطبيق؛ يراجع مع سياسة أحداث create/update | `dailySituationController.ts:35–49`، `dailySituationService.ts:131–155`، `dailySituationRepository.ts:163–235` | SOURCE_CONFIRMED_APP / AUDIT_POLICY_REVIEW_PENDING |
| AUD-06-05 | 06/18 | P3 / احتمال سباق ملكية | التحقق من `relatedRecord` الشخصي يسبق INSERT/UPDATE باستعلام منفصل بلا قفل، لكن لا يوجد مسار مخوّل مثبت يسمح بنقل مالك السجل | `dailySituationRepository.ts:126–152,165–191,204–230` | NOT_REPRODUCED / NEEDS_CONCURRENCY_MODEL؛ لا ادعاء ثغرة مثبتة |
| AUD-05-01 | 05/15 | P2 / تدقيق تعديلات الروابط | `POST/PATCH/DELETE transaction-employees` لا تستدعي Audit على مستوى التطبيق لتوثيق الفاعل وتغيّر الروابط؛ ليست مشكلة `users.employee_id` | `server/src/api/controllers/linkController.ts:54–80` و`server/src/api/services/linkService.ts:47–80` وPR96 | SOURCE_CONFIRMED_APP / AUDIT_POLICY_ACCEPTANCE_PENDING؛ الإصلاح مؤجل |
| AUD-05-02 | 05 / Demo | P3 / إعادة إحياء من مرآة قديمة | `seedFromTransactions` قد يعيد إنشاء رابط حذف آخر صف له إذا بقيت `employeeIds` قديمة في الكتاب | `src/services/transactionEmployeeService.ts:213–246`؛ اختبار `phase5TransactionEmployeeDomain.test.ts:61–69` يغطي بقاء رابط آخر فقط | METHOD_BEHAVIOR_CONFIRMED / LIVE_CALL_NOT_PROVEN؛ يحتاج اختبار صفر روابط |
| AUD-05-03 | 05/03 | P3 / اختلاف معنى فك الرابط | `unlink` المحلية تمحو كل أدوار المنتسب في كتاب؛ API DELETE بالمعرّف يحذف دورًا واحدًا | `transactionEmployeeService.ts:60–81` مقابل `linkController.ts:76–80` | SOURCE_CONFIRMED / BUSINESS_SEMANTICS_TBD |
| AUD-05-04 | 01/05/09/15 | P2 / تبعية تكامل | PR64 المنفرد لا يحمل قيد `0016` للدور NULL ويتوقع 500 لموظف FK مفقود؛ PR60 يحمل القيد وتحويل 404/409، ولا يكفي نجاح CI لدمج رسمي | `0002_transactions.sql`، PR60 `0016`/`linkService.ts`، PR64 `links.test.ts:225–232` | CROSSREF `AUD-15-06`/`AUD-01-04` / FINAL_INTEGRATION_PENDING |
| AUD-05-05 | 03/05 | إحالة / إدارة الروابط | الواجهة الرسمية لا تقدم مسار فك دور من الإضبارة رغم وجود API مستقل؛ **نفس `AUD-03-04`** | `App.tsx:1103`، `EmployeesView.tsx:499–528` | CROSSREF AUD-03-04 / POLICY_PENDING؛ لا إصلاح مكرر |
| AUD-04-01 | 04/15/20 | P2 تدقيق / نوع الحدث | تعديل `status` عبر PATCH يصدر `update` لا `status_change` المخصص؛ كذلك يلتقي مع السباق `AUD-15-04` | `transactionValidators.ts:145–176`، `transactionController.ts:118–155`، `App.tsx:614–629` | SOURCE_CONFIRMED / AUDIT_POLICY_REVIEW؛ لا تغيير توافق تلقائي |
| AUD-04-02 | 04/15 | P3 عقد / علم القراءة | `isRead/readAt` قابلان للإرسال كبيانات إدارية رغم استقلال `view_logs` الرسمي؛ يجب منع تفسيرهما كإقرار أو علامة حساب | `transactionValidators.ts:40–47,96–104`، `TransactionsList.tsx:792,1207` | SOURCE_CONFIRMED / CONTRACT_ACCEPTANCE_PENDING؛ لا إقرار مزور مثبت |
| AUD-04-03 | 04/15/21 | P2 ذرّية / مرشح علاج | PR63 يكتب كتابًا ثم يشغّل فحص التشابه وAudit والإشعار خارج معاملة موحدة؛ خطأ لاحق قد يعيد 500 بعد الحفظ؛ PR96 أعاد تغليف الإنشاء مع Audit وأوقف الإشعارات | `transactionService.ts:125–149` و`transactionController.ts:61–78` على PR63 مقابل PR96 | SOURCE_CONFIRMED_ON_PR63 / FIX_CANDIDATE_PR96 / FAILURE_INJECTION_PENDING |
| AUD-04-04 | 04/15/21 | سياسة لا ثغرة / تذكيرات | النموذج لا يزال يحتفظ `reminder` تاريخيًا مع تعطيل نظام الإشعارات؛ يجب عدم تشغيل العامل أو إعادة تمكين إرسال أي إشعار | `transaction.ts:81–89,145–148` و`transactionValidators.ts:88–103`، PR95/96 | POLICY_RECONCILIATION / RUNTIME_DISABLE_CANDIDATE؛ لا حذف بيانات |
| AUD-04-05 | 04/15 | إحالة / PATCH المرفقات | PATCH يمكن أن يقبل مرفقات لا يكتبها المستودع ويُولّد Audit غير فعّال؛ **نفس** `AUD-15-02`، مرشح إصلاح PR94 | `transactionValidators.ts:145–159` مقابل `transactionRepository.ts:454–478` | CROSSREF AUD-15-02 / INTEGRATED_RECHECK_PENDING؛ لا إصلاح مكرر |
| AUD-03-01 | 03/05/13/24 | P2 / توافق البيانات التاريخية | الكتاب القديم المرتبط باسم فقط دون معرف/رابط رسمي لا يظهر في الإضبارة؛ الحظر النصي مقصود أمنيًا ويلزم تدقيق ربط تاريخي مأذون | `src/services/employeeProfileLinks.ts:67–78` و`AUD-UAT-02` | SOURCE_CONFIRMED / HOST_RECHECK_REQUIRED؛ لا ربط تلقائي بالاسم |
| AUD-03-02 | 03 | P3 / تنقل الهوية | الانتقال بمعرّف منتسب غير موجود يترك إضبارة المستخدم المختار سابقًا ظاهرة بدل خطأ/شاشة فارغة | `EmployeesView.tsx:169–177,217–233` | SOURCE_CONFIRMED / BROWSER_NOT_REPRODUCED |
| AUD-03-03 | 03 | P3 / اتساق البحث | تصفية القائمة حسب البحث لا تغيّر اختيار الإضبارة من القائمة غير المصفاة؛ قد تبقى إضبارة مختلفة عن نتائج البحث | `EmployeesView.tsx:201–233` | UX_ACCEPTANCE_DECISION / BROWSER_NOT_REPRODUCED |
| AUD-03-04 | 03/05/12/15 | P3 / مسار إداري | «فك ارتباط كتاب» غير ظاهر رسميًا لأن `onSaveTransaction` متاح Demo فقط؛ PATCH العام محظور صراحةً على تغيير الروابط | `EmployeesView.tsx:499–528,1212–1221` و`App.tsx:732–735,1103` | BUSINESS_POLICY_PENDING؛ يجب Workflow مستقل وآمن إذا اعتُمد |
| AUD-03-05 | 03/15 | إحالة / علامة جديد | معاينة مرفقات الإضبارة يجب أن تتبع تأكيد فتح الخادم؛ نفس `AUD-15-05` المرشح في PR96 | `EmployeesView.tsx:1176–1201,1315–1342` | CROSSREF `AUD-15-05` / BROWSER_PENDING؛ لا إصلاح مكرر |
| AUD-02-01 | 02/18 | P2 وظيفي / حقول تضيع | `POST /api/leaves` يقبل `isPaid` و`transactionId` و`notes` لكن الخدمة/المحرك يتجاهلانها عند التسجيل؛ `isPaid` قد يُحفظ افتراضيًا true | `personnelValidators.ts:43–65` → `personnelService.ts:109–120` → `personnelRules.ts:654–682` → `leaveRepository.ts:86–101` | SOURCE_CONFIRMED / NEEDS_SYNTHETIC_API_TEST؛ الإصلاح مؤجل |
| AUD-02-02 | 02/15 | P2 تدقيق / إحالة | ربط الحساب بالمنتسب لا ينتج Audit ذريًا رغم معاملة قاعدة آمنة؛ **نفس** `AUD-15-03` ولا يُصلح مرتين | `employeeController.ts:42–52`، `employeeRepository.ts:152–178` | KNOWN_OPEN `AUD-15-03` / الإصلاح مؤجل |
| AUD-02-03 | 02/11 | P3 / مسار إدارة الهوية | فك ربط `userId` بمسار PATCH غير متاح بسبب رفض null؛ يلزم قرار تخويل إداري وآثار Audit | `employeeRepository.ts:152–155` مقابل `employeeValidators.ts:17–55` | POLICY_DECISION_PENDING؛ لا فتح فك الربط دون اعتماد |
| AUD-02-04 | 02/11 | سياسة حساب / غير مثبت كخلل | نقل الموظف إلى former لا يغلق حساب users أو الجلسات آليًا، وسياسة تعطيل الحساب غير محددة في الخطة | `employeeRepository.ts:290–323` و`docs/PHASE_02_CODE_AUDIT_20261122.md:59–63` | BUSINESS_POLICY_TBD؛ لا ادعاء ثغرة مثبتة |
| AUD-02-05 | 02/15 | P2 تزامن/Audit / مرشح معالجة | في PR61 الحالة السابقة وAudit خارج معاملة الحالة؛ PR93 أضاف `auditedMutation` وقفل الصف | `employeeController.ts:62–75` على PR61 مقابل `PR93` و`PR96` | FIX_CANDIDATE / INTEGRATED_RECHECK_PENDING؛ لا سجل عيب مكرر |
| AUD-TECH-02 | عابر للمراحل | توافق مكتبات / TS7 | `TypeScript 7.0.2` فشل تشخيصيًا على أجزاء من المشروع؛ TS5.8 وVite build نجحا، مع تنبيهَي اعتماد إنتاجي moderate | [CI Phase2 #45053476628](https://github.com/daboolgame123-creator/Saqa/actions/runs/45053476628) | VERSION_UPGRADE_NO_GO / MAINTENANCE_BACKLOG |

| AUD-01-01 | 01/05 | P3 / تطابق أدوار الروابط | `seedFromTransactions` في مرشح Phase1 المنفرد يختزل علاقات الشخص للكتاب نفسه باختلاف الأدوار؛ مرشح Phase5 التراكمي عالج ذلك | PR60 `src/services/transactionEmployeeService.ts:195–236` مقابل Phase5 `cbb1eae9` و`phase5TransactionEmployeeDomain.test.ts:37–52` | SOURCE_CONFIRMED_ON_PR60 / FIX_CANDIDATE_IN_PHASE5؛ لا مسار إنتاجي مثبت؛ تجنب تكرار الإصلاح |
| AUD-01-02 | 01/13 | P3 / اتساق Demo | `canUserAccessTransaction` في الوضع التجريبي لا يفحص `isDailySituation` عند `PublicToEmployees`، خلافًا لقيد SQL الرسمي | `src/core/models/accessScope.ts:85–90` مقابل `server/src/repositories/transactionScopeSql.ts:65–71` | SOURCE_CONFIRMED_DEMO_ONLY / HOST_NOT_REPRODUCED؛ لا تسريب إنتاجي مثبت |
| AUD-01-03 | 01/04/05/10 | P3 / أخطاء إنشاء الكتب | إنشاء كتاب بقائمة `employeeLinks` مكررة قد يرتد `INTERNAL_ERROR 500` لا `409` لأن ترجمة خطأ UNIQUE موجودة لمسار الرابط المنفصل فقط | `transactionValidators.ts:59–64,108`؛ `transactionRepository.ts:416–421`؛ `middleware/errorHandler.ts:41–56` | SOURCE_CHAIN_CONFIRMED / NEEDS_SYNTHETIC_API_REPRODUCTION |
| AUD-01-04 | 01/09/24 | بوابة ترحيل | `0016` يتوقف بأمان عند تكرارات الروابط القديمة ذات الدور NULL؛ لا دليل بوجود هذه التكرارات على مضيف المؤسسة | `server/migrations/0016_transaction_employee_null_role_unique.sql:10–27` | MIGRATION_PRECONDITION / HOST_PENDING؛ يتطلب preflight ونسخة احتياطية |
| AUD-TECH-01 | عابر للمراحل | P3 / توافق وتحديثات | قفل المشروع يعمل مع Vite 6.4.6 وTypeScript 5.8.3 وReact 19.3.0؛ توجد إصدارات أحدث، ولا يوجد دليل فشل بسببها | `package-lock.json`؛ npm official 2026-11-23؛ [تقرير Phase01](audits/PHASE01_DOMAIN_MODELS_AUDIT_20261123.md) | MAINTENANCE_BACKLOG / لا ترقيات حتى انتهاء التدقيق |

| AUD-15-01 | 15 | P2 / خصوصية | الإشعارات السابقة يمكنها كشف metadata لكتب محجوبة؛ المالك قرر إلغاءها بدل إصلاح توزيعها | مراجعة OpenCode لـPR #93؛ PR #95/#96 أوقف المسارات التشغيلية | FIX_CANDIDATE؛ مراجعة لاحقة للتأكد من عدم وجود مسار تشغيل آخر |
| AUD-15-02 | 15 | P2 / Audit | PATCH بحقل `attachments` فقط كان يُنتج Audit رغم تجاهل التحديث | PR #94 عند `5e924ad13b769ee933d0bb76ade5a3581282f8a2`، CI تراكمي سابق ناجح | FIX_CANDIDATE / مستقل غير مدمج |
| AUD-15-03 | 02/15 | P2 / Audit | ربط/تغيير حساب المستخدم مع المنتسب لا يصدر سجل Audit ذريًا | تقرير OpenCode OC15-F3؛ `employeeController.ts` / `employeeRepository.ts` | OPEN / الإصلاح مؤجل |
| AUD-15-04 | 04/15 | P2 / تزامن | Audit قد يسجل حالة سابقة قديمة عند تحديث حالة المعاملة المتزامن | تقرير OpenCode OC15-F4؛ `transactionController.ts` / `transactionService.ts` | OPEN / الإصلاح مؤجل |
| AUD-15-05 | 15 | وظيفي / علامة جديد | زر معاينة المرفق لم يكن يزيل علامة `جديد`؛ مسار الفتح لم يكن موحّدًا | OpenCode N-01 على PR #95؛ إصلاح مرشح [PR #96](https://github.com/daboolgame123-creator/Saqa/pull/96) `0f16837a437dc9a9d76de395f95ddb80de947129` | FIX_CANDIDATE؛ CI تراكمي ناجح؛ مراجعة مستقلة ومتصفح معلقان |
| AUD-15-06 | 01/02/09/15 | P2 / تكامل | المرشح المنفرد يفتقد تبعيات Phase1 `0016` وتصدير أخطاء Phase2؛ ثلاث وظائف CI منفردة تفشل في TypeScript | OpenCode N-02؛ PR #96 يوفّر artifact مراجعة تكامل غير مدمج؛ [CI #45245406781](https://github.com/daboolgame123-creator/Saqa/actions/runs/45245406781) تراكمي ناجح | OPEN؛ يحتاج SHA تكامل رسمي مستقل صالح للاختبار |
| AUD-15-07 | 15 | تراجع بيانات | تراجع `0017` يحذف علامات الفتح الشخصية عمدًا؛ يجب وقف التطبيق قبل التراجع | PR #96 اختبر PostgreSQL اصطناعيًا مملوءًا، مع حفظ الكتب وViewLog/Audit | TEST_CANDIDATE_PASS / Host rollback غير منفذ؛ توثيق فقدان العلامات لازم |
| AUD-15-08 | 13/15 | تزامن غير معاد إنتاجه | `FOR SHARE OF t` لا يقفل صف الإتاحة الذي قد يُسحب أثناء تعليم الفتح | OpenCode N note؛ `newBookService.ts` | NOT_REPRODUCED / لا ادعاء تسريب مثبت |
| AUD-11-01 | 11 | أمني / قبول | مراجعة المصادقة المستقلة `OC-11-SEC` على SHA نهائي بعد تكامل المراحل؛ CI لا يعوضها | [PR #74](https://github.com/daboolgame123-creator/Saqa/pull/74) `401088aeb7e07b898617334094fd102fb6400b62`، `OC-11-SEC` لم يُكلف | INDEPENDENT_REVIEW_PENDING / RELEASE_NO_GO |
| AUD-11-02 | 11 | P1 / OTP تزامن `P11-01` | 6/6 طلبات متوازية تجاوزت حد خمسة/15 دقيقة على الأساس؛ PR72/74 يقفل فحص الحصة والإصدار لكل هاتف، ويرجع 429 بعد حفظ الحظر | [تشخيص #45072887615](https://github.com/daboolgame123-creator/Saqa/actions/runs/45072887615)، `authService.ts:410–458`، `otpRepository.ts:60–69` | BASE_REPRODUCED / FIX_CANDIDATE_PR74_TEST_PASS؛ وضع admin يحظر self-service |
| AUD-11-03 | 11 | P0 / جلسة بالسر القديم `P11-02` | سباق دخول-تغيير اعتماد أصدر جلسة صالحة بالسر السابق على الأصل؛ PR72/74 يعيد فحص snapshot مشفّر وحالة الحساب تحت UPDATE ذري قبل إصدار الجلسة | [تشخيص #45072887615](https://github.com/daboolgame123-creator/Saqa/actions/runs/45072887615)، `authService.ts:688–754`، `accountRepository.ts:237–255` | BASE_REPRODUCED / FIX_CANDIDATE_PR74_TEST_PASS / INDEPENDENT_REVIEW_PENDING |
| AUD-11-04 | 11/12 | P1 / عكس حظر إداري `P11-03` | `unfreeze` على الأصل لا يشترط تجمد الحساب؛ PR74 يفرض `frozen_until <= now()` و`status='frozen'`، ويحمي `freeze` عند blocked | `accountRepository.ts:272–290`، `phase11AuthAuditDiagnostics.test.ts:135–153` | SOURCE_CONFIRMED_OLD / FIX_CANDIDATE_PR74_TEST_PASS |
| AUD-11-05 | 11/02 | P1 قرار هوية `P11-04` | استعادة الحساب/الدخول برقم هاتف يشترك فيه أكثر من منتسب تختار أول `users` بترتيب `LIMIT 1`، دون سياسة مالك معتمدة | `accountRepository.ts:125–139`، `authService.ts:757–766` | OWNER_POLICY_PENDING / NOT_FIXED؛ لا تعديل تلقائي للهوية |
| AUD-11-06 | 11 | P1 مشتبه سابقًا `P11-05` | `resolveSession` قد يعمل على صورة سبقت logout؛ PR74 يشترط عدم إبطال الجلسة في `touchIfLive` ويملك اختبار تزامن قبول؛ الأصل لم يُثبت فيه الاختراق مستقلاً | `sessionRepository.ts:68–81`، `authService.ts:913–917`، `phase11AuthAuditDiagnostics.test.ts:155–205` | BASE_SUSPECTED / FIX_CANDIDATE_PR74_ACCEPTANCE_PASS |
| AUD-11-07 | 11 | P1 / حصة الهاتف غير المطابق `P11-06` | الطلبات بباج خاطئ/هاتف غير معروف/طلب إداري مرفوض لم تحتسب؛ اختبارا RED أثبتا، PR74 يسجل صف OTP مبطلًا فورًا لكل طلب ضمن القفل | [RED CI #45076236296](https://github.com/daboolgame123-creator/Saqa/actions/runs/45076236296)، `otpRepository.ts:96–106`، `phase11OtpQuotaNonmatch.test.ts` | BASE_REPRODUCED / FIX_CANDIDATE_PR74_3_TESTS_PASS |
| AUD-11-08 | 11/15 | حاجز تكامل / ملفات المصادقة | أربعة ملفات auth على PR74 وPR96 لها نفس Git blob SHA، لكن ذلك لا يثبت قبول الإصدار النهائي أو اكتمال مراجعة مستقلة | `authService/otpRepository/accountRepository/sessionRepository.ts` PR74 مقابل PR96 | AUTH_BLOBS_EQUAL / FINAL_MERGED_SHA_AND_REVIEW_PENDING |

| AUD-23-01 | 23 | بوابة إلزامية | تقارير HTTP 503 لا تزال محجوبة حتى اعتماد متطلبات الأمن/التصدير/المضيف | آخر موقف معروف `REPORTS_UNAVAILABLE`؛ لا تعامَل كخلل يجب رفعه تلقائيًا | RELEASE_GATE / HOLD |
| AUD-24-01 | 24-H | تشغيل مؤسسي | قبول الخادم الداخلي، النسخ والاستعادة، اختبار Windows والمتصفح والمرفقات | الحالة السابقة `HOST_ACCEPTANCE_PENDING / RELEASE_NO_GO` | HOST_PENDING |
| AUD-UAT-01 | 14/24 | وظيفي / تاريخي | المرفقات لم تعمل في اختبار Windows المحلي؛ السحب والإفلات ورفع الملف | UAT بتاريخ 12 نوفمبر 2026 | UAT_REPORTED / RECHECK_REQUIRED |
| AUD-UAT-02 | 13/24 | خصوصية/وظيفي تاريخي | كتاب موجّه إلى منتسب لم يظهر بحسابه في اختبار محلي سابق | UAT بتاريخ 12 نوفمبر 2026 | UAT_REPORTED / RECHECK_REQUIRED |
| AUD-UAT-03 | 15/24 | وظيفي تاريخي | سجل إقرارات الإعمام الإداري أظهر «تعذر قراءة السجل» | UAT سابق 12 نوفمبر 2026 | UAT_REPORTED / RECHECK_REQUIRED |

## 5. قواعد تحديث السجل

لكل ملاحظة جديدة سجّل: **ID، المرحلة، شدة الخطورة، الوصف، الأثر، مسار الملف والسطر، SHA وفروع الاعتماد، طريقة التحقق، نوع الدليل، حالة المشكلة، المسؤول، شرط قبول الإصلاح، وروابط PR/Issue/CI**. ضع `EVIDENCE_NEEDED` إن غاب الدليل ولا تُرقِّ الظن إلى ثغرة مثبتة.

حالات المشكلات: `OPEN`، `NEEDS_REPRODUCTION`، `FIX_CANDIDATE`، `CI_VERIFIED`، `INDEPENDENT_REVIEW_PENDING`، `HOST_PENDING`، `CLOSED_AFTER_ACCEPTED_INTEGRATION`.

**قيد العمل الحالي:** هذا المسار يغيّر وثائق التدقيق فحسب؛ إصلاحات النطاق 15 في PR #94/#95/#96 تبقى Draft، ولا تُدمج تلقائيًا. لكل مرحلة يُضاف تقريرها إلى السجل بعد الفحص الفعلي، ثم ننتقل إلى التالية. قرار تبديل السياسة لاحقًا يعود للمالك.

## 6. نقطة الانطلاق

**نتيجة الفحص الحالي:** Phase 01 = `REVIEWED_WITH_FINDINGS`، بتقرير [تفصيلي](audits/PHASE01_DOMAIN_MODELS_AUDIT_20261123.md) على PR60 `f2c91947...`؛ CI المعزول 40/40 ناجح ومرشح التكامل التراكمي 975 PASS / 0 FAIL / 1 SKIP. هذه **مراجعة شيفرة وأدلة CI موجودة، لا اختبار تشغيلي جديد ولا إغلاق رسمي**.

**نتيجة فحص Phase 02:** `REVIEWED_WITH_FINDINGS`؛ راجع [تقرير المرحلة الثانية](audits/PHASE02_PERSONNEL_AUDIT_20261123.md). الأساس PR61 `64b0b356...`، [CI #45053476628](https://github.com/daboolgame123-creator/Saqa/actions/runs/45053476628) ناجح: 376 خادم + 228 PostgreSQL + 276 API، صفر فشل، اختبار واحد متخطى. فشل TypeScript 7 تشخيصي **وليس نجاح توافق**.

**نتيجة فحص Phase 03:** `REVIEWED_WITH_FINDINGS`؛ التفاصيل في [تقرير المرحلة الثالثة](audits/PHASE03_EMPLOYEE_PROFILE_AUDIT_20261123.md)، مرجع PR62 `c9937568...`. [CI #45054582027](https://github.com/daboolgame123-creator/Saqa/actions/runs/45054582027) مستقل ناجح، و[CI #45054582151](https://github.com/daboolgame123-creator/Saqa/actions/runs/45054582151) تراكمي مؤقت ناجح **896 (server/PG/API) +12 مركّز =908 اختبار ناجح، صفر فشل، 1 متخطى**. ليست شهادة قبول المضيف.

**نتيجة فحص Phase 04:** `REVIEWED_WITH_FINDINGS`؛ [تقرير المرحلة الرابعة](audits/PHASE04_TRANSACTION_DOMAIN_AUDIT_20261123.md)، PR63 SHA `ed93da61...`، [CI #45058003663](https://github.com/daboolgame123-creator/Saqa/actions/runs/45058003663) ثلاث وظائف ناجحة. **تركيب Phases 1–4 المؤقت:** 388 خادم + 230 PostgreSQL + 282 API = **900 نجاح، صفر فشل، اختبار واحد متخطى**. مراجعة المصدر لا تعني قبول دمج رسمي.

**نتيجة فحص Phase 05:** `REVIEWED_WITH_FINDINGS`؛ [تقرير المرحلة الخامسة](audits/PHASE05_TRANSACTION_EMPLOYEE_AUDIT_20261123.md)، PR64 `cbb1eae9...`. [CI #45061129990](https://github.com/daboolgame123-creator/Saqa/actions/runs/45061129990) ناجح لثلاث وظائف؛ التجميع المؤقت Phases1–5 = **396 خادم + 230 PostgreSQL + 284 API = 910 نجاح، 0 فشل، 1 متخطى**. لا يثبت ذلك صلاحية دمج رسمي أو تشغيل مضيف.

**نتيجة فحص Phase 06:** `REVIEWED_WITH_FINDINGS`؛ [تقرير المرحلة السادسة](audits/PHASE06_DAILY_SITUATION_AUDIT_20261123.md)، PR65 SHA `83ffa7be...`. [CI #45062808020](https://github.com/daboolgame123-creator/Saqa/actions/runs/45062808020) ثلاث وظائف ناجحة؛ تركيب Phases1–6 المؤقت: **403 خادم + 230 PostgreSQL + 288 API = 921 نجاح، صفر فشل، اختبار واحد متخطى**. لا اختبار متصفح جديد ولا Merge رسمي.

**نتيجة فحص Phase 07:** `REVIEWED_WITH_FINDINGS`؛ [تقرير المرحلة السابعة](audits/PHASE07_TIMELINE_AUDIT_20261123.md)، مرجع PR66 SHA `7293aacc...`. [CI #45063955278](https://github.com/daboolgame123-creator/Saqa/actions/runs/45063955278) ثلاث وظائف ناجحة. التجميع المؤقت Phases1–7 = **413 خادم +230 PostgreSQL +290 API = 933 نجاحًا، صفر فشل، اختبار واحد متخطى**. لا قبول مضيف ولا دمج رسمي.

**نتيجة فحص Phase 08:** `REVIEWED_WITH_FINDINGS`؛ [تقرير المرحلة الثامنة](audits/PHASE08_BACKEND_FOUNDATION_AUDIT_20261123.md)، مرجع PR67 SHA `8fac8363...`. [CI #45065758623](https://github.com/daboolgame123-creator/Saqa/actions/runs/45065758623) ثلاث وظائف ناجحة؛ تجميع Phases1–8 مؤقتًا: **417 خادم +230 PostgreSQL +290 API = 937 نجاحًا، صفر فشل، 1 متخطى**. لم يُثبت دمج رسمي أو قبول المضيف.

**نتيجة فحص Phase 09:** `REVIEWED_WITH_FINDINGS`؛ [تقرير المرحلة التاسعة](audits/PHASE09_POSTGRES_MIGRATIONS_AUDIT_20261123.md)، مرجع PR68 SHA `94980222...`. [CI #45067538932](https://github.com/daboolgame123-creator/Saqa/actions/runs/45067538932) ثلاث وظائف ناجحة؛ تجميع Phases1–9 المؤقت: **417 خادم +236 PostgreSQL +290 API = 943 ناجحًا، صفر فشل، اختبار واحد متخطى**. لا تشغيل محلي/تراجع/ترحيل جديد ولا اعتماد تشغيل.

**نتيجة فحص Phase 10:** `REVIEWED_WITH_FINDINGS`؛ [تقرير المرحلة العاشرة](audits/PHASE10_API_DATA_LAYER_AUDIT_20261123.md)، PR69 SHA `a3f3fa6e...`. [CI #45069255998](https://github.com/daboolgame123-creator/Saqa/actions/runs/45069255998) ثلاث وظائف ناجحة؛ التجميع الاصطناعي Phases1–10 = **417 خادم +236 PostgreSQL +296 API = 949 نجاحًا، صفر فشل، اختبار واحد متخطى**. تعارض Source ذي صلة بالخصوصية بين PR69 وPR96 لا يسمح بدمج عشوائي، ولا يدّعي تسريبًا مثبتًا.

**نتيجة فحص Phase 11:** `REVIEWED_WITH_FINDINGS`؛ [تقرير المرحلة الحادية عشرة](audits/PHASE11_AUTH_SECURITY_AUDIT_20261123.md). [PR #71](https://github.com/daboolgame123-creator/Saqa/pull/71) أثبت سباقَي OTP والدخول بالسر القديم؛ [PR #72](https://github.com/daboolgame123-creator/Saqa/pull/72) و[PR #74](https://github.com/daboolgame123-creator/Saqa/pull/74) إصلاحات مرشحة غير مدمجة. [CI #45076556355](https://github.com/daboolgame123-creator/Saqa/actions/runs/45076556355) تجميع Phases1–11C مؤقت ناجح **417 خادم +243 PostgreSQL +296 API = 956 PASS، 0 FAIL، 1 SKIP**، ومجموعة قبول الأمن 4+3 ناجحة. **مراجعة OpenCode الأمنية المستقلة وقرار الهاتف المشترك معلقان؛ RELEASE_NO_GO.**

**الخطوة التالية المعتمدة:** Phase 12 — RBAC/Authorization؛ فحص فروع PR75/PR76 وقيم الدور والامتياز والجلسة وخفض الصلاحية، وتوثيق النتائج فقط دون تعديل التطبيق.

**مرجع المتابعة:** [Issue #90](https://github.com/daboolgame123-creator/Saqa/issues/90) يجمع عوائق المرحلة 15، لكن **هذه الوثيقة هي السجل المركزي العابر للمراحل**؛ أي Issue تفصيلي يُربط هنا بمعرّف ثابت، فلا تضيع ملاحظات المراحل الأولى عند الانتقال.
