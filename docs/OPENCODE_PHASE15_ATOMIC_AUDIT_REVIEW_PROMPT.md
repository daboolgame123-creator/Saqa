# OpenCode — مراجعة مستقلة لإصلاح Phase15 (P15-02)

**التاريخ:** 2026-11-23  
**الحالة:** `REVIEW_REQUIRED / NOT_ASSIGNED` (لم تُنفّذ OpenCode هذه المراجعة).  
**المستودع:** `daboolgame123-creator/Saqa`  
**المرشح الحالي للمراجعة:** [Draft PR #84](https://github.com/daboolgame123-creator/Saqa/pull/84)، فرع `fix/phase15-d-audit-atomic-operations-20261123`. افتح **HEAD الفعلي** عند البدء، لا تثبّت SHA قديمًا.  
**المراجع:** [مرحلة 15-A PR #81](https://github.com/daboolgame123-creator/Saqa/pull/81)، [التشخيص #82](https://github.com/daboolgame123-creator/Saqa/pull/82)، [الإصلاح الأول #83](https://github.com/daboolgame123-creator/Saqa/pull/83)، `docs/PHASE_15_D_ATOMIC_AUDIT_ACCEPTANCE_20261123.md`.

## السياق المُثبت (لا تعِد اكتشافه من الصفر)

في PR #82، أثبت Failure Injection على `alsqaya_test` أن فشل INSERT `audit_logs` بعد نجاح CREATE transaction أعطى HTTP 500 **مع بقاء كتاب دون حدث تدقيق**، وهذا عيب أمني حقيقي `P15-02`.

نفّذ CHAT إصلاحًا مرشحًا في PR #83/#84: `ApiServices.auditedMutation` ينشئ `withTransaction` على Pool ويُمرر `Client` واحدًا إلى خدمات المجال وAudit. شمل إنشاء/تعديل/أرشفة/استعادة الكتب، الإتاحة وسحبها، حالة المنتسب، الطلبات وسير الموافقة، والعلاقات. تبقى الإشعارات **بعد commit**.

**الدليل الحالي:** [CI #45080332491](https://github.com/daboolgame123-creator/Saqa/actions/runs/45080332491) **962 PASS / 0 FAIL / 1 SKIP**، منها 3 سيناريوهات مباشرة لحقن فشل Audit:
- إنشاء كتاب: rollback كامل وعدم كتابة نجاح زائف.
- منح إتاحة: rollback كامل، لا منح غير موثق.
- سحب إتاحة: rollback كامل، وتبقى الإتاحة السارية وسجل منحها الصحيح.

هذه **أدلة مرشح**، وليست اعتماد مراجعة مستقلة.

## المهمة الآن — OpenCode Plan / read-only أولًا (دون تعديل أو Git write)

راجع **الكود الجديد** في PR #84 ومقارنتَه بالأساس وليس فقط الاختبار:

1. `server/src/api/services/index.ts`: صحة `auditedMutation` وإعادة بناء الخدمات على `PoolClient/Client`، لا `BEGIN` متداخل، وضمان ROLLBACK عند فشل Audit.
2. `server/src/api/controllers/{transactionController,availabilityController,employeeController,requestController,relationController}.ts`: كل domain change مع corresponding audit في المعاملة ذاتها، والفاعل ونطاق الرؤية والصلاحيات والقفل التفاؤلي لم تتغير.
3. `server/src/repositories/{transactionRepository,requestRepository,employeeRepository,transactionAvailabilityRepository,transactionRelationRepository}.ts`: كل عمليات `withTransaction` على Pool أو Client؛ تأكد من عدم استخدام Pool خارجي ضمن المعاملة أو إبطال الضمان.
4. `server/tests/api/phase15AuditAtomicityDiagnostic.test.ts` والاختبارات الموجهة: راجع مصداقية الإثباتات والمفقود منها (حقن فشل في أرشفة/استعادة/طلب workflow ونقل حالة المنتسب، عند الحاجة فقط).
5. اكتشف **أي مسار حساس ما زال يكتب بيانات ثم Audit منفصلًا**، أو أثر جانبي خارجي يجري داخل SQL Transaction. فرّق العيب المثبت عن توقع/تحسين غير مطلوب.
6. قيّم الإشعارات بعد commit: فشل لاحق قد يؤدي HTTP 500 رغم نجاح المجال وAudit؛ هل يلزم حل قبل إطلاق النظام أم يكفي سجل/إعادة محاولة محكومة؟ **لا تخترع Outbox تلقائيًا**.
7. راجع `auditTypes.ts` لضمان تنقية مفاتيح أسرار متداخلة بلا محو سياق العمل، مع الاحتفاظ بقاعدة `view_audit_logs` وViewLog idempotency.
8. بيّن ما يستلزم قرار **OWNER/HOST**، خصوصًا أذونات قاعدة `audit_logs` وسياسة حماية الملفات، بدل تعديل DB الحقيقية.

### التسليم المطلوب من OpenCode

تقرير **PASS / BLOCKERS** مختصر مع روابط file/line وأثر كل خلل وتحديد `P0/P1/P2`، وقائمة اختبارات إضافية **لا تزيد إلا حين تخدم عيبًا مثبتًا**، وخطة إصلاح صغيرة متسلسلة إن لزم. سجّل كيف يثبت اكتمال كل إصلاح دون تغيير الإصدارات أو فتح إعادة تصميم كاملة.

**لا تنفّذ Build ولا Commit/Push/Merge ولا تلمس `alsqaya_staging` أو أي بيانات مستخدم خلال Plan.** عند موافقة المالك فقط، استعمل فرعًا منفصلًا وPostgreSQL اصطناعية واختبارات CI التراكمية، ثم مرشح PR مسودة `NO MERGE`.

## برومبت قصير جاهز لإرساله إلى OpenCode

> راجع PR #84 في مستودع `daboolgame123-creator/Saqa` مع `docs/OPENCODE_PHASE15_ATOMIC_AUDIT_REVIEW_PROMPT.md`. اختر وضع **Plan/read-only**. أصلحنا مبدئيًا P15-02 حيث كان التغيير يُحفَظ قبل Audit وأثبتناه بحقن الفشل، ثم قدمنا `auditedMutation` وتوسيعًا لمسارات الكتب والإتاحة والطلبات والعلاقات. أريد **مراجعة مستقلة دقيقة** لصحة المعاملة الواحدة وانعدام التسرب ومسارات الكتابة غير المغطاة؛ صنّف فقط العوائق المثبتة وخطة أصغر إصلاح. لا تعدّل ملفات ولا تعمل Commit/Push/Merge أو تتصل ببيانات المؤسسة قبل أن أعتمد الخطة.

**الحالة المؤسسية:** `RELEASE_NO_GO`. `OC-11-SEC` مراجعة مستقلة أخرى للمصادقة لم تُكلَّف بعد.
