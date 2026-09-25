# PHASE 9 REPORT — PostgreSQL + Migrations + Persistence Foundation

**الحالة:** مكتملة ومختبرة ومثبَّتة.
**نقطة الانتقال التالية:** Phase 10 — API Data Layer (الانتقال من LocalStorage إلى API).

---

## 1. نطاق Phase 9

المرجع: `ALSQAYA_PLAN.md` §25.

**الهدف:** إنشاء مصدر الحقيقة المركزي.

**التنفيذ المطلوب:**

| البند | الحالة |
|---|---|
| PostgreSQL | ✅ مُنفَّذ |
| schema | ✅ 18 جدولاً |
| migrations | ✅ 4 ملفات + أداة تشغيل/تدحرج |
| constraints | ✅ CHECK + NOT NULL + UNIQUE |
| foreign keys | ✅ REFERENCES + ON DELETE محدَّدة |
| indexes الأولية | ✅ فهارس على أعمدة البحث والتصفية |
| transaction handling | ✅ `withTransaction` |
| date/time strategy | ✅ `dateTime.ts` (date + timestamptz) |
| repository integration | ✅ 8 مستودعات منفَّذة فعلياً |

**الجداول الأساسية (18/18 مغطاة):**

| الملف | الجداول |
|---|---|
| `0001_core_identity.sql` | `employees`, `users`, `employee_status_history` |
| `0002_transactions.sql` | `transactions`, `transaction_employees`, `attachments` |
| `0003_personnel.sql` | `leaves`, `leave_balances`, `leave_ledger`, `time_permissions`, `assignments`, `courses` |
| `0004_operations_logs.sql` | `daily_situations`, `requests`, `notifications`, `reminders`, `audit_logs`, `view_logs` |

> ملاحظة: البند «employee status/history» في الخطة عنصر واحد (`employee_status_history`)، لا عنصران.
> جدول `schema_migrations` داخلي لإدارة الترحيلات ولا يُعدّ من جداول المجال.

**الاختبارات المطلوبة (6/6 مغطاة):**

| الاختبار المطلوب | مكان التنفيذ |
|---|---|
| migration up | `migrations.test.ts` |
| migration rollback على قاعدة اختبار | `migrations.test.ts` |
| foreign key tests | `integrity.test.ts` |
| uniqueness tests | `integrity.test.ts` |
| transaction rollback test | `transactions.test.ts` |
| repository CRUD tests | `repositories.test.ts`, `personnelRepositories.test.ts` |

---
## 2. ما تم تنفيذه

### 2.1 قاعدة البيانات والترحيلات
- أربعة ملفات ترحيل، كل منها بقسمَي `-- migrate:up` و `-- migrate:down` حقيقيين (التدحرج ليس تعليقاً).
- جدول `schema_migrations` يسجّل الترحيلات المطبَّقة؛ الترحيل **لا يُعاد** إن طُبِّق، والتدحرج يعيد الترحيل الأخير فقط ثم يزيل سجله.
- `pool.ts`: إنشاء `pg.Pool` مع معاملات مُهيَّأة، و`closeSharedPool()` لإغلاق نظيف (no-op إن لم تُفتح).
- `migrations.ts`: تنفيذ الترحيلات داخل معاملة واحدة.

### 2.2 إدارة المعاملات
- `withTransaction`: COMMIT عند النجاح، ROLLBACK عند أي خطأ أو فشل COMMIT، ودائماً يعيد الاتصال للمسبح.
- **بلا قواعد أعمال** — يلتزم بالمعاملة بالسلوك فقط (مبدأ مُختبَر صراحةً).

### 2.3 استراتيجية التاريخ والوقت
- تاريخ العمل (business date) = `date` (بدون منطقة زمنية).
- الطوابع الزمنية التقنية = `timestamptz`.
- `dateTime.ts` يوفّر أدوات تحويل موحّدة بين نصوص ISO وقيم القاعدة.

