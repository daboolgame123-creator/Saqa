# تقرير المرحلة التاسعة — PostgreSQL / Migrations / Persistence

**التاريخ:** 2026-11-23  
**المرجع:** [Draft PR #68](https://github.com/daboolgame123-creator/Saqa/pull/68)، SHA `949802221cbcc96418b6be5405c115164dc03422`، أساس `phase-10-api-data-layer`.  
**الحالة:** `REVIEWED_WITH_FINDINGS / FIXES_DEFERRED / RELEASE_NO_GO`  
**حدود العمل:** قراءة الشيفرة ونتائج GitHub Actions فقط؛ **لا تشغيل قاعدة بيانات، لا تراجع أو ترحيل، لا مساس بقاعدة المؤسسة أو بملفات التطبيق، لا دمج**.

## 1. جرد المرحلة

وفق `ALSQAYA_PLAN.md` §25 تشمل Phase9 مخطط PostgreSQL، والترحيلات، واتساق التواريخ والمعاملات. تغيرت 4 ملفات في PR68: `server/src/database/migrations.ts`، `server/tests/db/migrationSafety.test.ts`، Workflow `phase9-persistence-audit.yml` وتقرير التدقيق القديم. شملت القراءة أيضًا:
- `server/src/database/{cli,pool,dateTime,index}.ts`، `server/migrations/0001_core_identity.sql` و`0002_transactions.sql` وقوائم 0001–0015 في `server/tests/db/migrations.test.ts`.
- `server/tests/db/{migrationSafety,migrations,testDb}.ts`، ملفات CI وأساس فصل اختبارات PostgreSQL.
- تبعية الترحيل `0016` (Phase1) و`0017` (Phase15) على الدمج اللاحق؛ هذان ليسا ضمن مرشح PR68 المستقل.

## 2. سلامة مثبتة بالشيفرة والاختبارات السابقة

- `runMigrations` و`rollbackMigrations` ينفذان داخل `BEGIN…COMMIT` بعد قفل `pg_advisory_xact_lock(17419,9)`؛ يتسلسل التنفيذ داخل قاعدة واحدة، وتراجع عدة خطوات ذري بحيث يفشل الكل إذا فشلت خطوة.
- `verifyApplied` يرفض اسم أو checksum أو ملف ترحيل مفقود، و`runMigrations` يمنع ترحيلًا أقدم بعد تسجيل الأحدث؛ ترتيب ملفات SQL رقمي لا معجمي. `rollbackMigrations` يرفض عدد خطوات يتجاوز المطبق.
- المخطط يستخدم مراجع UUID/FK، والتواريخ `date` مختلفة عن `timestamptz` وعن تاريخ إدخال/استيراد الكتاب. `createPool` يفرض UTF8؛ `withTransaction` يدير COMMIT/ROLLBACK.
- CLI `down` يُحظر في `NODE_ENV=production` ويتطلب `--confirm-destructive` خارج الإنتاج، **لكن هذا لا يثبت هوية قاعدة الهدف**.
- [GitHub Actions #45067538932](https://github.com/daboolgame123-creator/Saqa/actions/runs/45067538932): الوظائف الثلاث `success` على SHA PR68؛ التجميع الاصطناعي المؤقت Phases 1–9 حقق **417 خادم + 236 PostgreSQL + 290 API = 943 PASS، 0 FAIL، 1 SKIP**. الاختبارات الستة الجديدة مضمنة ضمن عداد PostgreSQL ولا تُضاف مجددًا. أحدث `pg` و`@types/pg` اجتازا TypeScript5.8 واختبارات سلامة الترحيلات **في Runner فقط**؛ لا ترقية فعلية ولا اعتماد TypeScript7.

## 3. الملاحظات المؤجلة

### AUD-09-01 — أمر `db:status` قد ينشئ جدولًا في قاعدة جديدة (P3 / تأثير جانبي)

**SOURCE_CONFIRMED / HOST_NOT_REPRODUCED.**  
`server/src/database/migrations.ts:291–309` يستدعي `ensureMigrationsTable(pool)` والتي تنفذ `CREATE TABLE IF NOT EXISTS schema_migrations` (`:138–149`). يستدعي CLI هذا المسار عند `status` (`server/src/database/cli.ts:103–115`). لذلك الفحص الذي يبدو للقراءة فقط يكتب DDL على قاعدة لا تحتوي الجدول. لاحقًا يجب تقرير هل الإنشاء التلقائي مقصود أم يُرجع status «لم تُهيأ» دون كتابة؛ لا يوصف هذا الأمر بأنه Read-only مطلقًا قبل الحسم.

### AUD-09-02 — `getMigrationStatus` لا يشارك قفل Up/Down (P3 / اتساق قراءة)

**SOURCE_CONFIRMED / CONCURRENCY_TEST_PENDING.**  
`runMigrations/rollbackMigrations` يبدأان معاملة ويحصلان على advisory lock (`migrations.ts:183–191,236–242`)، بينما `getMigrationStatus:291–299` يقرأ الجدول مباشرة من Pool دون قفل/معاملة. أثناء Up/Down قد يرى حالة قديمة أو ينافس إنشاء أول جدول. **لا فساد بيانات مثبت.** اختبار لاحق يمسك ترحيلًا ببوابة اصطناعية ثم يستعلم status لتحديد دلالة الاتساق المطلوبة.

### AUD-09-03 — مجلد عنقود اختبار Windows ثابت ويُعاد استعماله قبل `dropDatabase` (P2 / حماية مضيف)

**SOURCE_CONFIRMED_ENVIRONMENT_GUARD_GAP / NO_USER_DATA_TOUCHED.**  
`server/tests/db/testDb.ts:24–29,160–194` يستخدم `SystemDrive\alsqaya-test-pg` (افتراضيًا C:) ومنفذ `5440` و`persistent:true`. إن وجد ملف `PG_VERSION` يعيد استعمال العنقود، ثم يستدعي `dropDatabase('alsqaya_test')` و`createDatabase`. لا يظهر في هذا المسار **تحقق بصمة هوية معلنة للعنقود القائم** قبل حذف قاعدة تحمل الاسم المستهدف. الاختبارات السابقة نجحت على Runner اصطناعي، **وليس دليلًا أن مجلد Windows الموجود آمن للتنظيف**. شرط لاحق: اختيار عنقود جديد معزول أو فحص هوية/المسار والمنفذ والمالك قبل أي تشغيل يكتب/يحذف. لا دليل أن `alsqaya_staging` على منفذ 5433 معرضة لهذا المسار، ولم تُمس.

### AUD-09-04 — حماية `down` مقيدة بالـCLI لا بدالة `rollbackMigrations` (P2 / حدود وصول API داخلي)

**SOURCE_CONFIRMED / MISUSE_NOT_REPRODUCED.**  
`server/src/database/cli.ts:57–70` يمنع التراجع عند `NODE_ENV=production` ويطلب تأكيدًا، لكن `migrations.ts:226–280` يتيح `rollbackMigrations(pool,steps)` لأي Pool يمرره كود مستدعي مباشرة؛ لا يفحص `NODE_ENV` أو هوية قاعدة الهدف. وحتى CLI قد يعمل بـ`NODE_ENV` محلي بينما رابط الاتصال يشير إلى قاعدة مؤسسة. هذا ليس Endpoint عامًا أو اختراقًا مثبتًا، لكنه **شرط سلامة**: عدم منح أي سكربت إذن التراجع قبل التحقق المستقل من الهدف والنسخ الاحتياطي واعتماد المالك. التراجع الذري يحمي من الفشل الجزئي، **لا يحمي بيانات تحذف عمدًا بعبارات DOWN ناجحة**.

### AUD-09-05 — ترحيلات 0016/0017 وحفظ تاريخ فتح الكتب (إحالة إلى ملاحظات قائمة)

**CROSSREF `AUD-01-04`, `AUD-15-07` / HOST_PENDING.**  
مرشح PR68 المنفرد يحوي 15 ترحيلًا؛ ترحيل `0016` في PR60 يتوقف بأمان عند تكرارات روابط الدور NULL القديمة، وهو يحتاج preflight معزولًا. أما `0017` المرشح بعلامة فتح «جديد» في Phase15 فتراجعُه قد يزيل تاريخ العلامة. نجاح atomic rollback في Phase9 **لا يضمن** عدم فقدان تاريخ أزالته أوامر Down صحيحة. عند بدء الإصلاحات فقط: اختبار 0016/0017 على نسخ اصطناعية مع خطة رجوع ونسخة احتياطية. لا إصلاح مكرر ولا تشغيل على المضيف.

## 4. الحكم والخطوة التالية

**`PHASE09_REVIEWED_WITH_FINDINGS / FIXES_DEFERRED / RELEASE_NO_GO`.** تم التحقق من متانة الترحيلات والتراجع على الأدلة الاصطناعية السابقة، مع تسجيل خمس ملاحظات تخص الأمان التشغيلي والقراءة والتكامل. لم يُعد إنتاج عطل فساد قاعدة بيانات حقيقية خلال هذا الفحص.

**التالي:** Phase10 — API Data Layer على [Draft PR #69](https://github.com/daboolgame123-creator/Saqa/pull/69)، SHA `a3f3fa6e50e201047a6597a792b3454f7e6b17bc`؛ مراجعة عقد HTTP، عزل الجلسات، التحقق من المدخلات والصلاحيات وDTO، مع توثيق الملاحظات فقط.
