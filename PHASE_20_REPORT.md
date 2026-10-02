# PHASE_20_REPORT — Archive Domain Server: Books, Relations, Circulars

> المرجع الملزم: `ALSQAYA_PLAN.md` §36 (مع §8.1 · §9.1 · §10.1 · §10.2 ·
> §10.3 · §12 · §19 · §28 · §31 · §32 · §33 · §37 · §53 · §54 · §56 · §57).
> هذا التقرير يتبع بروتوكول §53 ولا يعيد تعريف المرحلة ولا يوسّعها.
> **لا تُنفَّذ أي مرحلة لاحقة** (§60: لا انتقال تلقائي) — وUI-07 لم تُنفَّذ،
> ولا Notifications (Phase 21) ولا Search/OCR (Phase 22).

---

## 1. حالة المرحلة

**مكتملة ومختبرة، مع أربعة قرارات أعمال لم تحسمها الخطة ولم تُخترع لها
سلوك** (§5 بالتفصيل).

المرحلة **لم تبدأ من صفر**: نطاق الكتب كان منفَّذاً عبر Phases
4/5/10/13/14/16/17. أُجريت **Gap Audit** (§2) ونُفِّذت **الفجوات فقط**
— لم يُعَد بناء أي وظيفة سليمة قائمة.

| بند §36 | قبل Phase 20 | الحالة بعد |
|---|---|---|
| create incoming/outgoing/internal | ✅ موجود | لم يُمَس (اختبار جديد لتأكيده) |
| update | ✅ موجود | لم يُمَس + حدث تدقيق `update` |
| archive | ✅ موجود | لم يُمَس |
| status transition | ⚠️ ناقص (حقل في PATCH فقط) | ✅ `POST /:id/status` |
| related books | ❌ غير موجود | ✅ جدول + مستودع + API |
| transaction-employee relation | ✅ موجود | لم يُمَس |
| comments/notes | ✅ `notes` | لم يُمَس (TBD — §5.3) |
| priority | ✅ موجود | لم يُمَس (اختبار) |
| attachments | ✅ موجود | لم يُمَس (تكامل فقط) |
| historical import flag | ✅ `importedAt` | لم يُمَس (اختبار) |
| Duplicate Detection | ❌ غير موجود | ✅ تحذير لا منع |
| Access Scope على relations | ❌ غير موجود | ✅ مطبَّق على الطرفين |
| Circulars | ✅ نمودج قائم | لم يُمَس (اختبار) |

---

## 2. Gap Audit (قبل التنفيذ)

| # | البند | الموجود مسبقاً | الحكم |
|---|---|---|---|
| 1 | الاتجاهات الثلاثة | `TRANSACTION_DIRECTIONS` + قيد `CHECK` + `enumValue` | **موجود ويحقق المتطلب** |
| 2 | update | `PATCH /:id` + `expectedVersion` (Phase 17) | **موجود ويحقق المتطلب** |
| 3 | archive / restore | Phase 16 كامل | **موجود** |
| 4 | priority | DTO + تحقق + عمود + قيد | **موجود** |
| 5 | notes | عمود + DTO + تحقق | **موجود**؛ §19 تمنع تعليقاً جديداً |
| 6 | attachments | Phase 14 كامل + رؤية تتبع الكتاب | **موجود** |
---

## 3. الملفات التي تغيرت

### جديد — القاعدة (1)
`server/migrations/0013_archive_relations.sql` — جدول `transaction_relations`
بمفتاحين أجنبيين + قيدين + فهرسين، وتراجع نظيف.

### جديد — الخادم (7)
`server/src/repositories/transactionRelationRepository.ts` ·
`server/src/api/dto/transactionRelation.ts` ·
`server/src/api/dto/relationMappers.ts` ·
`server/src/api/validation/transactionRelationValidators.ts` ·
`server/src/api/services/relationService.ts` ·
`server/src/api/controllers/relationController.ts` ·
`server/src/services/duplicateDetection.ts`

### جديد — الاختبارات (2)
`server/tests/db/archiveDomain.test.ts` (13) ·
`server/tests/api/archiveDomain.test.ts` (19)