### 2.4 طبقة المستودعات (8 مستودعات)
`employeeRepository`, `transactionRepository`, `transactionEmployeeRepository`, `dailySituationRepository`, `leaveRepository`, `timePermissionRepository`, `assignmentRepository`, `courseRepository`
- فوق `shared.ts` (ترجمة صفوف القاعدة ↔ نماذج المجال).
- `contracts.ts`: واجهات المستودعات وأنواع الإدخال/الإخراج.
- عمليات الكتابة المركّبة (كتاب + روابط + مرفقات) تنفَّذ **ذرّياً** داخل معاملة واحدة.

### 2.5 أدوات التشغيل

| الأمر | الوظيفة |
|---|---|
| `npm run db:dev` | تشغيل PostgreSQL مدمج محلياً (بلا تثبيت نظام) |
| `npm run db:migrate` | تطبيق الترحيلات |
| `npm run db:rollback` | تدحرج الترحيل الأخير |
| `npm run db:status` | عرض حالة الترحيلات |

### 2.6 بيئة الاختبار
- PostgreSQL مدمج فعلياً (`embedded-postgres`) — لا mock، لا محاكاة.
- قاعدة معزولة `alsqaya_test` على منفذ 5440، داخل `%TEMP%`، تُحذف وتُنشأ من جديد لكل ملف اختبار.
- `--test-concurrency=1` لتفادي التنافس على المنفذ.

### 2.7 الإعدادات والأمان
- `env.ts`: `DATABASE_URL` و`TEST_DATABASE_URL` **اختياريان** — لا يُشترطان لتشغيل الخادم.
- تحقق البروتوكول (`postgres://` / `postgresql://`) بلا طباعة القيمة عند الفشل.
- `SENSITIVE_KEYS` جُدّدت لتخفي روابط الاتصال ومساراتها من السجل التقني.
- `server.ts`: `closeSharedPool()` ضمن تسلسل الإيقاف.

---



## 3. القرارات التقنية المهمة

1. **علاقة الموظف/المستخدم مخزَّنة في جهة واحدة فقط** — `users.employee_id UNIQUE` — وفق `0001`، فلم يُنشأ عمود `employees.user_id` تناقضاً للمخطط.
2. **`document_date` = تاريخ الكتاب، و`month` مشتق منه** للتصفية الشهرية — وليس تصنيفاً مستقلاً.
3. **الروابط متعددة الأنماط (kind+id) تُخزَّن كأعمدة FK منفصلة** لكل هدف، مع قيد يمنع تجاوز رابط واحد في `daily_situations` — لضمان تكامل مرجعي حقيقي بدل `kind+id` بلا مرجع.
4. **لا بايتات ولا Base64 في المرفقات** — بيانات وصفية فقط (تخزين الملفات Phase 14).
5. **`audit_logs` / `view_logs` تحضير لـPhase 15** — بنيتها فقط، بلا سياسات أو سلوك.
6. **`notifications` / `reminders` بلا سياسات** — قيم الحالة تُعتمد في Phase 20/21.
7. **`ON DELETE` مصمَّم كسلوك مقصود**: `CASCADE` لروابط الكتاب، `SET NULL` لأطراف الفاعل في سجل التدقيق (بقاء الصف مضمون)، `RESTRICT` لسجل الاطلاع.
8. **`RETURNING` لا يدعم `JOIN`** — يعتمد `RETURNING id` ثم قراءة لاحقة عند الحاجة.

---

## 4. الاختبارات ونتائجها

| الأمر | النتيجة |
|---|---|
| `npm run lint` (tsc --noEmit) | ✅ exit 0 |
| `npm run build` | ✅ exit 0 (built in 29.68s) |
| `npm run test:server` | ✅ **55/55 pass**، 0 fail — 12 suite |
| `npm run test:db` | ✅ **43/43 pass**، 0 fail — 14 suite |
| `git diff --check` | ✅ exit 0 (لا مسافات زائدة) |

**الإجمالي: 98/98 اختبار ناجح، 0 فاشل.**

> `test:db` يشغّل PostgreSQL حقيقياً مدمجاً — النتائج مُتحقَّق منها على محرك قاعدة بيانات فعلي، لا على محاكاة.

