# تقرير الفحص الخامس — Phase 05 / Transaction–Employee Relations

**التاريخ:** 23 نوفمبر 2026  
**نوع الفحص:** قراءة الشيفرة واختبارات GitHub السابقة ومقارنة الفروع؛ **لا إصلاح تطبيق، لا قاعدة عمل، لا Merge**.  
**مرجع المرشح المنفرد:** [Draft PR #64](https://github.com/daboolgame123-creator/Saqa/pull/64) SHA `cbb1eae9de186862b0fd49fe6ac9477ad41c63ee`، قاعدته `phase-10-api-data-layer`.  
**مرجع التكامل المراجَع:** دمج مؤقت داخل GitHub Actions لمرشحي مراحل 1–5 على [run #45061129990](https://github.com/daboolgame123-creator/Saqa/actions/runs/45061129990)، لا فرع إنتاج/دمج رسمي. مقارنة مصدر مرحلة15 اللاحق: Draft PR96 SHA `0f16837a437dc9a9d76de395f95ddb80de947129` (شجرة منفردة، تحتاج دمج المرشحين).  
**حكم المسح:** `REVIEWED_WITH_FINDINGS / FIXES_DEFERRED / RELEASE_NO_GO`.

## 1. النطاق وأدلة الفحص

تعريف `ALSQAYA_PLAN.md:909–911`: علاقات حقيقية من نوع Many-to-Many وجدول `TransactionEmployee`. غطت المقارنة مع أساس Phase10 **7 ملفات**: `src/services/transactionEmployeeService.ts` و`server/src/repositories/transactionEmployeeRepository.ts` و`server/src/api/controllers/linkController.ts`، اختبارات `server/tests/{phase5TransactionEmployeeDomain.test.ts,api/links.test.ts}`، تقرير المرحلة وWorkflow.

كما تتبعت:
- `server/src/api/services/linkService.ts`، `server/src/api/validation/linkValidators.ts`، `server/src/api/dto/transactionEmployee.ts`، `server/src/api/routes/{index,resources}.ts`.
- `server/src/repositories/transactionScopeSql.ts`، `server/migrations/0002_transactions.sql`، ومرشح `0016_transaction_employee_null_role_unique.sql` من PR60؛ تمييز ما يوجد في المرشح المنفرد عما يُركّب في Runner.
- `src/App.tsx` و`src/components/views/EmployeesView.tsx` و`src/services/employeeProfileLinks.ts` عند استعمال الروابط، ومسارات Audit `server/src/api/services/auditService.ts` و`linkController.ts` في PR96.
- مخرجات تشغيل jobs على SHA المرشح عبر GitHub Actions؛ **لم أشغّل اختبارات جديدة** ولا اختبارات متصفح/Host.

## 2. ما تثبّت أنه صحيح

1. **رابط هوية حقيقي:** `transaction_employees` يملك `id` و`transaction_id` و`employee_id` مع مفاتيح أجنبية؛ أربع قيم معتمدة للدور: `subject/recipient/assigned/beneficiary`. لا تعتمد روابط API على نص الاسم. `employeeIds` مرآة للعرض وليس بديل FK.
2. **حماية الدور متعدد الأغراض:** `TransactionEmployeeService.seedFromTransactions:195–217` يميز الثلاثية `[transactionId, employeeId, relationshipType]` حتى لا يُسقط دورًا آخر. `syncForTransaction:122–151` يحتفظ بجميع أدوار الشخص الذي ما زال مطلوبًا، ويزيل أدوار شخص فُك ارتباطه، و`employeeIdsForTransaction:103–105` يزيل تكرار معرّفه **من المرآة فقط**.
3. **حد الأسماء الموروثة:** `resolveEmployeeIds:168–179` لا ينتج ID عند تطابق جزئي أو اسم كامل متكرر، وتغطي الاختبارات الثمانية حالتي تطابق الاسم الفريد/الملتبس. **في الوضع الرسمي، الإسناد إلى إضبارة المنتسب لا يُستنتج بالاسم** كما وثق فحص Phase03.
4. **نطاق القراءة:** `transactionEmployeeRepository.ts:62–102` ينفذ `JOIN transactions` ويستبعد `deleted_at IS NOT NULL` لكل قراءة، ويضيف `transactionScopeCondition` داخل SQL **قبل الإرجاع** عند وجود نطاق للمستخدم. لا تظهر روابط الكتب المحجوبة بتمرير UUID كتاب أو منتسب فقط؛ الاختبارات المتقاطعة في Phase13 لازمة للاعتماد الأمني النهائي.
5. **أرشفة الكتاب:** `transactionEmployeeRepository.ts:106–187` يُقفل صف الكتاب قبل إضافة/تعديل/حذف روابطه مع `deleted_at IS NULL`. يحفظ الأرشيف الروابط التاريخية في قاعدة البيانات ويعيدها بعد الاستعادة. فحص API على بيانات اصطناعية يغطي 404 على التعديل/الحذف والإضافة لكتاب مؤرشف وثبات ID الرابط بعد الاستعادة.
6. **صلاحيات HTTP:** `requireSession` و`requireResourcePermission` و`attachAccessScope` تسبق راوتر الروابط؛ عمليات POST/PATCH/DELETE ليست مكشوفة لمستخدم بلا صلاحية، بينما GET يُقيد برؤية الكتاب.

**نتائج CI السابقة:** [run #45061129990](https://github.com/daboolgame123-creator/Saqa/actions/runs/45061129990) جميع الوظائف الثلاث `completed/success`: TypeScript المقفل 5.8 والبناء، تجربة React/Vite الأحدث مع TS5 في Runner مؤقت، والتجميع المعزول للمراحل 1–5. **في التجميع: 396 اختبار خادم +230 PostgreSQL +284 API = 910 ناجحة، 0 فشل، اختبار واحد متخطى.** اختبارات Domain الثمانية مشمولة ضمن عداد الخادم التراكمي. فحص التبعيات high/critical ناجح، لكن بقي تنبيهان moderate وفق تقرير PR64. لا ضمان لتوافق TypeScript 7، ولا Merge رسمي أو اختبار Windows.

## 3. المشكلات وشروط القبول المؤجلة

### AUD-05-01 — تعديل روابط المنتسبين بلا حدث Audit تابع للفاعل (P2 / تدقيق هوية وعلاقات)

**SOURCE_CONFIRMED_AT_APPLICATION_LAYER / POLICY_ACCEPTANCE_PENDING.**  
`server/src/api/controllers/linkController.ts:54–80` في PR64 يستدعي `transactionEmployees.create/update/remove` مباشرة بلا `auditActor` أو `auditedMutation`؛ `server/src/api/services/linkService.ts:47–80` يكتب أو يحذف عبر المستودع فقط. الفحص المقارن للنسخة الأحدث PR96 أظهر أن راوتر الروابط هناك أيضًا يمرر هذه العمليات دون كاتب Audit. مراجعة `ALSQAYA_PLAN.md:1532–1548,1584–1591` تطلب تتبّع تعديلات مهمة عند الحاجة وربط الحدث بالفاعل، فيما إنشاء/حذف علاقة كتاب–منتسب تغيير قد يؤثر في الإضبارة والتاريخ.

**الأثر:** لا يوجد في التدفق التطبيقي المعروض حدث مستقل يحدد من أضاف/غيّر/حذف أي دور لمنتسب من كتاب وما قبل/بعد؛ لا يعني ذلك إثبات غياب كل سجل تقني أو وقوع اختراق. يجب في الإصلاح اللاحق الاتفاق على نطاق Audit وأسماء الأحداث المسموح بها، ثم معاملة ذرية تشمل كتابة الرابط والتدقيق وبيانات actor وold/new مع اختبارات rollback. **هذه علاقة `transaction_employees` وليست ربط `users.employee_id` المعروف في `AUD-15-03`؛ لا تخلط المهمتين.**

### AUD-05-02 — إذا زال آخر رابط، قد تعيد المزامنة المحلية تكوينه من المرآة القديمة (P3 / سلوك طريقة Domain)

**SOURCE_CONFIRMED_FOR_EXPLICIT_METHOD_CALL / LIVE_INVOCATION_NOT_PROVEN.**  
`src/services/transactionEmployeeService.ts:213–246` يبني `booksWithLinks` من الروابط المتبقية، ثم يُسمح لكتاب **بلا أي رابط** بالرجوع إلى `transaction.employeeIds`. في مثال اصطناعي بكتاب مرآته `['employee-a']` ثم حُذف **آخر** رابط رسمي، وإعادة استدعاء `seedFromTransactions([], [book], employees)` ستنشئ رابطًا جديدًا من المرآة القديمة. الاختبار الحالي `phase5TransactionEmployeeDomain.test.ts:61–69` يثبت عدم إحياء رابط شخص محذوف **عندما يبقى رابط آخر**، لكنه لا يغطي حالة صفر روابط.

**الحدود:** لم يثبت استدعاء هذه الدالة أصلًا بعد إزالة آخر رابط في API الرسمي؛ لا تصنف كتسريب تشغيل فعلي. لاحقًا اختبر idempotence بعد حذف **كل** الروابط وحدد طريقة فصل «كتاب لم يُرحّل قط» عن «كتاب فُك آخر رابط له عمدًا»، من دون ربط آلي مبني على اسم.

### AUD-05-03 — معنى «فك الارتباط» يختلف بين Demo وAPI إذا امتلك الشخص أكثر من دور (P3 / اتساق أعمال)

**SOURCE_CONFIRMED / EXPECTED_BEHAVIOR_DECISION_NEEDED.**  
`src/services/transactionEmployeeService.ts:60–81` يتعامل `unlink(relations, transactionId, employeeId)` مع **كل** صفوف الشخص في الكتاب ويزيلها كلها بلا مُعامل role أو link ID؛ بينما `DELETE /api/transaction-employees/:id` في `server/src/api/controllers/linkController.ts:76–80` يزيل **صفًا واحدًا** بمعرّف الرابط. هذا فرق واضح في دلالة العملية عندما تكون هناك علاقتا `subject` و`recipient` للمنتسب ذاته.

**ليس خطأً مؤكدًا:** قد يراد من عملية Demo فصل الشخص كاملًا؛ يُطلب قرار واجهة: فصل الشخص من الكتاب بالكامل أم حذف دور واحد، مع اختبار role-aware حسب القرار. لا تعمم عملية مسح جميع الأدوار على API الرسمي تلقائيًا.

### AUD-05-04 — عقد أخطاء FK/UNIQUE وتفرد الدور الفارغ معتمد على تكامل Phase1 (P2 تكامل / إحالة)

**SOURCE_CONFIRMED_ON_STANDALONE / REQUIRES_PINNED_FINAL_INTEGRATION.**  
مرشح PR64 المنفرد لا يحتوي `0016_transaction_employee_null_role_unique.sql` من Phase1، لذلك يعتمد فقط على UNIQUE الثلاثية في `0002_transactions.sql` التي لا تمنع تكرار الدور NULL افتراضيًا في PostgreSQL. كذلك `server/tests/api/links.test.ts:225–232` يتوقع **HTTP 500** عند محاولة ربط موظف غير موجود، لأن `linkService.ts` في PR64 المنفرد لا يترجم FK. أما PR60 فيضيف `0016` و`rethrowLinkWriteError` للرمزين `23503/23505` واختبار 404 صريح (`server/tests/api/links.test.ts:211–219`). نتيجة CI التجميعي ناجحة، لكن **توقع الاختبار يختلف بين الفرعين**؛ عند تثبيت مصدر الإصدار النهائي يجب التحقق من أن المدمج يستخدم ترجمة 404/409 وأن فهرس 0016 موجود، مع نتيجة CI على SHA مطابق.

**الإحالة الأصلية:** `AUD-15-06` (مانع التكامل العام N-02) و`AUD-01-04` (شرط ترحيل 0016 على القاعدة القديمة). لا نفتح ترحيلًا ثانيًا ولا نضع تصحيحًا يناقض الفرع الأول.

### AUD-05-05 — إدارة الروابط رسميًا من إضبارة المنتسب (إحالة)

واجهة `EmployeesView` لا توفر فك الرابط في API الرسمي رغم وجود الراوتر، لأن `App` لا يوصل `onSaveTransaction` في الوضع الرسمي ولأن PATCH للكتاب يمنع استبدال روابطه. هذه `AUD-03-04` نفسها؛ يُقرَّر لاحقًا هل نحتاج عملًا إداريًا مستقلًا لفك الدور مع تصريح/Audit، دون فتح عيب جديد.

## 4. بوابات المرحلة التالية وحدود الدليل

- لم أتحقق من وجود صفوف حقيقية فيها أدوار NULL مكررة، ولا شغّلت migrations على `alsqaya_staging`، ولا اختبرت عملية فك آخر رابط في المتصفح. مراجعات SQL تثبت شروط الحماية الظاهرة، ولا تُغني عن مراجعة صلاحيات Phase12/13 على شجرة الإصدار النهائية.
- PR64 مغلق **برمجيًا بحسب تقريره القديم** ومختبر على نطاقه، لكن هذه الجولة تُصنفه `REVIEWED_WITH_FINDINGS` ولا تحوّله إلى قبول نشر. إصلاحات المراحل 1–5 تُدمج مؤقتًا في CI فقط.
- **التالي:** Phase 06 — Daily Situation. فحص الكيان المستقل وتجميع الأذونات والإجازات والموقف اليومي والقيود الزمنية، وتوثيق الملاحظات دون تعديل الشيفرة.

**الحالة:** `PHASE05_REVIEWED_WITH_FINDINGS / FIXES_DEFERRED / RELEASE_NO_GO`.