### مُعدَّل — الخادم (10)
`server/src/repositories/contracts.ts` · `server/src/repositories/index.ts` ·
`server/src/api/dto/index.ts` · `server/src/api/validation/index.ts` ·
`server/src/api/services/index.ts` ·
`server/src/api/services/transactionService.ts` ·
`server/src/api/services/auditService.ts` ·
`server/src/api/controllers/transactionController.ts` ·
`server/src/api/routes/resources.ts` ·
`server/src/api/dto/recordMappers.ts` (استعادة سطر آخر دالة)

### مُعدَّل — الاختبارات (4)
`server/tests/db/testDb.ts` · `server/tests/db/migrations.test.ts` ·
`server/tests/api/apiTestData.ts` · `server/tests/api/softDelete.test.ts`

---

## 4. الملفات التي لم تُمسّ عمداً

- **`server/migrations/0002` … `0012`** — مُطبَّقة؛ تعديلها يكسر
  `checksum`. كل إضافة في `0013`.
- **`server/src/authorization/permissions.ts`** — **لا صلاحية ولا دور
  جديد**؛ المصفوفة كما في Phase 12 حرفياً.
- **`server/src/audit/auditTypes.ts`** — **لا `AuditEventKind` جديد**.
- **`transactionRepository.ts`** — لم يُمَس: الفحص قراءة في خدمة منفصلة.
- **`transaction_employees` + مستودعه + `linkService` + `linkController`**
  — Phase 5/10: علاقة موظف-كتاب سليمة، **لم تُعَد** (تحقّق لا تنفيذ).
- **Phase 14 (attachments)** — لم يُمس.
- **Phase 16 (soft delete)** — لم يُمس: `DELETE /:id` لا يزال أرشفة.
- **Phase 17 (concurrency)** — لم يُمس.
- **React / `src/App.tsx` / `src/core/models/`** — لم تُلمس. **UI-07
  مرحلة منفصلة**، والحالتان في نموذج المجال بلا ثالثة.
---

## 5. قرارات لم تُحسم — Business Rule Blockers / TBD

### 5.1 اتجاه انتقال حالة الكتاب — **TBD**
`§8.1` تحدّد حالتين وتقرّ باستقلالهما عن الاتجاه، **ولا تحدّد أي انتقال
مسموح**. لذلك: لا جدول انتقالات مخترع (`REQUEST_TRANSITIONS` في Phase 19
ليست سابقة — هناك نصّ صريح)، وأي من الحالتين تُبادل الأخرى، والعميل
يرسل الحالة الهدف صراحةً، والحالة خارج القائمتين ⇒ 400 (قيد `CHECK` قائم
منذ Phase 9).
**يحتاج قراراً:** هل `مكتمل → قيد المراجعة` مسموح؟

### 5.2 نوع علاقة الكتب — **TBD**
`§8.1` تذكر «الكتاب المشار إليه» حقلاً واحداً بلا نوع، و`§36` لا تذكر
قيمة. لذلك **لا عمود `relationshipType` ولا كتالوج أنواع**، وإرساله من
العميل ⇒ 400 (مُتحقَّق منه باختبار).
**يحتاج قراراً:** هل تُميَّز العلاقة بأنواع (ردّ · استكمال · إحالة إدارية)؟

### 5.3 التعليقات — **TBD**
`§19`: «أي سلوك إضافي للتعليقات يحتاج قراراً موثقاً قبل التنفيذ». الحقل
`notes` قائم ويعمل؛ **لم يُنشأ نظام تعليقات** ولا جدول، ولم تُمنح المدير
صلاحية تعديل/حذف التعليقات.
**يحتاج قراراً:** كيان مستقل أم حقل `notes` فقط؟

### 5.4 تفاصيل Duplicate Detection — **جزئي**
الحقول الخمسة (§36) منفّذة حرفياً. **محدودان لم تحدّدهما الخطة**:
دالة المطابقة (حرفية تماماً — لا تطبيع عربي ولا تشابه ضبابي)، وعتبة
الاشتباه (تطابق حقل واحد كافٍ — لا «عدد أدنى» مخترع).
**يحتاج قراراً:** هل توجد عتبة رسمية؟

---

## 6. Database changes

### `server/migrations/0013_archive_relations.sql`

