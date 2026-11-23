# تقرير فحص المرحلة السابعة — Phase 07 / Timeline

**التاريخ:** 23 نوفمبر 2026  
**نمط العمل:** فحص الشيفرة ونتائج الاختبارات السابقة فقط؛ **دون تعديل التطبيق، أو تشغيل DB/Host، أو دمج الفروع**.  
**مرجع المرحلة:** [Draft PR #66](https://github.com/daboolgame123-creator/Saqa/pull/66) SHA `7293aaccbe34108880b8ef76488bc6e3ee6b1546`، الأساس `phase-10-api-data-layer`.  
**اختبار التكامل المؤقت:** [Actions #45063955278](https://github.com/daboolgame123-creator/Saqa/actions/runs/45063955278) يركب مراحل 1–7 مؤقتًا داخل Runner دون Merge رسمي.  
**حكم المرور:** `REVIEWED_WITH_FINDINGS / FIXES_DEFERRED / RELEASE_NO_GO`.

## 1. نطاق الفحص

`ALSQAYA_PLAN.md:916–919` يحدد Timeline بوصفه **طبقة تجميع مشتقة**، بلا جدول مستقل أو حفظ مكرر. راجعت ملفات PR66 التسعة: `src/services/timelineService.ts`، `src/components/views/TimelineView.tsx`، `server/src/api/services/timelineService.ts`، `server/src/repositories/{transactionRepository,contracts}.ts`، الاختبارات `phase7TimelineDomain.test.ts` و`api/timeline.test.ts`، Workflow وتقرير المرحلة السابق.

تتبعت أيضًا `src/core/models/timeline.ts` والـMappers الستة و`src/components/views/{EmployeesView,DailySituationsView}.tsx`، `server/src/api/validation/{queryValidators,fields,primitives}.ts`، `server/src/api/controllers/timelineController.ts`، و`server/src/authorization/{accessScope,personnelScope}.ts`. تمّت مقارنة حدود المرجع المرئي وحالة الأرشفة مع المراحل 3 و5 و6 و13 و16، ولا يُفترض أن مرشح PR66 المنفرد يحتوي كل فروع المراحل الأخرى.

## 2. ما ثبت صحيحًا

1. **الخط الزمني ناتج لا مخزن:** الخدمة تجمع الإجازات والزمنيات والتكليفات والدورات والكتب والموقف من مصادرها عند الطلب؛ لا `timeline` table ولا كتابة POST/PATCH/DELETE، و`countsBySource` و`totalCount` يقيسان الأحداث الأصلية الفريدة **قبل الفلاتر والحد الأقصى** (قرار موثق، ليس خللًا).
2. **الفصل بين الهوية وخصوصية الكتب:** `TimelineApiService.forEmployee` يتحقق من `canReadEmployee(personnelScope,employeeId)` قبل القراءة، ويستدعي `TransactionRepository.listLinkedToEmployee(employeeId,scope)`، الذي يستخدم SQL `EXISTS(transaction_employees)` و`transactionScopeCondition` ويستبعد `deleted_at IS NOT NULL`. لا يطابق أسماء أو نصوصًا، ولا يجلب كتابًا خارج النطاق لمجرد أن المنتسب مرتبط به. المنتسب لا يحصل على `dailySituations` في Timeline، وفق سياسة N1.
3. **عدم تضاعف الأحداث:** `TimelineService.buildForEmployee:135–144` يميز الثلاثية `sourceType/sourceId/employeeId` ولا يدمج نوعين مختلفين يشتركان في UUID. `EXISTS` يمنع تكاثر الكتاب بسبب وجود دورين للمنتسب.
4. **التقويم:** `getPeriodKey` و`getISOWeek` يضبطان أسبوع ISO (الاثنين–الأحد) وحدود ديسمبر/يناير، ويضعان التاريخ غير الحقيقي في مجموعة «بدون تاريخ». فرز المجموعات والأحداث يدعم `asc/desc` دون تعديل بيانات المصدر.
5. **وحدة الفلاتر الزمنية:** UI وAPI يستعملان تاريخ **بداية المصدر** `entry.date` عند `dateTo`، وليس `endDate`، والبحث `trim().toLowerCase()`.

**CI السابق:** على [SHA PR66 نفسه](https://github.com/daboolgame123-creator/Saqa/actions/runs/45063955278) الوظائف الثلاث `success`، منها اختبار Domain المخصص 10 نجاحات. تجميع المراحل 1–7 مؤقتًا: **413 اختبار خادم ناجح، 230 PostgreSQL ناجح، 290 API ناجح = 933 PASS، 0 FAIL، 1 SKIP** (عشرة Domain ضمن عداد الخادم وليست زيادة منفصلة). تجريب أحدث React/Vite مع TypeScript5.8 نجح في Runner؛ TypeScript7 لا يزال غير معتمد، وبقيت تنبيهات الاعتمادات المتوسطة مسألة عابرة للمراحل.

## 3. الملاحظات — توثيق فقط

### AUD-07-01 — `GET /api/timeline?...&limit=5` يرفض الحد الرقمي الصحيح (P2 / عقد API)

**SOURCE_CONFIRMED / HTTP_NOT_REPRODUCED_IN_THIS_PASS.**  
`server/src/api/validation/queryValidators.ts:151–163` يمرّر `limit` عبر `optionalQuery(positiveInt('limit'))`. لكن `positiveInteger` في `server/src/api/validation/primitives.ts:55–61` لا يقبل إلا قيمة **number**، بينما قيمة Query من Express عادة نص **string** `'5'`. وفي نفس المشروع `server/src/api/validation/fields.ts:86–98` يشرح الفرق ويقدم `queryPositiveInt` لهذا الغرض. لذلك `?limit=5` متوقع أن يفشل 400 بدل تحديد خمسة أحداث.

**التغطية الناقصة:** `server/tests/api/timeline.test.ts` لا يحتوي اختبارًا لمسار `limit`، ويختبر حد المصفوفة فقط في `server/tests/phase7TimelineDomain.test.ts`. يجب إضافة اختبار HTTP اصطناعي لقيم `5` و`0` و`bad` والتأكد من limit وحدّه الأعلى؛ لا تعديل الآن.

### AUD-07-02 — `sourceTypes` بقيمة منفردة في Query لا تُقبل كبنية قائمة (P3 / قابلية استخدام API)

**SOURCE_CONFIRMED_FOR_SINGLE_QUERY_STRING / PARSER_RECHECK_REQUIRED.**  
`queryValidators.ts:158` يستخدم `list('sourceTypes',enumValue(...))` أي `arrayOf`، و`primitives.ts:109–119` يرفض أي قيمة ليست `Array`. بينما `?sourceTypes=leave` يعيد عادة سلسلة نصية مفردة. إذا كانت صيغة التعدد المطلوبة من العميل `?sourceTypes=leave&sourceTypes=course` (يتغير تفسيرها بحسب Express parser) فقد تعمل، لكن **قيمة مصدر منفرد شائعة لا تعمل** وفق العقد الحالي. لم تُحدَّد صيغة Query API للتعدد رسميًا، و`api/timeline.test.ts` لا يختبر طلبًا ناجحًا بمصدر واحد، بل حالة رفض `appointment`.

**قبول لاحق:** اعتماد صيغة Query موثقة للنوع الواحد/المتعدد ثم اختبار HTTP لها من دون قبول نوع محجوز أو توسيع صلاحيات.

### AUD-07-03 — جلب مرفقات جميع الكتب المرتبطة وتحميل كل المصادر قبل تطبيق `limit` (P3 / أداء، ليس كشف بيانات)

**SOURCE_CONFIRMED / PERFORMANCE_NOT_BENCHMARKED.**  
رغم تصحيح Phase7 لقراءة الكتب غير المرتبطة، `transactionRepository.ts:344–369` يجلب **كل** الكتب المرتبطة ثم يستدعي `loadEmployeeIds` و`loadAttachments` لكل IDs (رغم أن `TimelineMappers.fromTransaction` لا يستخدم مرفقات الكتاب: `src/core/models/timeline.ts:103–119`). كما أن `TimelineApiService.forEmployee:68–95` يحمّل جميع مصادر المنتسب في `Promise.all`، وبعد بناء الأحداث تطبق `TimelineService.buildForEmployee:162–165` حد `limit` في الذاكرة، لا في SQL.

**الأثر المحتمل:** استعلامات وتخصيص ذاكرة وحركة DB غير ضرورية لإضبارات تاريخية كبيرة. لا قياسات أداء ولا تسريب مثبت؛ تحسين القراءة لاحقًا يجب أن يحافظ على `countsBySource/totalCount` (قبل limit) وحدود النطاق الدقيقة، لا الاكتفاء بـ`LIMIT` غير آمن يفسد الإحصاء.

### AUD-07-04 — الانتقال من حدث شؤون منتسب يتجاهل `sourceId` (P3 / ملاحة)

**SOURCE_CONFIRMED / BROWSER_NOT_REPRODUCED.**  
`EmployeesView.tsx:330–354` يتلقى `onNavigateToSource(sourceType,sourceId)` لكنه يستعمل `sourceId` فقط في الكتب. عند `leave/timePermission/dailySituation` ينتقل إلى تبويب نوع السجل بالمنتسب بدون معرّف القيد ذاته؛ التكليف/الدورة يمرران إلى عنوان قسم عام. `DailySituationsView.tsx:121–141` يفلتر تبويب النوع وemployeeId فقط وليس السجل الأصلي. لذلك الضغط على حدث قد لا يفتح **السجل المقصود** إذا كثرت أحداث الشخص؛ الواجهة تنتقل إلى فئة عامة فقط.

**قبول لاحق:** تقرير هل يلزم فتح السجل بعينه أو يكفي الانتقال إلى فئته؛ إن كان مطلوبًا، توفير deep-link مصرح به `sourceId` مع التحقق من ملكية/صلاحية السجل، وعدم إنشاء عرض تفصيلي غير مخوّل.

### AUD-07-05 — أحداث كتب تاريخية بلا روابط مُعرّفة لا تظهر في Timeline الرسمي (إحالة دون تكرار)

**SOURCE_CONFIRMED / CROSSREF `AUD-03-01` & `AUD-UAT-02`.**  
`transactionRepository.ts:344–356` يعتمد `transaction_employees` الرسمي فقط؛ لا يدخل كتاب باسمه التاريخي أو مرآة `employeeIds` غير المرحّلة إلى هذه العلاقة. هذا **سلوك أمني صحيح** يمنع منح الإتاحة بسبب تطابق الاسم، لكنه يعني غياب كتب تاريخية من Timeline إذا لم تُراجع روابطها. المطلوب حل فجوة ترحيل الروابط في `AUD-03-01` بصورة مأذونة وموثقة؛ **لا يُفتح إصلاح تلقائي بالأسماء**.

## 4. حدود الحكم والخطوة التالية

- `REVIEWED_WITH_FINDINGS` فحص مصدر واختبارات تاريخية، **لا إغلاق تشغيلي**. مسارات `GET /api/timeline` ذات `limit` و`sourceTypes` تحتاج اختبارات HTTP جديدة في دفعة الإصلاح اللاحقة؛ لم تُنفذ ولم تُستدع قاعدة `alsqaya_staging`.
- لا تغيير لمخطط Timeline أو جداول أخرى؛ مرشحو PR60–66 وPR97 جميعهم Draft، والتكامل في CI مؤقت.
- **التالي: Phase 08 — Backend Foundation**، المرشح [Draft PR #67](https://github.com/daboolgame123-creator/Saqa/pull/67) SHA `8fac8363e6a900abd64fdea4d3d830ec89d428a1`. فحص دورة تشغيل الخادم والتهيئة والأخطاء والأسرار والجاهزية، مع التوثيق فقط.

**الحالة:** `PHASE07_REVIEWED_WITH_FINDINGS / FIXES_DEFERRED / RELEASE_NO_GO`.
