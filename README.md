# السقاية — نظام إدارة الذاتية والأرشفة والتوثيق الإداري

نظام إداري وأرشيفي رقمي داخلي لشعبة الذاتية، يهدف إلى تنظيم الكتب والوثائق وبيانات المنتسبين والباحثين والسجلات الزمنية والطلبات والمتابعة والتقارير، مع صلاحيات ونطاق وصول وسجلات تدقيق واطلاع.

## الحالة الحالية

تم تنفيذ واختبار:

- Phase 0 — Baseline.
- Phase 1 — Domain Models.
- Phase 2 — Personnel Domain & Services.
- Phase 3 — Employee Profile.
- Phase 4 — Transaction Domain.
- Phase 5 — Transaction–Employee Relations.
- Phase 6 — Daily Situation.
- Phase 7 — Timeline.
- Phase 8 — Backend Foundation.
- Phase 9 — PostgreSQL + Migrations + Persistence Foundation.
- Phase 10 — API Data Layer.
- Phase 11 — Authentication / الحسابات / الجلسات.
- Phase 12 — RBAC / الصلاحيات.
- Phase 13 — Access Scope + Book Availability.
- Phase 14 — Attachments & Central File Storage.
- Phase 15 — Audit Log + View/Acknowledgement Logs.
- Phase 16 — Soft Delete + Data Integrity.
- Phase 17 — Concurrency Control.
- Phase 18 — Personnel Rules Engine: Leaves + Time Permissions.
- Phase 19 — Requests + Workflow.
- Phase 20 — Archive Domain Server: Books, Relations, Circulars.
- Phase 21 — Notifications + Reminders Engine.

**المرحلة التالية:** Phase 22 — OCR + Unified Search.

## المرجع الرئيسي

`ALSQAYA_PLAN.md`

هذه الوثيقة تحتوي على الخطة التفصيلية، قواعد الأعمال، النطاق المحدد لكل مرحلة، الاختبارات، ومعايير الإغلاق.

   الوثائق المساندة:

- `Architecture.md` — المعمارية.
- `PROJECT_RULES_V2.md` — قواعد التطوير.
- `PROJECT_VISION.md` — الرؤية.
- `docs/` — تقارير ووثائق تاريخية أو مساندة.

## المعمارية المستهدفة

```text
React Client
   ↓
REST API
   ↓
Node.js + Express + TypeScript
   ↓
PostgreSQL + Central File Storage
```

ويضاف إليها Authentication وRBAC وAccess Scope وAudit/View Logs وBackground Jobs وBackup/Restore وMonitoring.

## الوضع الحالي

منذ **Phase 10** صارت الواجهة تقرأ وتكتب عبر **REST API** إلى PostgreSQL بدل `localStorage`.
يبقى `localStorage` للوضع الليلي فقط، وكـ`Local Adapter` اختياري للتطوير بلا خادم
(`VITE_DATA_SOURCE=local`).

منذ **Phase 11** يفرض الخادم **الجلسة** على كل مسارات `/api/*` عدا مسارات المصادقة
نفسها: تسجيل حساب برقم الباج + الهاتف عبر OTP، ثم دخول، ثم جلسات بخمول 30 دقيقة.

منذ **Phase 12** يفرض الخادم **الصلاحيات (RBAC)** فوق الجلسة: مصفوفة الأدوار
`admin/responsible Saqa · director · employee` من `ALSQAYA_PLAN.md` §10 و§28
تُطبَّق في طبقة `server/src/authorization` قبل أي controller — موارد `/api/*`
تفحص عائلة الصلاحية المقابلة لـHTTP method، ومسارا إعادة الضبط وكشف الرمز
يطلبان `manage accounts` و`manage security`. الرفض **403 `PERMISSION_DENIED`**
لصاحب الجلسة بلا صلاحية، و**401** لمن بلا جلسة. لا تُفرض صلاحيات في React:
إخفاء زر ليس حاجزاً أمنياً (§28).