```text
transaction_relations
├── id                     uuid PK
├── transaction_id         uuid → transactions(id) ON DELETE RESTRICT  ← الطرف المُشير (A)
├── related_transaction_id uuid → transactions(id) ON DELETE RESTRICT  ← الطرف المُشار إليه (B)
├── created_by             uuid → users(id) ON DELETE SET NULL
├── created_at             timestamptz NOT NULL DEFAULT now()
├── CHECK  (transaction_id <> related_transaction_id)   ← لا إحالة إلى النفس
└── UNIQUE (transaction_id, related_transaction_id)    ← لا تكرار في نفس الاتجاه
```

- **مفتاحان أجنبيان حقيقيان** — لا نص رابط ولا JSON ولا اسم كتاب
  (القاعدة 7).
- **`RESTRICT` على الطرفين** اتساقاً مع Phase 16 (0009): الأرشفة طوابع
  حالة، فلا يمحو خطأٌ واحد الروابط مع الكتب.
- **`SET NULL` على `created_by`**: بقاء صف العلاقة (تاريخها) مضمون.
- فهرسان على طرفَي الـFK · **بلا `relationship_type`** (TBD §5.2) ·
  بلا بيانات تجريبية · تراجع نظيف (`DROP TABLE`).

**لم يتغيّر**: `transactions` و`transaction_employees` و`attachments`
و`transaction_availability` — لا عمود جديد ولا تعديل.
---

## 7. API changes

| المسار | الطريقة | الإذن | ماذا يفعل |
|---|---|---|---|
| `/api/transactions/:id/relations` | `GET` | `view` | `{ outgoing, incoming }` — الطرفان مقيَّدان بالنطاق |
| `/api/transactions/:id/relations` | `POST` | `create` | «كتاب A يشير إلى كتاب B» · `201` |
| `/api/transactions/:id/relations/:relationId` | `DELETE` | `delete_archive` | إزالة **سطر** العلاقة · `204` |
| `/api/transactions/:id/status` | `POST` | `create` | انتقال حالة بقفل تفاؤلي · `200` |

### إضافة في عقد استجابة موجودة
`POST /api/transactions` يعيد `201` كما كان، ومعه حقل `duplicateWarning`:

```json
{ "id": "…", "…": "كل حقول TransactionDto",
  "duplicateWarning": {
    "suspected": true,
    "reasons": ["officialNumber", "date", "source", "topic"],
    "candidates": [
      { "id": "…", "number": "…", "date": "…", "entity": "…",
        "subject": "…", "reasons": ["officialNumber", "date"] }
    ] } }
```

- **`201` لا يتغيّر** ⇒ لا «حفظ ثم رفض» ولا إعادة محاولة.
- **لا مسار منفصل للفحص** — الفحص **بعد** الكتابة لا قبلها، فتنبيه
  «قبل الحفظ» كان سيمنع الإدخال وهو ممنوع نصّاً (§36).

### أخطاء جديدة (من `AppError`؛ لا نظام أخطاء موازٍ)

| الرمز | HTTP | المعنى |
|---|---|---|
| `SELF_RELATION_NOT_ALLOWED` | 400 | الكتاب يشير إلى نفسه |
| `RELATION_ALREADY_EXISTS` | 409 | نفس الاتجاه موجود (قيد `UNIQUE`) |
| `VERSION_CONFLICT` | 409 | نسخة قديمة في انتقال الحالة (Phase 17) |

**لا صلاحية جديدة ولا دور جديد ولا `AuditEventKind` جديد.**

---

## 8. Related Books design

| السؤال | الجواب | السند |
|---|---|---|
| الشكل | جدول `transaction_relations` صف لكل ارتباط | «علاقة database حقيقية» (§36) |
| الاتجاه | **موجّه**: `A → B` في صف واحد | «book A refers to book B» |
| one-to-many أم many-to-many؟ | **كلاهما**: `A→B,A→C` · و`A→C,B→C` | «حسب الحاجة الفعلية» |
| لماذا لا `relationshipType`؟ | نصّ الخطة لا يحدّد أنواعاً | §5.2 (TBD) |
| كيف تُقرأ في الـAPI؟ | `{ outgoing, incoming }` | §8.1 + `UI_PLAN` §35 |
| من يملك `createdBy`؟ | هوية الجلسة على الخادم | §31 + القاعدة 7 |

### منع الحلقات — القرار
`§36`: «يجب منع حلقات غير مقصودة **أو على الأقل كشفها** في validation
إذا أصبح ذلك مهمًا للمعمارية». **الشرط الثاني لم يتحقق**:

> العلاقة **إحالة أرشيفية** («الكتاب المشار إليه» في §8.1)، وليست
> **شجرة تصنيف**. في الأرشيف، كتاب صادر يشير إلى وارد والوارد يشير
> بدوره إلى الصادر (تبادل المراسلات) واقعٌ طبيعي لا خلل. فرض DAG كان
> سيمنع علاقة صحيحة بلا سند.

| الحالة | السلوك | السند |
|---|---|---|
| `A → A` | **ممنوع** 400 + `CHECK` | علاقة بلا معنى — تكامل بيانات |
| `A → B` مرتين | **ممنوع** 409 + `UNIQUE` | إدخال واحد لا علاقتان — تكامل بيانات |
| `A → B → A` | **مسموح** | إحالة متبادلة لا حلقة بنيوية (مُختبَر) |
| `A → B → C → A` | **مسموح** | نفس السبب |

**لماذا هذا «منع للحلقات غير المقصودة» لا اختراع**: القيدان المطبَّقان
يمنعان **`A` أن يشير إلى نفسه** — وهو الشكل الوحيد الذي لا معنى له في
علاقة إحالة بين كتابين **مختلفين**. أما الدورات بين كتب **مختلفة**
فليست دورات في معنى شجرة، ولا طلبت الخطة كشفها.

---

## 9. Duplicate Detection

| البند §36 | التنفيذ |
|---|---|
| official number | `transactions.number` |
| date | `transactions.document_date` |
| source | `transactions.entity` (جهة الكتاب) |
| topic | `transactions.subject` |
| file hash when available | `attachments.content_hash` — **عند توفّر البصمة فقط** |
| **لا يمنع الإدخال** | `201` دائماً + حقل `duplicateWarning` |
| warning مع أسباب الاشتباه | `reasons[]` + `candidates[].reasons[]` |

**متى يعمل**: بعد نجاح `INSERT` في نفس الطلب ونفس الاتصال.
**ما لا يفعله**: لا `ValidationError` · لا حذف · لا تعديل · لا اختيار
«الصحيح» بالاجتهاد (مُختبَر: صفّان و`version = 1` بعد تحذير).

**الكتب المؤرشف** خارج الفحص، و**الكتاب نفسه** لا يشتبه بنفسه،
و**نطاق الرؤية** يقيّد الفحص بمن يستدعيه (مُختبَر: منتسب لا يرى مرشّحاً
إدارياً).

---

## 10. Circular behavior

**لم يُنشأ كيان `Circular`.** `§9.1` حرفياً: «الكتاب يصنف ككتاب وارد،
ثم يمنح نطاق رؤية `PublicToEmployees`» — أي **استخدام معتمد** لنموذج
الكتاب:

```text
direction: 'وارد' + visibility: 'PublicToEmployees'
   ⇒ كل المنتسبين يرونه (§10.3) بلا إتاحة فردية (§9.1)
```

خدمات الإتاحة (Phase 13) و`transactionScopeCondition` لم تُمَسّا. مُختبَر:
المنتسب يرى الإعمام في القائمة والتفصيل، **ولا** يكتسب صلاحية إدارية
عليه (403 على `POST /:id/status`).

---

## 11. Historical import behavior

| السؤال | الجواب |
|---|---|
| هل `historicalImport` و`importedAt` معاً؟ | **لا.** `imported_at` وحده (Migration 0002) |
| لماذا؟ | «`historicalImport=true` **أو ما يعادله**» (§37) |
| لماذا لا حقل ثانٍ؟ | تسمية لنفس الدلالة = ازدواجة بلا فائدة |
| يُقبل في `POST`؟ | نعم — مُتحقَّق منه ومحفوظ |
| يُقرأ في الـDTO؟ | نعم — `TransactionDto.importedAt` |

**مُختبَر**: `importedAt` محفوظ حرفياً، والاستيراد **لا يُنشئ** سجل
اطلاع (§31 Historical Data). **لم يُنفَّذ** استيراد فعلي من الجود ولا
Excel — له مراحل لاحقة؛ `historicalArchiveImport` (Phase 14) طبقة مطابقة
وتقرير فقط، لم تُمس.
---

## 12. Authorization

**لا Role جديد. لا Permission جديدة. لا تغيير RBAC.** `ROLE_PERMISSIONS`
كما في Phase 12 حرفياً.