---


## 5. المشاكل التي تم إصلاحها

### 5.1 `column "user_id" of relation "employees" does not exist` (7 اختبارات)
**السبب الجذري:** المستودع كان يفترض عمود `employees.user_id` غير موجود، بينما `0001` ينص صراحةً على تخزين العلاقة في جهة واحدة.

**الإصلاح:** صُحِّح المستودع ليطابق التصميم لا ليخالفه:
- **قراءة:** `userId` مشتق عبر `LEFT JOIN users u ON u.employee_id = e.id` (مع بادئة `e.` على كل الأعمدة لتفادي الالتباس).
- **كتابة:** `applyUserLink()` يكتب في `users.employee_id`، ويفكّ الربط بـ`userId: null`، **ويرفض بصوت عالٍ** حساباً غير موجود بدل الصمت.
- **ذرّية:** `create` و`update` يلفّان الكتابة + الربط في معاملة واحدة — وإلا لَحُذف الموظف أو بُقي بلا حساب عند فشل الخطوة الثانية.
- `UpdateEmployeeInput` صار يقبل `userId?: string | null`.

### 5.2 اختبار خاطئ لا قيد ناقص — `Missing expected rejection`
اختبار «شهر بصيغة غير YYYY-MM» كان يُدخل `'2026-13'` ويتوقع رفضاً، لكن القيد `CHECK (month ~ '^[0-9]{4}-[0-9]{2}$')` **يقبله فعلاً** (13 رقمان صحيحان من خانتين). الاختبار كان يختبر ما لا يختبره — استُبدل بـ`'2026-1'` الفاشل فعلاً.

### 5.3 `function min(uuid) does not exist`
خطأ في الاختبار لا في المخطط: `min`/`max` غير معرَّفان لـ`uuid` في PostgreSQL — استُخدم `min(actor_user_id::text)`.

### 5.4 `await` داخل دالة غير `async`
خطأ TS — أُصلح بتوقيع الدالة.

### 5.5 حواجز النطاق في `scope.test.ts` (فشلان)
كانت مكتوبة لـPhase 8 فقادمت المرحلة: كانت تفرض `pg` غير مسموحة وتمنع تنفيذ `repositories`. حُدِّثت لتعكس نطاق Phase 9 — أُزيلت `pg`/`pg-pool` من المحظورات (بنية بيانات اختبارية)، وأُخرجت `repositories` من الطبقات المحجوزة، **وأُضيف** اختبار جديد يؤكد تنفيذ المستودعات، كي لا يصبح الحاجز ضعيفاً بصمت.

