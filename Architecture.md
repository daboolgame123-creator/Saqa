# Architecture — معمارية نظام السقاية

**الحالة:** معمارية معتمدة بعد مزامنة الخطة في 2026-10-1، ومحدَّثة بعد Phase 19.

## 1. الوضع الفعلي الحالي

المشروع أكمل Phase 0 إلى Phase 19.

Phase 7 نفذت Timeline كطبقة مشتقة من السجلات الأصلية، ولا يوجد جدول Timeline مستقل يكرر البيانات.

**ما أضافته Phase 19 معمارياً:** **آلة حالات الطلبات** في
`server/src/services/requestWorkflow.ts` — جدول انتقالات صريح واحد للحالات
السبع في §35 — و**نطاق قراءة الطلبات** في
`server/src/authorization/requestScope.ts`، وجدول `request_status_history`
(«تاريخ التغييرات» في §18). التفاصيل في §5.4.

**ما أضافته Phase 18 معمارياً:** طبقة `services/` منفصلة على الخادم تحمل
**محرّك قواعد الإجازات والزمنيات** (§34) — Accrual Engine وMinutes Engine،
فوق `repositories/` وتحت `api/`. المحرك **لا يعرف React ولا
`localStorage` ولا مكوّنات العرض**؛ الواجهة تقرأ ناتجه فقط. التفاصيل في §5.3.

**ما أضافته Phase 12 معمارياً:** طبقة `authorization` مستقلة على الخادم، وفرض الصلاحيات (RBAC) كوسيط بعد الهوية وقبل الـcontrollers. التفاصيل في §5.2.

## 2. المعمارية المستهدفة

```text
Windows / Browser / Mobile
          │
          ▼
     React Client
          │
          ▼
      REST API
          │
          ▼
 Node.js + Express + TypeScript
          │
   ┌──────┼───────────────┐
   │      │               │
   ▼      ▼               ▼
Auth   Services        Validation
   │      │
   │      ▼
   │  Repositories
   │      │
   └──────┼───────────────┐
          ▼               ▼
      PostgreSQL     Central File Storage

Background Jobs / Scheduled Operations
Audit / View Logs
Backup / Restore
Health / Readiness / Monitoring
```

## 3. المسؤوليات

### Client
- العرض.
- التفاعل.
- إدارة حالة الواجهة.
- استدعاء API.

### Backend
- المصادقة.
- الصلاحيات.
- Access Scope.
- التحقق من المدخلات.
- قواعد الأعمال.
- الوصول للبيانات.
- تسجيل الأحداث الحساسة.

### PostgreSQL
تصبح مصدر الحقيقة الأساسي بعد Phase 9.

### File Storage
الملف الفعلي في التخزين المركزي؛ قاعدة البيانات تحفظ metadata والمفتاح/المسار.

## 4. Identity / Permission / Scope

```text
Identity
   ↓
Permission
   ↓
Access Scope
   ↓
Resource
```

وجود الدور وحده لا يكفي للوصول إلى مورد مقيد.

## 5. الجلسات والمصادقة

المصادقة النهائية تستخدم القواعد المحددة في `ALSQAYA_PLAN.md`، ومنها:
- إنشاء الحساب عبر رقم الباج/الرقم الوظيفي + الهاتف المسجل + OTP.
- لا يوجد Initialization Code.
- الدخول المعتاد برقم الباج أو الهاتف + الرمز السري.
- جلسة بخمول 30 دقيقة.
- تجميد/حظر الحساب يبطل الجلسات النشطة.
- OTP وقواعد المحاولات والـrate limits محددة في الخطة.

### 5.1 ما نُفِّذ في Phase 11

طبقة `auth` مستقلة في `server/src/auth/`، فوق `repositories` وتحتها `PostgreSQL`. **الصلاحيات (RBAC) منفَّذة في Phase 12** — انظر §5.2 — ونطاق الرؤية Phase 13.

**ترتيب التركيب على المسارات** (في `routes/index.ts` ثم `api/routes/index.ts`):

```text
requestId → requestLogger → json → [حقن الخدمات]
   ├─ /api/auth/*   ← المداخل التي تُنتج الجلسة: تسجيل، دخول، logout، تغيير سر، إدارة حساب
   │                  (الإدارية: جلسة + صلاحية Phase 12)
   └─ /api/*        ← requireSession() → requireChangedSecret() → requireResourcePermission() → المسارات
```

