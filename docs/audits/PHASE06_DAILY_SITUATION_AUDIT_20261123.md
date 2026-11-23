# تقرير فحص المرحلة السادسة — Phase 06 / Daily Situation

**تاريخ الفحص:** 23 نوفمبر 2026  
**نوع العمل:** قراءة الشيفرة ومقارنة مرشحي GitHub ونتائج Actions السابقة؛ **لا تعديل تنفيذ، لا اختبار جديد، لا وصول إلى بيئة Windows أو البيانات الفعلية**.  
**المرجع الأساسي:** [Draft PR #65](https://github.com/daboolgame123-creator/Saqa/pull/65)، SHA `83ffa7be95250affd60104a86d063561f7b52949`، الأساس `phase-10-api-data-layer`.  
**اختبارات المرجع:** [GitHub Actions #45062808020](https://github.com/daboolgame123-creator/Saqa/actions/runs/45062808020)؛ دمج مراحل 1–6 *داخل Runner فقط*، ليس مصدرًا رسميًا مدمجًا.  
**نتيجة الفحص:** `REVIEWED_WITH_FINDINGS / FIXES_DEFERRED / RELEASE_NO_GO`.

## 1. النطاق

حسب `ALSQAYA_PLAN.md:913–914`، المرحلة السادسة تعرّف **الموقف اليومي كيانًا مستقلًا** لا يُختزل في كتاب. فحصت فروق PR65 عن الأساس: 11 ملفًا (تحقق API، DTO، خدمة، PostgreSQL، واجهة، خدمتَا Demo، اختبارات، Workflow وتقرير).

**تفصيل المسارات:** `src/core/models/dailySituation.ts`، `src/services/{dailySituationService,dailySituationProfileScope}.ts`، `src/components/views/DailySituationsView.tsx`، `src/App.tsx`، `server/src/api/{dto/dailySituation.ts,validation/dailySituationValidators.ts,services/dailySituationService.ts,controllers/dailySituationController.ts,routes/resources.ts}`، `server/src/repositories/dailySituationRepository.ts`، `server/tests/{phase6DailySituationDomain.test.ts,api/dailySituations.test.ts}`، وكذلك قناة المراجعة `docs/PHASE_06_CODE_AUDIT_20261122.md`. راجعت شروط صلاحية admin/director وفصل book visibility (Phase13) عن حقوق قراءة daily-situations (N1).

## 2. ما ثبت صحيحًا ضمن النطاق

1. **هوية مستقلة:** `DailySituationRecord` يحمل `id/employeeId/date/category` ورابطًا اختياريًا من نوع `{kind,id}` إلى سجل إداري، ولا يلزم وجود Transaction أو رقم كتاب لكل قيد؛ الواجهة تمكّن عرض قيود مستقلة بلا طباعة كتاب وهمي.
2. **ضبط صلاحيات القراءة:** `createDailySituationsRouter` في `server/src/api/routes/resources.ts:269–290` يبدأ بـ`requireRole('admin','director')` إضافةً إلى حراس الجلسة والصلاحية؛ `dailySituationService.ts:60–66,113–129` يفرض قراءة إدارية ولا يوسع غياب النطاق إلى `all`. **لا إثبات على ظهور هذا المورد في API حساب المنتسب** ضمن هذه المراجعة.
3. **عدم نقل الملكية:** `employeeId` ممنوع من PATCH عبر Validation/DTO والخدمة المحلية ومستودع PostgreSQL. الروابط الشخصية `leave,time_permission,assignment,course` تراجع وجود سجلها وانتسابه للشخص ذاته، بينما علاقة الكتاب متعددة الأشخاص لا تُجبر على «مالك واحد».
4. **مدخلات آمنة:** `relatedRecord` يحتاج كلا `kind` و`id` (UUID)، ولا يقبل حقولًا أخرى؛ أخطاء FK المعرّفة تعود 404، وتعارض ملكية سجل شخصي يعود 409. تصحيح `relatedSetClause(related,parameterOffset)` يمنع تداخل فهارس SQL مع حقل ملاحظات في PATCH.
5. **إرث الأسماء:** تطابق `normalizeArabicName` مطلوب للاسم الكامل الفريد، ولا يستخرج هوية من جزء الاسم؛ القيود الموروثة غير المحسومة تبقى نصيًا ولا تُنسب تلقائيًا إلى موظف آخر. وقد شمل ذلك اختبارات Domain.
6. **لا DELETE مباشر:** الراوتر ينفذ GET/POST/PATCH للقيد ويحتفظ بالسجل؛ لا تضيع القيود التاريخية بمجرد حذف كتاب في الواجهة.

**دليل CI الفعلي القديم على SHA PR65:** [run #45062808020](https://github.com/daboolgame123-creator/Saqa/actions/runs/45062808020) ثلاث وظائف ناجحة: فحص TS5 والبناء، تجربة React/Vite الجديدة مع TypeScript المقفّل، وتجميع Phases 1–6 في Runner مؤقت؛ **403 اختبار خادم ناجح +230 PostgreSQL +288 API = 921 PASS، 0 FAIL، 1 SKIP**. مجموعة Phase6 Domain السبعة مشمولة في عداد الخادم ولا تُضاف مجددًا. فحص تبعيات production high/critical ناجح، مع دين moderate عابر للمراحل، وTypeScript 7 غير معتمد.

## 3. ملاحظات مثبتة من المصدر أو بحاجة إعادة إنتاج

### AUD-06-01 — عدّاد «القيود المستقلة» يعرض إجمالي القيود وليس القيود بلا كتاب (P2 / خطأ KPI)

**SOURCE_CONFIRMED / BROWSER_NOT_REPRODUCED.**  
`src/components/views/DailySituationsView.tsx:163–165` يعرف `standaloneRecords` كالسجلات التي لا تتبع كتاب موقف محمّل، بينما `:369` يعيّن `independentRecordsCount = dailySituations.length` لجميع القيود (بما فيها المرتبطة بكتاب). تعرض `:459` القيمة بعنوان «قيود مستقلة بمعرّف المنتسب». لذلك إذا كان لدينا 3 قيود، اثنان منها يرتبطان بكتاب موقف ظاهر وواحد مستقل، فالواجهة تعلن **3 قيود مستقلة** بدل **1**؛ هذا تناقض مباشر بين التسمية ومصدر العداد.

**قبول الإصلاح لاحقًا:** تحديد معنى «مستقل»: (أ) صف منفصل في DB حتى لو ارتبط بمعاملة، أو (ب) صف بلا استمارة كتاب؛ تسمية العدد يجب أن تطابق التعريف، وإضافة اختبار UI ذي 2 مرتبط +1 مستقل بحيث لا تختلف الأرقام عن القائمة المعروضة. لا نغيّر الآن.

### AUD-06-02 — رابط إلى كتاب عادي يجعل الكتاب يظهر كاستمارة موقف يومي (P2 / اتساق نوع المورد)

**SOURCE_CONFIRMED_CHAIN / NEEDS_SYNTHETIC_API_AND_UI_TEST.**  
API يقبل `relatedRecord:{kind:'transaction',id:UUID}` مع FK صالح، لكنه لا يشترط أن تكون المعاملة نفسها `isDailySituation=true` أو ذات `dailySituationData` (`dailySituationRepository.ts:124–152` يجعل الكتب استثناءً من فحص ملكية سجلات الموظف، و`create:165–191` يسجل FK). في الواجهة `DailySituationsView.tsx:106–114` يجمع كل قيد تحت `relatedRecord.id`، ثم `:149–155` يعدّ **أي** معاملة لها سجل مرتبط «موقفًا يوميًا» حتى لو كانت كتابًا إداريًا عاديًا؛ ويعرضها في قائمة «استمارات الموقف» `:673–704`.

**الحدود:** هذه ليست إفشاء بيانات مثبتًا: مورد الموقف الإداري لا يُقرأ من المنتسب، وقد يكون ربط موقف بكتاب غير خاص بالموقف مطلوبًا أرشيفيًا. لكن **معنى العرض** يتحوّل دون قرار، وقد تنتج استمارة فارغة/مشوهة. معيار الإصلاح بعد حسم السياسة: احتفظ بصحة الرابط المرجعي إن كان مطلوبًا، لكن لا تُصنَّف Transaction ككتاب موقف بمجرد أنها مرجع لقيد؛ اختبار كتاب إداري عادي يرتبط بقيد مستقل.

### AUD-06-03 — فلاتر التاريخ/البحث لا تؤثر في سجل الزمنيات والإجازات كما تؤثر في قائمة الاستمارات (P3 / UX)

**SOURCE_CONFIRMED / BROWSER_NOT_REPRODUCED.**  
`DailySituationsView.tsx:195–255` يطبّق `selectedDateFilter` و`searchQuery` في `filteredSituations` (استمارات قائمة «forms»)، بينما `dailyRows` في `:259–348` يبنيه من **كل** `dailySituationTransactions` و`standaloneRecords` ولا يطبّق إلا `selectedEmployeeFilter` في `:265–266`. سجلا `time-permissions` و`leaves` في `:880–1024` يعرضان `allTimePermissions` و`allLeavesAndShifts` دون تصفية التاريخ أو البحث.

**الحدود/قرار القبول:** شريط البحث/التاريخ يقع داخل تبويب «forms»، وليس ظاهرًا في التبويبين الآخرين؛ لذلك قد يكون قصد المنتج أن يعرضا **جميع التواريخ** دائمًا. المشكلة المحتملة هي استمرار حالة الفلترة عند التنقل وتوقع المستخدم اشتراكها؛ يُصنَّف `UX_ACCEPTANCE_PENDING` لا يُفترض خرق قاعدة أعمال. لاحقًا قرر هل فلاتر مشتركة أو مستقلة لكل تبويب، واختبر المخرجات والعدادات بعد التنقل.

### AUD-06-04 — إنشاء وتعديل قيد موقف رسمي دون Audit مستقل للفاعل (P2 / تدقيق عمليات إدارية)

**SOURCE_CONFIRMED_APP / AUDIT_POLICY_REVIEW_PENDING.**  
`server/src/api/controllers/dailySituationController.ts:35–49` ينفذ POST/PATCH عبر الخدمة مباشرة دون `auditActor` أو `auditedMutation`. `server/src/api/services/dailySituationService.ts:131–155` و`dailySituationRepository.ts:163–235` لا يكتبان Audit، و`auditService.ts` لا يعرض `recordDailySituationCreate/Update`. هذا يترك إنشاء/تعديل قيد موقف رسمي بلا حدث Audit خاص بالفاعل **في تدفق التطبيق المعروض**، مع أن `ALSQAYA_PLAN.md:1532–1548,1584–1591` يطلب تتبع التعديلات المهمة عند الحاجة. لا دليل على حذف غير مرخص أو كشف بيانات.

**تقرير الإصلاح لاحقًا:** حسم هل هذه العملية تعديل إداري مهم يستحق `create/update` من الأنواع الحالية، ثم إضافة actor/old-new ومعاملة ذرّية واختبار rollback إن اعتمدها المالك. تتشارك مبدأ السياسة مع `AUD-05-01` لكنها تخص **مورد الموقف اليومي** لا روابط المنتسبين، فلا نستنسخ عملًا دون تنسيق.

### AUD-06-05 — فحص ملكية الرابط الشخصي منفصل عن جملة الكتابة (P3 / سباق يحتاج اختبارًا)

**SOURCE_CONFIRMED_QUERY_ORDER / NOT_REPRODUCED.**  
`dailySituationRepository.ts:126–152` ينفذ `SELECT employee_id FROM leaves/time_permissions/assignments/courses WHERE id=$1` دون `FOR UPDATE` أو ربط قيد DB مركب، ثم `:165–191` ينشئ الصف أو `:204–230` يغيره بجملة مستقلة. تعرّف FK العادي يثبت وجود صف الرابط، لكنه لا يثبت أن `employee_id` ظل مساويًا بين القراءة والكتابة. **لم أثبت** مسار API يمكّن نقل مالك الإجازة أثناء هذه النافذة، وكثير من مالكي سجلات الموارد مقفلون عبر Validators؛ لذلك لا تُصنَّف ثغرة فعلية أو مانعًا جديدًا قبل مراجعة سياسات تحديث تلك الجداول.

**خطوة تحقق لاحقة:** اختبار تزامن اصطناعي لتعديل مالك السجل المرتبط *إن وجد مسار مخوّل أصلًا*، وإثبات ما إذا كان شرط المالك مضمونًا بالبنية أو بقفل DB. إذا تعذّر التغيير عمليًا يمكن إغلاق الملاحظة بوثيقة الدليل دون إصلاح.

## 4. بوابات التكامل والأرشفة

- جدول `daily_situations` وسجلات الكتب التاريخية **مصدران مختلفان**؛ لا نحذف أحدهما عند ظهور سجل مستقل أو عند إخفاء معاملة، ولا نحسب قيدًا مرتين إذا رُحّل بنجاح.
- يظل `AUD-03-01` (الكتب القديمة دون ID) مختلفًا عن تحويل الموقف الموروث إلى قيد، وتظل `AUD-02-01` (حقول إجازة لا تُحفظ) فجوة أخرى في خدمة Personnel، فلا يبرر نجاح الموقف اليومي إغلاقها.
- مرور Phase6 على PR65 وCI مؤقت لا يعني إغلاقًا تشغيليًا أو دمجًا رسميًا؛ مراجعة صاحب الصلاحية وHost والمتصفح بعد الإصلاحات المؤجلة.

**الحكم النهائي لهذه الجولة:** `PHASE06_REVIEWED_WITH_FINDINGS / FIXES_DEFERRED / RELEASE_NO_GO`.  
**التالي:** Phase 07 — Timeline مشتقة على مرشح المرحلة السابعة (تثبيت SHA وCI عند بدء الفحص)، دون إصلاحات تطبيق في مرور المسح.