| الدور | `GET /relations` | `POST /relations` | `DELETE` | `POST /status` |
|---|---|---|---|---|
| `admin` (§10.1) | ✅ | ✅ | ✅ | ✅ |
| `director` (§10.2) | ✅ | **403** | **403** | **403** |
| `employee` (§10.3) | ✅ (ضمن نطاقه) | **403** | **403** | **403** |

كل ذلك من خريطة `method ← family` (§28) بلا استثناء جديد. **مُختبَر
مباشرة عبر HTTP** — لا عبر React: «إخفاء زر ليس حاجزاً أمنياً» (§28).

---

## 13. Access Scope

**القاعدة**: *رؤية الارتباط = رؤية الطرفين معاً*. `A` مرئي و`B` محجوب
⇒ **لا صفّ ارتباط يُعاد** — لا معرّف `B` ولا عنوانه.

- الاستعلام يربط `transactions` مرتين (`src` و`dst`) ويفرض
  `transactionScopeCondition` **على كليهما** — في SQL لا بعد القراءة.
- الطرفان غير المؤرشفين (Phase 16).
- `GET /:id/relations` على كتاب محجوب ⇒ **404** (حجب وجود، Phase 13).
- فحص التشابه مقيَّد بنفس النطاق ⇒ لا كشف كتاب إداري عبر تحذير.

**العلاقة لا تفتح باباً لتجاوز `Access Scope`** — وهو أهم بند في نطاق هذه
المرحلة. مُختبَر في مستويي المستودع والـHTTP.

---

## 14. Audit

**النظام نفسه** (Phase 15)، **بلا `AuditEventKind` جديد**. سدّت Phase 20
فجوة: `create` و`update` للكتاب لم يكونا يُكتبان رغم أنهما في §31.

| العملية | `eventKind` | old/new |
|---|---|---|
| إنشاء كتاب | `create` | new: direction · number · status · `importedAt?` |
| تعديل كتاب | `update` | old/new: `status` + قائمة الحقول |
| انتقال حالة | `status_change` | old/new: `status` |
| إنشاء ارتباط | `create` | new: `relatedTransactionId` · `relationId` |
| إزالة ارتباط | `update` | old: `linked: true` · new: `linked: false` |

- `entityKind` = `transaction` في الخمسة.
- **الفاعل من `req.auth`** حصراً؛ `createdBy` من العميل ⇒ 400 (مُختبَر).
- **إزالة الارتباط `update` لا `delete`**: لم يُحذف كتاب (§32)، وتسجيلها
  `delete` كان سيُقرأ في السجل كحذف كتاب.
- **لا يُسجَّل كل قراءة** (§31): `GET /relations` بلا حدث، وكذلك فحص
  التشابه (قراءة وصفية).

---

## 15. Concurrency

| العملية | القفل | السلوك عند التعارض |
|---|---|---|
| `POST /:id/status` | `expectedVersion` **إلزامي** | 409 بلا كتابة |
| `PATCH /:id` | `expectedVersion` (قائم) | 409 بلا كتابة |
| `DELETE /:id` (أرشفة) | `expectedVersion` (قائم) | 409 بلا كتابة |
| `POST /relations` | — | لا يمسّ صفّ الكتاب ⇒ لا `version` |

**لماذا relationships بلا `version`**: `version` على `transactions` يخصّ
**تعديل حقول الكتاب**. إنشاء ارتباط أو إزالته لا يغيّر حقلاً منه، وإلا
لكان كل ارتباط جديد سبب تعارضٍ كاذب مع قارئٍ لم يغيّر شيئاً. القاعدة
نفسها مطبَّقة في Phase 5 على `transaction_employees`.

**لا آخر-كاتب-يفوز**: كل كتابة على صف الكتاب تمرّ بـ
`WHERE id AND version = $expected AND deleted_at IS NULL` في جملة واحدة.

---

## 16. Tests