- `/api/auth/*` وحده هو ما يُركَّب **قبل** حارس الجلسة، لأنه المدخل الذي يُنتج الجلسة. وحتى داخله تبقى مسارات ما بعد الدخول محمية بـ`requireSession()` بحالها: `GET /me`، `POST /logout`، `POST /secret`، و`/accounts/:id/*` (وهذه الأخيرة تفرض صلاحيتيها Phase 12). العامّة منها فقط هي: طلب رمز التسجيل، التحقق منه، طلب رمز الاستعادة، التحقق منه، و`POST /login`.
- `requireSession()` يثبت **الهوية** فقط: بلا رفعة صالحة ⇒ 401.
- `requireChangedSecret()` يقيّد **الوصول للموارد** ما دام `must_change_secret` (§11.7). **فصل مقصود**: لو فُرض داخل `requireSession` لأُغلق على المستخدم مسار تغيير الرمز المؤقت نفسه.
- `requireResourcePermission()` يفرض **الصلاحية** بعد الرمزين (Phase 12): دور بلا العائلة المقابلة للـmethod ⇒ 403 `PERMISSION_DENIED` (§5.2).

**آلية الجلسة**: رفعة عشوائية 256 بت تُسلَّم مرة واحدة في جسم الاستجابة، وتُقبل بترويسة `Authorization: Bearer` أو كوكي `alsqaya_session`. القاعدة تخزّن **تجزئة SHA-256** فقط. لا Remember Me؛ الخمول 30 دقيقة؛ الجلسات المتزامنة مسموحة؛ `logout` يهدم الجلسة الحالية فقط.

**حدود المعاملات في `authService`** (قاعدة بنيوية، لا قاعدة عمل): المعاملات تُحصر في **النواة الذرّية** (إنشاء الحساب مع استهلاك الرمز، إنشاء الجلسة، التجميد مع إبطال الجلسات). عدّادات المحاولات وأحداث التدقيق تُكتب خارج المعاملة عبر `durable()`، وإلا أعادتها الـROLLBACK في اللحظة التي يجب أن تصمد فيها.

**مفتاح تشفير الرموز السرية**: من متغير بيئة منفصل `AUTH_SECRET_KEY`، خارج PostgreSQL. وحدة `secretVault.ts` معزولة ولا تُعمَّم على بيانات أخرى.

### 5.2 ما نُفِّذ في Phase 12

طبقة `authorization/` مستقلة في `server/src/authorization/`، فوق `auth/`
(تقرأ هويتها) وتحتها `api/`. **لا RBAC داخل services ولا داخل React** —
الفرض وسيط على المسار، والواجهة تعرض فقط.

**المصفوفة** (`permissions.ts`): الأدوار الثلاثة §28
(`admin/responsible Saqa · director · employee`) ← عشر عائلات §28،
بإسناد مشتق حرفياً من §10 (§10.1 المسؤول يملك كل العائلات ما عدا
`approve_request`، §10.2 المدير `view` + `approve_request` فقط، §10.3
المنتسب `view` فقط). أي دور خارج المصفوفة — ومنه القيمة الموروثة
`archivist` في قيد CHECK — يُرفض **fail-closed** دون حذف بياناته.

**نقاط الفرض**:

```text
/api/auth/*  العامة بلا تغيير؛ ما بعدها بجلسة:
  POST /accounts/:id/reset   ← requireSession → requirePermission('manage_accounts')
  GET  /accounts/:id/secret  ← requireSession → requirePermission('manage_security')

/api/*       requireSession → requireChangedSecret → requireResourcePermission
             (method ← عائلة: GET/HEAD→view · POST→create · PUT/PATCH→update
              · DELETE→delete_archive)
```

**حالة الرفض**: بلا جلسة ⇒ 401 `AUTHENTICATION_REQUIRED`؛ جلسة بدور
لا يملك العائلة ⇒ 403 `PERMISSION_DENIED`؛ رمز مؤقت ⇒ 403
`SECRET_CHANGE_REQUIRED` كما كان (الترتيب بينها مقصود: الهوية ← حالة
الرمز ← الدور). عائلات بلا مسارات بعد (`manage_availability`,
`approve_request`, `view_audit_logs`, `backup_restore`) مُعرَّفة في
المصفوفة دون سلوك — مراحلها لاحقة.