منذ **Phase 13** يُفرَض **نطاق الرؤية (Access Scope)** فوق الصلاحية، فالفصل
`Identity → Permission → Access Scope → Resource` مطبَّق فعلياً: الصلاحية تسمح
بالعملية، والنطاق يقرر أي سجل منها يُقرأ. تصفية النطاق تتم على مستوى استعلام
SQL لا بعد قراءة البيانات، والنطاقات المعتمدة (§12) هي `PublicToEmployees` ·
`SpecificEmployees` · `Administrative` · `DirectorOnly`. القواعد: المسؤول والمدير
يريان كل النطاقات، والمنتسب يرى الأعمام العامة (`PublicToEmployees`) وما
أُتيح له صراحة في جدول `transaction_availability`، وأي دور غير معتمد
fail-closed فلا يرى شيئاً. **الكتاب المحجوب يُرجع 404 لا 403** (حجب وجود يمنع
استنتاج وجود وثيقة حساسة). وفصل «إتاحة الكتاب» جدول مستقل عن جدول الربط:
المنح، المنح الجماعي للمرتبطين، السحب الذي يحفظ التاريخ بلا حذف، والفحص
الإداري — بأربعة مسارات كلها تتطلب `manage_availability` وهي **للمسؤول وحده**
(المدير لا يدير حالة الإتاحة، §9.5). التطبيق يشمل الخط الزمني وقوائم الروابط
حتى لا يتسرّب عنوان كتاب محجوب عبر مدخل مشتق. التفاصيل في
`PHASE_13_REPORT.md`.

⚠️ **أثر تشغيلي مباشر:** الواجهة التي تقرأ عبر API ستُرفض بـ`401` حتى تُضاف شاشة
دخول ترسل الجلسة. استخدم `VITE_DATA_SOURCE=local` للتطوير بلا خادم حتى ذلك الحين.

### محرّك قواعد الإجازات والزمنيات (Phase 18)

منذ **Phase 18** صار رصيد الإجازة **محسوباً على الخادم** في
`server/src/services/personnelRules.ts`، وطبقة `services/` لم تعد محجوزة:

```text
Service Records → Accrual Engine → Leave Balance → Leave Ledger
Time Permission → Minutes Engine → 420 minutes → Emergency Conversion → Emergency Balance
```

- **لا حساب رصيد في React.** لا `if minutes >= 420` ولا `if balance > …` في أي
  component؛ حارس بنيوي في `server/tests/scope.test.ts` يفحص مجلد `src/`
  كاملاً ويمنع تكرار ثوابت §14 فيه. الواجهة تقرأ ناتج المحرّك فقط.
- **لا تغيير رصيد بلا حركة** (§15): كل كتابة داخل `withTransaction` واحدة مع صف
  في `leave_ledger`. الإلغاء ينشئ حركة عكسية **مرتبطة** بـ
  `reverses_ledger_id` ولا يحذف ولا يمحو. طريقتا الكتابة الوحيدتان هما
  نقطة البداية الافتتاحية والتصحيح الإداري الموثّق.
- **المدة بالدقائق محسوبة ومخزَّنة** (§14.3) في `time_permissions.duration_minutes`،
  ويحسبها المحرّك من `timeOut`/`timeIn` — فلا تُرسل من العميل (`400`) ولا تُشتق
  في مكانين.
- **تجاوز 4 ساعات أسبوعياً** (§14.4) مؤشر `exceedsWeeklyLimit` في الاستجابة
  فقط: **لا يمنع التسجيل ولا يحذف البيانات**، وهو مطلب صريح في النص.
- **قرارات لم تحسمها الخطة لم تُخترع لها سلوك** (§56): الاستحقاق فوق 180 محفوظ
  في `annual_pending_days` كحالة صريحة، وشرائح المرضية دالة خالصة بلا فترة
  قياس ولا `reset` تلقائي، والإجازة بدون راتب عدّاد بلا سقف. التفاصيل في
  `PHASE_18_REPORT.md` §5.
- المسارات: `GET/POST /api/leave-balances` · `GET /api/leave-ledger` ·
  `POST /api/leaves/:id/cancel` — على الصلاحيات القائمة (§28) بلا دور جديد.