| الملف | العدد | البنود |
|---|---|---|
| `server/tests/db/archiveDomain.test.ts` | **13** | FK 23503 · CHECK الإحالة للنفس · UNIQUE التكرار · الاتجاه · **النطاق على الطرفين** · الحلقة المسموحة · الأرشفة (صف باقٍ) · إزالة بلا حذف · أسباب التشابه الأربعة · **لا يمنع/لا يحذف/لا يعدّل** · البصمة · لا يشتبه بنفسه · نطاق الفحص |
| `server/tests/api/archiveDomain.test.ts` | **19** | الاتجاهات الثلاثة + رفض الرابع · إنشاء/قراءة الاتجاهين · 404 · 400 · 409 · رفض حقل مخترع · إزالة بلا حذف كتاب أو مرفق · الأرشفة تُبقي الصف · **لا تسرّب لكتاب محجوب** · RBAC (admin/director/employee) · **تحذير لا منع** · سبب واحد · لا تعديل تلقائي · انتقال الحالة + 409 + 400 + حالة مخترعة · استقلال عن الاتجاه · مؤرشف ⇒ 404 · الإعمام · الأولوية · علم الاستيراد · التدقيق · الفاعل من الجلسة |

**اختبار قُدِّر** (`softDelete.test.ts`): كان يعدّ حدثَي تدقيق للكتاب
(أرشفة + استعادة). بعد Phase 20 يُكتب `create` أيضاً، فاستُثني صراحةً
في `WHERE` ليبقى على موضوعه بدل أن يُضعَّف.

### جدول التحقق (نتيجة التشغيل الفعلية)

| الفحص | النتيجة |
|---|---|
| `npx tsc --noEmit` | **نظيف** (`exit 0`) |
| `npm run lint` | **نظيف** (`exit 0`) |
| `npm run build` | **نجح** — تحذير حجم الحزمة >500kB **قائم مسبقاً** |
| `npm run test:server` | **174/174** — `fail 0` |
| `npm run test:db` | **119/119** — `fail 0` (كان 105) |
| `npm run test:api` | **213/213** — `fail 0` (كان 194) |
| `npm run test:all` | **506/506** — `fail 0` (كان 473) |

---

## 17. Known limitations

1. **لا عتبة رسمية لكشف التكرار** (TBD §5.4) — تطابق حقل واحد يُنبّه.
2. **لا تطبيع عربي**: «١٠٠» ≠ «100». مخطّطة بأرقام عربية، فالمطابقة
   الحرفية **سلوك صحيح** لا نقص.
3. **سقف 10 مرشّحات** — إن وُجدت أكثر فالعرض مقصوص (لا منع).
4. **`duplicateWarning` في استجابة الإنشاء فقط** — لا مسار «افحص قبل
   الحفظ» (ووجوده كان سيخلق تنبيهاً يمنع الإدخال).
5. **لا مطابقة ضبابية** على الموضوع/العنوان.
6. **الواجهة لا تعرض شيئاً من Phase 20** — UI-07 مرحلة منفصلة.

---

## 18. TBD / Business Rule blockers

| # | Blocker | الأثر على التنفيذ |
|---|---|---|
| 1 | اتجاه انتقال الحالة (§5.1) | الحالتان تُبادلان بعضهما بلا جدول انتقالات |
| 2 | نوع علاقة الكتب (§5.2) | لا عمود `relationshipType` |
| 3 | التعليقات (§5.3) | لا كيان تعليقات؛ `notes` فقط |
| 4 | عتبة/دالة كشف التكرار (§5.4) | مطابقة حرفية، حقل واحد كافٍ |

**لا شيء من الأربعة منع تنفيذ بند من بنود §36.**

---

## 19. Deviations

| البند | الانحراف | السبب |
|---|---|---|
| `POST /:id/status` بعائلة `create` | خريطة method تجعله `create` | `POST = create` في §28؛ عائلة بديلة = صلاحية جديدة (ممنوعة) |
| فحص التشابه داخل `create` لا مساراً منفصلاً | §36 «لا يمنع الإدخال» | فحص «قبل الحفظ» = تنبيه يمنع الإدخال |
| `duplicateWarning` يُحسب بعد الكتابة | نفس السبب | الفحص قبل الكتابة يناقض النصّ |
| تعديل `softDelete.test.ts` | حدث `create` الجديد | الاختبار يعدّ حدثين لـ`entity_kind='transaction'` |

**لا انحراف عن نصّ §36.** و**لا Phase 21 ولا UI-07**.

---

## 20. Git

- **Branch:** `phase-10-api-data-layer` (المستعمَل في المستودع).
- **Commit:** يُسجَّل بعد التنفيذ.

**لا انتقال إلى Phase 21 ولا إلى أي مرحلة UI.**