**خارج هذه المرحلة**: Access Scope (Phase 13) — تصفية السجلات المرئية
داخل الدور المسموح — غير منفَّذة؛ حارس في `tests/scope.test.ts` يمنع
تسرّبها. ودالة الواجهة `canUserAccessTransaction` (`src/core/models/accessScope.ts`)
**لم تُنقل** إلى الخادم هنا ولو وصفت نفسها بـ«Server-Ready»: هي تخلط فحص
الدور بفحص النطاق، وتستند إلى `archivist` و`transactions.directive` خارج
مفردات §28/§10 — فنقلها كان سيُدخل دوراً غير معتمد ويُنشئ مصدرَي حقيقة
لنفس القرار. مصدر الحقيقة للصلاحيات هو `authorization/permissions.ts`.

### 5.3 ما نُفِّذ في Phase 18 — محرّك القواعد والـLedger (§34/§15)

**الموضع:** `server/src/services/personnelRules.ts` (كان `.gitkeep` منذ Phase 8).

**الترتيب على المسار** (لا يتغيّر الترتيب القائم، ولا وسيط جديد):

```text
requireSession → requireChangedSecret → requireResourcePermission → attachAccessScope
   → validation → controller → service → PersonnelRulesEngine → repositories → PostgreSQL
```

**مبدأ الاستقلال عن React (§34):** لا `if minutes >= 420` ولا
`if balance > …` ولا نسخة من ثوابت §14 في `src/`. حارس بنيوي في
`tests/scope.test.ts` يفحص مجلد الواجهة كاملاً. المصدر الوحيد لقيم الرصيد
هو المحرّك على الخادم.

**المخطّط المنفَّذ:**

```text
Service Records → Accrual Engine → Leave Balance → Leave Ledger
Time Permission → Minutes Engine → 420 minutes → Emergency Conversion → Emergency Balance
```

**الذرّية:** كل كتابة رصيد (استحقاق · خصم · إلغاء · تحويل · افتتاح ·
تصحيح) تتم في `withTransaction` واحدة تُنشئ صف `leave_ledger` وتحدّث
`leave_balances` معاً. و`updateNumeric` مشروط بقيم الرصيد الحالية (نفس
مبدأ Phase 17 على صف الرصيد) ⇒ صفر صفوف عند التداخل وخطأ
`BALANCE_CONFLICT` بلا كتابة صامتة.

**صحّة الـLedger:** لا مسار لتعديل رقم رصيد مباشرة؛ طريقتا الكتابة
`opening_balance` و`adjustment` واثنتان فقط. الإلغاء ينشئ `cancellation`
مرتبطة بالأصل عبر `reverses_ledger_id` (مفتاح أجنبي على نفسه) — فلا حذف
ولا محو لتاريخ (§15).

**الحالات المحمية:** `annual_pending_days` و`annual_remainder_days` و
`emergency_remainder_minutes` أرقام **حالة** لا أرقام قرار: الباقي يُحفظ
ولا يُصفَّر بتغيّر السنة، والفائض فوق 180 يُحفظ لأن القاعدة لم تُحسم — لا
يُمنح ولا يُهدر.

**الصلاحية:** المسارات الجديدة على خريطة §28 القائمة (`GET`←`view` ·
`POST`←`create`). **لا دور ولا صلاحية جديدة**، ولا تحديد نطاق جديد
(الأرصدة إدارية للقراءة عبر `view` حسب §10.1).

### 5.4 ما نُفِّذ في Phase 19 — الطلبات وسير الموافقة (§18 · §35)

**الموضع:** `server/src/services/requestWorkflow.ts` (جدول الانتقالات + الدوال
الخالصة) فوق `repositories/` وتحت `api/` — والمنطق لا يعرف React ولا `localStorage`.

**الترتيب على المسار** (لا وسيط جديد عدا واحد مخصّص للطلب):

```text
requireSession → requireChangedSecret → requireResourcePermission → attachAccessScope
   → attachRequestScope
   → validateApiRequest → requireRequestWorkflowPermission → controller
   → service → requestWorkflow → repository → PostgreSQL
```