### الطلبات وسير الموافقة (Phase 19)

صارت الطلبات كياناً حقيقياً على الخادم في
`server/src/services/requestWorkflow.ts` (جدول الانتقالات) مع
`server/src/repositories/requestRepository.ts` وجدول `request_status_history`:

```text
Request → draft → submitted → (approve | reject | request_clarification)
        → (employee_reply) → approved / rejected / cancelled
```

- **الحالات السبع** في §35 بالضبط. `under_review` معتمدة في النصّ لكن **لا
  عملية معتمدة تُنتجها** فلم يُخترع لها مسار (TBD موثّق في
  `PHASE_19_REPORT.md` §5).
- **لا حالة من العميل**: مُحقِّق الإنشاء يرفض حقل `status` كحقل مجهول؛ الحالة
  نتاج عمليات الخادم فقط، والانتقال غير المسموح منه يرفضه الخادم بـ409
  `REQUEST_TRANSITION_NOT_ALLOWED` قبل أي كتابة.
- **قرار المدير ≠ CRUD**: `approve` · `reject` · `request_clarification` تحتاج
  `approve_request` صراحةً على `POST /api/requests/:id/workflow` (§10.2 · §28)،
  بينما `admin` لا يستطيع اعتماداً و`director` لا يستطيع إنشاء أو تعديل موظف.
- **قفل تفاؤلي (Phase 17)**: كل كتابة على طلب قابلة بـ`expectedVersion`
  إلزامية؛ النسخة القديمة ⇒ 409 `VERSION_CONFLICT` بلا كتابة فوق الأحدث.
- **بلا حذف (§32)**: الإلغاء انتقالٌ إلى `cancelled`، والصفّ وسجلّ تاريخه
  يبقيان.
- **قرارات لم تحسمها الخطة لم تُخترع لها سلوك** (§56): لا إنشاء
  Leave/TimePermission عند الاعتماد، ولا عكس رصيد عند الإلغاء، وصلاحية
  صاحب الطلب للتسليم والردّ ما زالت **TBD** (فهي اليوم على خريطة §28
  القائمة). التفاصيل في `PHASE_19_REPORT.md` §5.
- المسارات: `GET /api/requests` · `GET /api/requests/:id` · `POST /api/requests`
  · `PATCH /api/requests/:id` · `POST /api/requests/:id/workflow` — بلا
  `DELETE`.

### نطاق الكتب على الخادم (Phase 20)

أُغلقت فجوات §36 فقط؛ بنية الكتب القائمة (Phases 4/5/10/13/14/16/17)
**لم تُعَد بناؤها**:

- **الكتب المرتبطة** كيان حقيقي: جدول `transaction_relations` ب**مفتاحين
  أجنبيين** على `transactions` (`RESTRICT` على الطرفين). العلاقة
  **موجّهة** — صف `A → B` يعني «كتاب A يشير إلى كتاب B» — وتخدم
  one-to-many وmany-to-many معاً. بلا نص رابط ولا JSON ولا اسم كتاب.
  - **النطاق مطبَّق على الطرفين**: كتاب مرئي + كتاب محجوب ⇒ لا يُعاد
    صفّ ارتباط. **العلاقة لا تفتح باباً لتجاوز `Access Scope`**.
  - `A → A` ممنوع (CHECK) و`A → B` مرتين ممنوع (UNIQUE)؛ و**A → B → A
    مسموحة** لأن العلاقة إحالة أرشيفية لا شجرة تصنيف (والخريطة لم تطلب
    DAG).
  - **بلا `relationshipType`** — نصّ الخطة لا يحدّد أنواعاً (TBD).
- **انتقال الحالة** عملية مستقلة: `POST /api/transactions/:id/status`
  بقفل `expectedVersion` إلزامي، وحدث تدقيق `status_change` بالقيمة
  قبل/بعد. الحالتان المعتمدتان فقط، و**اتجاه الانتقال TBD** (§8.1).
