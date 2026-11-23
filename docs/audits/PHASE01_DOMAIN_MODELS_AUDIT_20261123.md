# تقرير الفحص الأول — Phase 01 / Domain Models
**تاريخ الفحص:** 2026-11-23  
**نوع العمل:** READ-ONLY SOURCE / HISTORIC CI / DEPENDENCY CHECK؛ توثيق فقط، بلا تعديلات على التطبيق.  
**مرجع مرشح المرحلة الأولى:** [Draft PR #60](https://github.com/daboolgame123-creator/Saqa/pull/60), `f2c91947d815d37e066de841c5216f3680473a86` (الأساس: `phase-10-api-data-layer`).  
**مرجع التكامل المقارن:** شجرة CI المجمعة `19d42915c62852a5833d2c37eaab45bd9da62af8`، من [run #45245406781](https://github.com/daboolgame123-creator/Saqa/actions/runs/45245406781)، رأس PR96 `0f16837a437dc9a9d76de395f95ddb80de947129`؛ **هذا تكامل اختبار مؤقت، لا Merge رسمي**.  
**نتيجة المسح:** `REVIEWED_WITH_FINDINGS / OPERATIONAL_CLOSURE_UNCHANGED / RELEASE_NO_GO`.

## 1. حدود المرحلة والمواد المفحوصة

وفق `ALSQAYA_PLAN.md:891–893` تغطي المرحلة الأولى **النماذج الأساسية والعلاقات الأولية**، وتلزم المواد §7.1–7.7 معرّفات مستقلة وM:N فعلية للكتاب↔المنتسب، والاحتفاظ بالبيانات التاريخية. لا يُنسب كل كود ظهر لاحقًا إلى هذه المرحلة: طبقة قواعد البيانات Phase9، API Phase10، Access Scope الرسمي Phase13، بينما Phase5 مسؤول عن دور العلاقة ومزامنتها.

**النماذج:** `src/core/models/{employee,user,permission,transaction,transactionEmployee,accessScope,dailySituation}.ts` مع `src/core/models/index.ts` و`src/types.ts` (إعادة التصدير).  
**نقاط الاستخدام والمخاطر العابرة للمراحل:** `src/services/{authService,transactionEmployeeService}.ts`، `src/utils/employeeUtils.ts`، `server/src/repositories/{transactionRepository,transactionEmployeeRepository,transactionScopeSql}.ts`، `server/src/api/services/linkService.ts`، `server/src/api/validation/transactionValidators.ts`، `server/src/middleware/errorHandler.ts`.  
**التخطيط/الاختبار:** `server/migrations/0002_transactions.sql` و`0016_transaction_employee_null_role_unique.sql`، `server/tests/{phase1DomainHardening,phase5TransactionEmployeeDomain}.test.ts` و`server/tests/db/{integrity,migrations}.test.ts` و`server/tests/api/links.test.ts`، `.github/workflows/phase1-domain-integrity.yml`.

**التغييرات الخاصة بمرشح Phase1 PR60:** 10 ملفات: إصلاح المطابقة والأذونات المحلية، تفرد الروابط الفارغة، ترجمة قيود المرجع و`UNIQUE` لمسار الروابط، مرآة employeeIds فريدة، وأدلة tests/CI. لم تعالج PR60 جميع مسارات المرحلة الخامسة/إنشاء الكتب، وهذا جزء من التفريق بين المراحل.

## 2. نتائج سليمة بأدلة

1. **هوية مستقلة:** النماذج تعرّف `User.employeeId` كرابط اختياري و`TransactionEmployee.employeeId/transactionId` كمعرّفين أساسيين؛ `employeeName` مذكور كمرآة عرض/توافق تاريخي، وليس مفتاح علاقة رسمي.
2. **أسماء متشابهة:** `TransactionEmployeeService.resolveEmployeeIds` في `src/services/transactionEmployeeService.ts:168–179` يستخدم تطابق الاسم العربي **الكامل بعد التطبيع** فقط، ويرفض الجزئي والمتكرر؛ `server/tests/phase1DomainHardening.test.ts:10–28` يختبر ذلك. لا إثبات لمسار إنتاجي يجيز الأسماء كبديل عن الإتاحة الرسمية.
3. **عزل الحساب في الخادم:** `canUserAccessTransaction` نفسه في `src/core/models/accessScope.ts:55–107` موثّق كعرض للوضع المحلي التجريبي؛ الخادم يستخدم شروط نطاق SQL خاصة به: `server/src/repositories/transactionScopeSql.ts`. لا يجوز تقديم نجاح نموذج الواجهة كاختبار عزل للخادم.
4. **تفرد متعدد الأدوار:** الترحيل `0016` يضيف فهرس UNIQUE جزئيًا على `(transaction_id,employee_id)` عندما `relationship_type IS NULL`؛ الأدوار المسمّاة تبقى مستقلة. يفحص وجود تكرارات قديمة ويتوقف **بلا حذف سجلات** عند العثور عليها. اختبار PostgreSQL `integrity.test.ts` ومسار API `links.test.ts` يثبتان السلوك الاصطناعي.
5. **مرآة المعرفات:** `transactionRepository.ts:219–235` لا تكرر employeeId عند وجود أكثر من دور لنفس الشخص، بينما تبقى أدوار العلاقة في جدولها الكامل.

**دليل الاختبار المنفصل:** [Phase1 CI run #45047650309](https://github.com/daboolgame123-creator/Saqa/actions/runs/45047650309) على SHA `f2c91947...`: `npm ci` وTypeScript وBuild ناجحة؛ **4 فحوص نطاق/أسماء + 26 اختبارات PG/ترحيل + 10 API = 40 PASS، 0 FAIL**.  
**الدليل التراكمي:** [run #45245406781](https://github.com/daboolgame123-creator/Saqa/actions/runs/45245406781) أُنجز على شجرة مؤقتة تضم فروع 1–10 مع مرشح Phase15-N2: **975 PASS، 0 FAIL، 1 SKIP**؛ لا يعني نجاح مرشح Phase1 لوحده اعتماد جميع الفروع الأخرى أو تكاملًا رسميًا.

## 3. الملاحظات المسجلة — دون إصلاح الآن

### AUD-01-01 — تفرد الدور عند زرع الروابط القديمة (P3 / تعارض فروع)
**دليل Source confirmed على PR60 المنفرد، مُعالَج في مرشح Phase5 التراكمي؛ ليس تسريبًا مثبتًا.**  
في نسخة Phase1 `src/services/transactionEmployeeService.ts:195–236` تستعمل `seedFromTransactions` مفتاحًا `transactionId::employeeId` دون `relationshipType`، لذا إذا أعطيت الدالة علاقة `subject` وأخرى `recipient` للشخص والكتاب نفسيهما، تحتفظ بالأولى فقط. النتيجة مخالفة لقاعدة الأدوار المستقلة، لكن الاستدعاء في الشجرة التراكمية الحالية محصور بالاختبارات؛ **لم يثبت مسار إنتاجي يستعمل هذه الدالة**.

**منع ازدواج الإصلاح:** مرشح Phase5 في `cbb1eae9de186862b0fd49fe6ac9477ad41c63ee` غيّر مفتاح المقارنة إلى `JSON.stringify([transactionId,employeeId,relationshipType ?? null])` وأضاف اختبارًا في `server/tests/phase5TransactionEmployeeDomain.test.ts:37–52`؛ النسخة التراكمية المختبرة تحتوي هذا الإصلاح. لا نفتح إصلاحًا مكررًا في Phase1؛ عند التكامل النهائي نتحقق من بقاء اصلاح Phase5 وقبول اختباره.

**الدليل الناقص:** اختبار حالة إطلاق نهائي على **SHA دمج رسمي**؛ لا ادعاء بفقدان بيانات إنتاج فعلية.

### AUD-01-02 — تفاوت رؤية الموقف اليومي في الوضع التجريبي (P3 / سلوك محلي)
**SOURCE_CONFIRMED / HOST_NOT_REPRODUCED.**  
`src/core/models/accessScope.ts:85–90` تعيد `true` لأي منتسب نشط عندما `visibility='PublicToEmployees'`، دون فحص `isDailySituation` أصلًا، بينما الخادم يُجبر `excludeDailySituations` في `server/src/authorization/accessScope.ts:105–114` و`server/src/repositories/transactionScopeSql.ts:65–71`. وبذلك يمكن لبيانات **الوضع التجريبي المحلي** غير المتسقة (كتاب موقف يومي معلّم عام) أن تظهر للمنتسب في تلك المعاينة، خلافًا للـAPI الرسمي. `AuthService.filterTransactionsForUser` يستدعي الدالة المحلية، بينما مسارات الإنتاج محمية في SQL.

**ممنوع تفسيرها كثغرة كشف بيانات إنتاج مثبتة.** المطلوب لاحقًا اختبار وحدة بسيط ومطابقة سلوك demo أو توضيح أن الوضع التجريبي لا يحاكي هذا القيد، دون تخفيف حماية الخادم.

### AUD-01-03 — إنشاء كتاب بروابط مكررة قد يرجع خطأ 500 عامًا (P3 / 01↔04↔05↔10)
**SOURCE_CHAIN_CONFIRMED / API_CASE_NOT_EXECUTED.**  
`server/src/api/validation/transactionValidators.ts:59–64,108` يفحص بنية كل `employeeLinks` ولا يظهر منع لتكرار الزوج (employeeId,relationshipType) داخل القائمة. `server/src/repositories/transactionRepository.ts:416–421` يُدرج كل رابط كما هو؛ قيد `UNIQUE` سيرفض الثاني `23505`. `transactionService.create` لا يترجم هذا الخطأ إلى AppError خاص، والمعالج `server/src/middleware/errorHandler.ts:41–56` يعيد `INTERNAL_ERROR / HTTP 500` للأخطاء المجهولة. مسار `linkService.create` **المنفصل** يعيد 409؛ لا يغطّي إدخال روابط عند إنشاء كتاب.

الأثر المتوقع: المعاملة تُتراجع (لا يُثبت حفظ ناقص) لكن المستخدم يتلقى 500 عوضًا عن خطأ تعارض/إدخال مفهوم. نحتاج **اختبار API اصطناعي للحالة** حين تبدأ دفعة الإصلاحات؛ لا نفترض وقوعها بالفعل لمستخدم.

### AUD-01-04 — شرط تبنّي الترحيل 0016 على قاعدة قديمة (بوابة تنفيذ لا خطأ مثبت)
**MIGRATION_PRECONDITION / HOST_PENDING.**  
إذا احتوت قاعدة موجودة مسبقًا على صفّي رابط فارغَي الدور للكتاب والمنتسب نفسيهما فإن `0016` يفشل عمدًا بـ`PHASE1_DUPLICATE_UNTYPED_LINKS` بدل حذف البيانات. قبل دمج/ترحيل المضيف: النسخ الاحتياطي والتحقق من تكرارات فعلية ثم تسوية معتمدة يدويًا إن لزم. **لا دليل أن قاعدة المؤسسة تحتوي تكرارات**؛ لا نلمسها الآن.

## 4. توافق المكتبات — تحقق محدود من الإصدارات

- من `package-lock.json` في شجرة التكامل: `react@19.3.0`، `react-dom@19.3.0`، `vite@6.4.6`، `typescript@5.8.3`، `@vitejs/plugin-react@5.2.0`، `express@5.2.1`، `pg@8.23.0`.
- راجعت القوائم العامة في 23 نوفمبر 2026: [React](https://www.npmjs.com/package/react?activeTab=versions) آخر `19.3.1`؛ [Vite](https://www.npmjs.com/package/vite?activeTab=versions) آخر `8.3.8`؛ [TypeScript](https://www.npmjs.com/package/typescript?activeTab=versions) آخر `7.0.2`. يوجد فرق بين إصداراتنا وأحدث الإصدارات، لكنه **ليس دليل عطل أو ثغرة**.
- تحقق CI على **Node 22 + npm ci + tsc + Vite build** ناجح للمرحلة الأولى وللتجميع المحدد. لم نُجرِ اختبار ترقية Node/Vite/TypeScript إلى major جديد، فلا نصف التوافق معه بأنه مثبت. لا تحديث تبعيات في وضع `AUDIT_FIRST`؛ نسجل تحديثًا منضبطًا بعد إغلاق فحص المراحل واختيار نسخة مستهدفة قابلة للرجوع.

## 5. نطاقات لاحقة لا تُحسب عيوب Phase1 بغير دليل

- `EmployeeCategory='باحث'` موجودة ضمن نموذج المنتسب، بينما `ALSQAYA_PLAN.md §7.4` يتطلب `Researcher` مستقلًا بمواصفة حقول لاحقة؛ **هذا متطلب نطاق غير مكتمل وليس برهان خطأ في Phase1**. يُراجع مع مراحل الملف الشخصي/التقارير ولا يُستحدث نموذج تخميني.
- النظام القديم للإشعارات له أنواع نماذج تاريخية في `notification.ts`، رغم قرار إيقاف إنتاج الإشعارات في PR95/96؛ **هذه حالة مرحلة 15/21، وليست سببًا لفتح إصلاح Phase1**.
- الملاحظات المعروفة لـ`Employee.userId` وAudit تُسجل أصلًا بـ`AUD-15-03` (Phase2/15) لتجنب تكرارها.

## 6. حكم الفحص والخطوة التالية

**نتيجة المرور:** `REVIEWED_WITH_FINDINGS` للمرحلة 1 — تم جرد البنية والاختبارات والتبعيات ومصادر المخاطر، مع التفريق بين مرشح Phase1 المنفرد والدمج المؤقت. لا دليل في النطاق المفحوص على **تسريب مباشر مثبت للخادم**؛ توجد ملاحظات وظيفية/اتساق وتبعيات قبول مؤجلة.  
**لا إغلاق تشغيلي:** `NO_MERGE / RELEASE_NO_GO` باقٍ؛ PR60 وPR97 Draft. لم أعدّل أية ملفات تطبيق أو ترحيلات أو بيانات. **ما لم يُنفّذ هنا:** لا اختبار جديد في متصفح أو DB حقيقية أو npm upgrade؛ قرأنا نتائج CI التاريخية وحددنا حالات إعادة الإنتاج اللازمة.

**التالي:** Phase 02 — Personnel Domain & Services، عند بدء فحصها نثبّت SHA الفرع `64b0b35619038ceb4b1cf4b44c6226f304cd41f8` وتبعياته، ثم نحدّث السجل العام دون تنفيذ إصلاحات.