**آلة الحالات صريحة ومركزية:** `REQUEST_TRANSITIONS` هو المصدر الوحيد الذي
تستشيره الخدمة والمستودع والواجهة (عبر `availableActions` في استجابة
`GET /requests/:id`). الحالة التي لا تسمح بانتقال تُرفض بـ**409
`REQUEST_TRANSITION_NOT_ALLOWED`** قبل أي كتابة — والعميل لا يرسل حالةً أصلاً
(المُحقِّق يرفض حقل `status` كحقل مجهول).

**القفل التفاعلي والذرّية:** كل كتابة على الطلب مقيدة بـ`version` المرسلة
(Phase 17) داخل `UPDATE` واحدة، والطلب + صفّ `request_status_history` داخل
`withTransaction` واحدة. صفر صفوف يُصنَّف: `notFound` · `stale` (409
`VERSION_CONFLICT`) · `notAllowed` (409 قاعدة) — ولا نجاح صامت.

**بلا حذف (§32):** الإلغاء انتقالٌ إلى `cancelled`؛ الصفّ وسجلّ تاريخه يبقيان،
و`ON DELETE RESTRICT` على `request_status_history` من حذف الطلب.

**النطاق (Access Scope) للطلبات:** `requestScopeFilterFor` — المسؤول والمدير
كل الطلبات (§10.1/§10.2)، والمنتسب طلباته وحدها (§10.3)، والحساب بلا منتسب
مرتبط أو الدور خارج §28 ⇒ `empty` (fail-closed). قيدُه في `WHERE` لا تصفية بعد
القراءة، وطلبُ غير المرئي يُرجع **404** لا 403.

**الصلاحية على مسار الـworkflow:** `requireRequestWorkflowPermission` — أفعال
المدير الثلاثة (`approve` · `reject` · `request_clarification`) تحتاج
`approve_request` صراحةً (§10.2/§28)، وأفعال صاحب الطلب تمرّ على خريطة
`method ← family` القائمة لأن الخطة لم تقرّر لها صلاحية (**TBD** موثّق في
`PHASE_19_REPORT.md` §5). بلا صلاحية جديدة ودور جديد.

**ما لم يُنفَّذ (بلا اختراع):** لا إنشاء Leave/TimePermission عند الاعتماد، ولا
أثر رصيد عند الإلغاء، ولا انتقال إلى `under_review`، ولا مسار حذف.

---

### 5.5 ما نُفِّذ في Phase 20 — نطاق الكتب (Related Books · Status · Duplicates)

**الموضع:** `server/src/repositories/transactionRelationRepository.ts` +
`server/src/services/duplicateDetection.ts` + `server/src/api/services/relationService.ts`
فوق `repositories/` و`services/` وتحت `api/` — والمنطق لا يعرف React.

**الترتيب على المسار** (بلا وسيط جديد — نفس ترتيب بقية الموارد):

```text
requireSession → requireChangedSecret → requireResourcePermission → attachAccessScope
   → validateApiRequest → controller → service → repository → PostgreSQL
```

**الترحيل 0013 — `transaction_relations`:** مفتاحان أجنبيان على
`transactions` بـ`ON DELETE RESTRICT` على الطرفين (اتساقاً مع 0009)،
وقيد `CHECK (transaction_id <> related_transaction_id)`، وقيد
`UNIQUE (transaction_id, related_transaction_id)`، و`created_by`
بـ`SET NULL`. لا `relationship_type` — نصّ الخطة لا يحدّد أنواعاً (TBD).

**الاتجاه محفوظ:** صف `A → B` = «كتاب A يشير إلى كتاب B»، والقراءة
`{ outgoing, incoming }` تعرض الاتجاهين كما هما في القاعدة. **الحلقة
A→B→A مسموحة**: العلاقة إحالة أرشيفية لا شجرة تصنيف، وفرض DAG كان
سيمنع تبادل المراسلات بلا سند.

**نطاق الرؤية على الطرفين:** استعلام القراءة يربط `transactions` مرتين
(`src` و`dst`) ويفرض `transactionScopeCondition` **على كليهما**، والطرفين
غير مؤرشفين. ⇒ `A` مرئي و`B` محجوب = **لا صفّ ارتباط** (لا معرّف ولا
عنوان). كتاب محجوب ⇒ **404** لا 403. **العلاقة لا تفتح باباً لتجاوز
`Access Scope`.**