- **Duplicate Detection تحذير لا منع**: حقل `duplicateWarning` في استجابة
  `POST /api/transactions` (الرمز **يبقى 201**) يذكر الأسباب الخمسة
  (العدد الرسمي · التاريخ · الجهة · الموضوع · بصمة الملف عند توفّرها).
  **لا يمنع الإدخال ولا يحذف ولا يعدّل ولا يختار «صحيحاً» بالاجتهاد**.
- **الإعمام** بلا كيان `Circular`: إعمام عام = كتاب **وارد** +
  `visibility: 'PublicToEmployees'` (§9.1) — نموذج قائم منذ Phase 13.
- **علم الاستيراد التاريخي** = `imported_at` القائم (المكافئ المعتمد
  لـ`historicalImport` في §37). **لا حقل ثانٍ**.
- **لا Role ولا Permission ولا `AuditEventKind` جديد**؛ وسدّت الفجوة
  بأن إنشاء الكتاب وتعديله صارا يُكتبان في سجل التدقيق (§31).
- المسارات: `GET/POST /api/transactions/:id/relations` ·
  `DELETE /api/transactions/:id/relations/:relationId` ·
  `POST /api/transactions/:id/status` — على الصلاحيات القائمة (§28).

### الإشعارات والتذكيرات على الخادم (Phase 21)

أُغلقت **طبقة الخادم** لـ§37 فقط؛ الواجهة (جرس · مركز إشعارات · قائمة
تذكيرات) هي **UI-08**، وهي مرحلة واجهة مستقلة. و**جدولا
`notifications` و`reminders` لم يُمسّا**: بقيا كما أنشأهما الترحيل 0004،
ولم يُضف جدول بديل ولا عمود يُعيد فكرة قائمة؛ وكل ما بُني هو ما **فوق**
الجدولين (مستودع · خدمة · محرّك أحداث · API · وظيفة مجدولة).

- **نموذج الإشعار** (`src/core/models/notification.ts`): الأنواع الستة =
  مرآة قيد CHECK في `notifications`، وحارس اختبار يمنع انفصالهما. والحمولة
  تحمل **مرجعاً** (`resourceKind` + `resourceId`) وخلاصة قصيرة — **لا نسخة
  من المورد** (§37).
- **الفصل بين «جديد» والتاريخ** (§20): `is_new` و`read_at` حالتان منفصلتان،
  وتعليم المقروء `COALESCE(read_at, now())` **idempotent** — الصف لا يُحذف
  ولا يتغير وقت قراءته عند التكرار.
- **الملكية في SQL لا بعده**: كل قراءة/تعليم مقيَّد بـ`user_id` من
  `req.auth` حصراً. و`?userId=` **مرفوض 400** كحقل غير معروف، وإشعار غيرك
  = **404** (حجب وجود) لا 403. ولا مسار إنشاء إشعار من الـAPI — الإنشاء من
  الحدث وحده، فمَن قبل POST لأصنع إشعاراً لأحد.
- **الأحداث المسنودة فقط** (§20 + §9.1 + §9.3 + §18): `book_available`
  (إتاحة كتاب) · `new_broadcast` (وارد + `PublicToEmployees`) ·
  `new_request` (إرسال الطلب ← المدير) · `request_update` (قرار المدير ←
  صاحب الطلب) · `due_reminder` (تذكير مستحق). **ولا إشعار لكل UPDATE**،
  و**`important_change` بلا مُولِّد** لأن نصّ الخطة لا يعرّف ما التغيّر
  «المهم» ولا لمن يُرسَل (TBD).
- **حارس الاستيراد التاريخي** (§37): `importedAt` (= `imported_at`
  القائم) يمرّ صريحاً إلى محرّك الأحداث، وهو **لا يكتب صفاً** عند `true` —
  لا «نُنشئ ثم نُخفي» ولا «نُنشئ ثم نحذف».
- **الوظيفة المجدولة**: `reminder-dispatcher` مسجَّلة في `JobRegistry`
  القائم (Phase 8) بفاصل دقيقة — **بلا Redis ولا طابور ولا مُجدول ثانٍ**.
  والاستحقاق يُقارَن **كزوج** `(remind_on, remind_at)`، والتذكير المعطَّل أو
  المعالَج لا يُقرأ أصلاً.