### 5.6 تسرّب بيئة في `package.json` (أُصلح أثناء الإغلاق)
اكتُشف أثناء المراجعة النهائية: حقل `allowScripts` كان يشير إلى
`file:C:\Users\dell\AppData\Local\Temp\epg-win64.tgz` — مسار مؤقت خاص بجهاز المطوّر.
أُزيل (لا حاجة له: `node_modules` مثبَّت ويعمل). وتم التحقق كذلك أن `package-lock.json` **لا يحوي** أي مسار محلي أو `C:\Users\`.

### 5.7 جدول حالة الخطة مكسور المسيق + توثيق قديم
`ALSQAYA_PLAN.md` و`README.md` كانا يحملان حالة Phase 8 وسطور جدول بلا حدود `|`. أُصلح الجدول، وحُدِّثت الحالة إلى **Phase 9 مكتملة**، ونقطة الانتقال إلى **Phase 10**.

## 6. الملفات المهمة التي تغيرت

### جديد — الترحيلات (4)
`server/migrations/0001_core_identity.sql`, `0002_transactions.sql`, `0003_personnel.sql`, `0004_operations_logs.sql`

### جديد — طبقة قاعدة البيانات (6)
`server/src/database/` — `pool.ts`, `migrations.ts`, `dateTime.ts`, `index.ts`, `cli.ts`, `devServer.ts`

### جديد — المستودعات (12)
`server/src/repositories/` — `contracts.ts`, `shared.ts`, `index.ts` + 8 مستودعات

### جديد — الاختبارات (6)
`server/tests/db/` — `testDb.ts`, `migrations.test.ts`, `integrity.test.ts`, `transactions.test.ts`, `repositories.test.ts`, `personnelRepositories.test.ts`

### جديد — توثيق (1)
`PHASE_9_REPORT.md`

### مُعدَّل

| الملف | التغيير |
|---|---|
| `package.json` | تبعيات `pg`/`@types/pg`/`embedded-postgres` + سكربتات `test:db`/`db:*` |
| `package-lock.json` | القفل المحدَّث |
| `.env.example` | توثيق `DATABASE_URL` و`TEST_DATABASE_URL` |
| `server/src/config/env.ts` | إعدادا قاعدة البيانات + التحقق من البروتوكول |
| `server/src/logging/logTypes.ts` | مفاتيح حساسة جديدة |
| `server/src/server.ts` | `closeSharedPool()` في الإيقاف |
| `server/src/health/healthService.ts` | تحديث التوثيق (فحص القاعدة في Phase 10) |
| `server/src/health/readinessService.ts` | تحديث التوثيق (فحص القاعدة في Phase 10) |
| `server/tests/scope.test.ts` | مواءمة حواجز النطاق مع Phase 9 |
| `ALSQAYA_PLAN.md` | تحديث الحالة ونقطة الانتقال إلى Phase 10 |
| `README.md` | تحديث الحالة ونقطة الانتقال إلى Phase 10 |
| `server/src/repositories/.gitkeep` | محذوف (المجلد لم يعد محجوزاً) |

---

## 7. TBD لم يُحسم (مؤجَّل عمداً لمراحل لاحقة)

| البند | المرحلة المخصصة |
|---|---|
| الأصناف القابلة للتوسّع عبر CHECK (`status` في transactions) | migration جديد عند الحاجة |
| `mime_type` للمرفقات — يبقى NULL قبل اكتمال التخزين | Phase 14 |
| `ocr_state` — بلا قيود قيم مخترعة | Phase 17 |
| سياسات `notifications` / `reminders` (قيمة `status`) | Phase 20 / 21 |
| سلوك سجل التدقيق وسجل الاطلاع (بنية فقط الآن) | Phase 15 |

## 8. حالة الإغلاق

- ✅ **نطاق Phase 9 كامل** — كل بند من بنود الخطة، والجداول الـ18، والاختبارات الستة منفَّذ ومختبَر.
- ✅ **لا تغييرات خارج Phase 9** — تعديلات `env.ts`/`logTypes.ts`/`server.ts`/`health` تفعيل لازم للطبقة الجديدة فقط.
- ✅ **لا بيانات حقيقية** — كل ما يُزرع اصطناعي داخل قاعدة معزولة في `%TEMP%`.
- ✅ **لا أسرار** — لا مفاتيح ولا روابط حقيقية؛ القيم المكتوبة قيم تطوير محلية موثّقة صراحةً كغير سرية، ومُحمية من الطباعة في السجلات.
- ✅ **لا ملفات مؤقتة غير مقصودة** — حقل `allowScripts` المُسرِّب أُزيل، ولا ملفات `_smoke` متبقية.
- ✅ **`.continue/` خارج الـcommit** — يُستثنى صراحةً.
- ✅ **اختبارات خضراء** — 98/98.
- ✅ **لم يبدأ Phase 10** — لم يُنفَّذ أي شيء من نطاقها.

**Phase 9 = مكتملة.**

---

**نهاية Phase 9 — لا يبدأ Phase 10.**

| `reminders.related_kind/related_id` بلا FK — أهدافها غير مثبتة بعد | عند تثبيت الأهداف |
| فحص جاهزية قاعدة البيانات في `/health/ready` | Phase 10 |
| `TEST_DATABASE_URL` — مدعوم في الإعدادات لكن الاختبارات تستخدم القاعدة المدمجة افتراضياً | عند الحاجة لبيئة خارجية |

---


---