**انتقال الحالة:** `POST /api/transactions/:id/status` — كتابة على صفّ
الكتاب، فالقفل التفاؤلي `expectedVersion` إلزامي (نسخة قديمة ⇒ 409 بلا
كتابة، كتاب مؤرشف ⇒ 404) والحدث `status_change` بالقيمة قبل/بعد. الحالتان
المعتمدتان فقط، **بلا جدول انتقالات** لأن §8.1 لا تحدّد اتجاه الانتقال
(TBD).

**Duplicate Detection — تحذير لا منع:** `scanDuplicateTransactions` قراءة
بِـSQL واحد على الحقول الخمسة (العدد الرسمي · التاريخ · الجهة · الموضوع ·
بصمة الملف عند توفّرها)، والنتيجة تُعاد في `duplicateWarning` **بعد**
نجاح `INSERT`. `201` لا يتغيّر، ولا `ValidationError` ولا حذف ولا تعديل.
**لا مسار «افحص قبل الحفظ»**: لو وُجد لكان تنبيهه يمنع الإدخال، وهو ممنوع
نصّاً (§36). المطابقة حرفية تماماً — لا تطبيع عربي ولا تشابه ضبابي — وعتبة
الاشتباه «حقل واحد كافٍ»، لأن الخطة لم تحدّد عتبة (TBD).

**الإعمام بلا كيان مستقل:** §9.1 حرفياً ⇒ إعمام عام = `direction: 'وارد'`
+ `visibility: 'PublicToEmployees'`. لا `Circular` ولا جدول ولا صلاحية.

**علم الاستيراد التاريخي:** `imported_at` القائم منذ الترحيل 0002 هو
المكافئ المعتمد لـ`historicalImport` (§37) — **لا حقل ثانٍ**، ولا استيراد
فعلي من الجود (مرحلة لاحقة).

**بلا اختراع:** لا Role جديد · لا Permission جديدة · لا
`AuditEventKind` جديد (فُصلت `create` · `update` · `status_change` من
القائمة المقفولة). وأُضيفت أحداث تدقيق **لإنشاء الكتاب وتعديله** — الفجوة
التي كانت قائمة منذ Phase 15 رغم أنهما بندان صريحان في §31.

**ما لم يُنفَّذ:** لا `Circular` كيان · لا نظام تعليقات (§19 و TBD) ·
لا DAG للارتباطات · لا `relationshipType` · لا استيراد تاريخي فعلي ·
لا إشعارات (Phase 21) · ولا واجهة (UI-07).

---

## 6. التخزين المحلي

`localStorage` جزء من Prototype فقط، وليس مصدر الحقيقة النهائي.

المرفقات المحلية/Base64 ليست تخزينًا إنتاجيًا نهائيًا.

## 7. المجال الوظيفي

المجالات الرئيسية:
- User / Accounts.
- Employee / Former Employee.
- Researcher.
- Transactions/Books.
- TransactionEmployee.
- Attachments.
- Leaves / LeaveBalance / LeaveLedger.
- Time Permissions (الزمنيات).
- Assignments / Courses.
- Daily Situation.
- Requests.
- Notifications / Reminders.
- Audit / View Logs.
- Timeline (derived read model).
- Reports / Search / OCR.

## 8. البيانات التاريخية

المنتسب السابق يبقى محفوظًا مع تاريخه.

الأرشيف القديم 2022–2026 يحافظ على تاريخ الوثيقة وتاريخ إدخالها إلى السقاية، ولا يولد أحداثًا حديثة مصطنعة.

## 9. قواعد لا تغيرها المراحل

- لا علاقة رئيسية بالأسماء النصية.
- لا حذف تاريخي بسبب UI.
- لا صلاحية أمنية نهائية في العميل.
- لا تنفيذ لقواعد غير معتمدة.
- لا تكرار للبيانات الأصلية داخل Timeline أو التقارير.

## 10. المرجع

التفاصيل التنفيذية المرحلية والقواعد النهائية موجودة في:

`ALSQAYA_PLAN.md`