- **`processed_at` حاجز تكرار تقني** (§19) لا قاعدة أعمال: يُكتب في **نفس
  معاملة** الإشعار (فلا «إشعار بلا معالجة» ولا «معالجة بلا إشعار»)، وشرطه
  `IS NULL` داخل `UPDATE` يمنع الإشعار المزدوج من تشغيلين متزامنين. وهو
  **لا** يعني «إشعاراً واحداً إلى الأبد» — تلك قاعدة لم تثبتها الخطة.
- **بلا `DELETE`** للإشعارات ولا للتذكيرات؛ وبلا `Role` ولا `Permission`
  جديدة: `GET ← view` · `POST ← create` · `PATCH ← update` من خريطة §28،
  وباستثناء واحد `POST /:id/read` بعائلة `view` — **نفس استثناء «اطلعت»**
  لأنه تغيّر حالة صفٍّ يخصّ صاحبه (المنتسب `view` فقط).
- المسارات: `GET /api/notifications` · `GET /api/notifications/unread-count`
  · `GET /api/notifications/:id` · `POST /api/notifications/:id/read` ·
  `GET /api/reminders` · `GET /api/reminders/:id` ·
  `POST /api/reminders` · `PATCH /api/reminders/:id`.
- **Business Rule TBD**: مستلمّ `due_reminder` لتذكير **عام** (بلا مورد
  مرتبط، أو مربوطاً بكتاب) غير محدَّد في الخطة، فلا يُنشأ له إشعار ولا
  تُكتب `processed_at`. والتفصيل في `PHASE_21_REPORT.md` §5.

### إعداد المصادقة

```bash
# 32 بايت بترميز base64 — مفتاح تشفير الرموز السرية (§11.8).
# مطلوب في الإنتاج (الخادم لا يقلع بدونه)؛ إن لم يُضبط خارج الإنتاج
# يُولَّد مفتاح عابر لعملية واحدة مع تحذير في السجل التقني.
AUTH_SECRET_KEY=
```

مفتاح تشفير الرموز السرية لا يُخزَّن في قاعدة البيانات إطلاقاً، ولا في أي جدول.
يُخزَّن الرمز السري مشفّراً (AES-256-GCM)، وتُخزَّن رفعة الجلسة مجزّأةً (SHA-256).

## منهج التنفيذ

كل مرحلة تُنفذ منفصلة، ثم تُختبر وتُراجع وتُثبت في Git قبل الانتقال إلى المرحلة التالية.

Cline لا يجوز له اختراع قاعدة عمل أو تنفيذ مرحلة مستقبلية، ويجب عليه اعتبار `TBD` قرارًا غير محسوم وليس إذنًا للاجتهاد.

## التشغيل المحلي الحالي

### الواجهة والـBackend

```bash
npm install
npm run db:dev        # PostgreSQL مدمج محلياً (منفذ 5433)
npm run db:migrate    # تطبيق الترحيلات
npm run server:dev    # الـBackend (منفذ 4000)
npm run dev           # الواجهة (منفذ 3000)
```

> العنقود يجب أن يكون بترميز **UTF8**. لو نُشئ بلغة النظام (WIN1256 على جهاز عربي)
> سيرفض حفظ الأرقام العربية الهندية في أرقام الكتب.

### الفحص والاختبار

```bash
npm run lint          # TypeScript
npm run build
npm run test:server   # اختبارات الـBackend العامة
npm run test:db       # اختبارات المستودعات على قاعدة مدمجة
npm run test:api      # اختبارات طبقة الـAPI (خادم + واجهة)
npm run test:all      # الثلاث معاً
```

استخدم بيانات اختبار فقط أثناء التطوير. لا تدخل بيانات العمل الحقيقية قبل اكتمال متطلبات المصادقة والصلاحيات والتدقيق والنسخ الاحتياطي والترحيل وفق الخطة.
