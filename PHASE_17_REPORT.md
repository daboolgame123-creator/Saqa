# PHASE_17_REPORT — Concurrency Control

> المرجع الملزم: `ALSQAYA_PLAN.md` §33 (+ §31 و§32 و§13).
> هذا التقرير يتبع بروتوكول §53 (عشرة بنود). لا يعيد تعريف المرحلة ولا يوسّعها.

---

## 1. حالة المرحلة

**مكتملة ومختبرة.** المتطلبات المنصوص عليها في §33 نُفِّذت دون تعديل أو تخفيض:

| بند §33 | الحالة | الموضع |
|---|---|---|
| version column أو equivalent | ✅ | `transactions.version` `integer NOT NULL DEFAULT 1` + `CHECK (version >= 1)` (الترحيل 0010) |
| optimistic locking | ✅ | `version = $expectedVersion` و`version = version + 1` **في جملة `UPDATE` واحدة** (تعديل/أرشفة/استعادة) |
| database transactions للعمليات المركبة | ✅ | الاستعادة (قراءة الحالة السابقة + الكتابة) داخل `withTransaction` واحدة؛ الإنشاء ذرّي منذ Phase 9 |
| conflict response واضح | ✅ | 409 `VERSION_CONFLICT` + `details: { expectedVersion, currentVersion }` + رسالة عربية |
| «لا يكتب فوق تعديل B بصمت» (المثال) | ✅ | 409 بلا أي كتابة؛ `stale` مُصنَّف ومستعمَل للترجمة |
| «يعاد تحميل النسخة الحديثة أو يظهر تعارض واضح» | ✅ | النسخة الحالية تُعاد في `details` في كل تعارض |
| stale update / concurrent transaction / rollback mid-operation | ✅ | `db/optimisticConcurrency.test.ts` (9) · `api/optimisticConcurrency.test.ts` (7) |

---

## 2. الملفات التي تغيرت

### جديد — القاعدة (1)
`server/migrations/0010_transaction_version.sql`

### جديد — الخادم (1)
`server/src/api/errors/VersionConflictError.ts` (409 `VERSION_CONFLICT`؛ يُصدَّر من `errors/index.ts`)

### جديد — الاختبارات (2)
`server/tests/db/optimisticConcurrency.test.ts` (8) · `server/tests/api/optimisticConcurrency.test.ts` (7)

### مُعدَّل — المستودعات (2)
`repositories/contracts.ts` (`VersionedWriteMiss` · `VersionedWriteOutcome` ·
`RestoreTransactionOutcome` · `ArchiveTransactionInput.expectedVersion` · توقيع `update`/`restore`)
· `transactionRepository.ts` (عمود `version` في `TRANSACTION_COLUMNS` · `update` ثلاثي المعاملات
بقفل واحد · أرشفة واستعادة مقيدتين بالنسخة · `classifyMiss` · الاستعادة داخل معاملة).

### مُعدَّل — الـAPI (9)
`dto/transaction.ts` (`version` في القراءة · `expectedVersion` في `UpdateTransactionDto` ·
`ArchiveTransactionQuery` · `RestoreTransactionQuery`) · `dto/recordMappers.ts` ·
`dto/inputMappers.ts` · `validation/fields.ts` (`queryPositiveInt`) ·
`validation/transactionValidators.ts` · `services/transactionService.ts` ·
`controllers/transactionController.ts` · `routes/resources.ts` · `errors/index.ts`.

### مُعدَّل — الواجهة (8)
`src/core/models/transaction.ts` · `src/core/interfaces/dataAdapter.ts` ·
`src/api/mappers.ts` · `src/api/localDataAdapter.ts` · `src/services/authService.ts` ·
`src/App.tsx` (خمسة نداءات تعديل) · `src/components/modals/NewTransactionModal.tsx` ·
`src/data/mockData.ts`.

### مُعدَّل — الاختبارات (7)
`tests/db/migrations.test.ts` (9 ← 10 إصدارات + تراجع 0010) · `tests/db/repositories.test.ts`
(اختبار التعديل صار بنسخة المتوقعة و`VersionedWriteOutcome`) ·
`tests/api/apiClient.test.ts` · `tests/api/apiTestData.ts` (`version` في `TransactionBody`) ·
`tests/api/transactions.test.ts` · `tests/api/rbac.test.ts` · `tests/api/softDelete.test.ts`
(كل أرشفة/استعادة تمرّ بـ`?expectedVersion=` — لمس Phase 16، انظر §7).

### مُعدَّل — التوثيق (2)
`ALSQAYA_PLAN.md` (جدول المراحل + «تقرير الإنجاز الفعلي» في §33) · `README.md`

### مُعدَّل — صيانة (4)
نصوص غريبة (حروف صينية/سيريلية ملتصقة) موجودة في Git منذ مراحل أقدم، أُصلحت لأن كل
واحدة كلمة لا معنى لها ولا علاقة لها بقفل النسخ:
`server/src/auth/authValidators.ts` (تعليق) · `src/api/localDataAdapter.ts` (تعليق) ·
`server/tests/api/softDelete.test.ts` (رسالة تأكيد) · `src/data/mockData.ts` (نص سبب
إجازة وهمي). انظر §15.
---

## 3. الملفات التي لم تتغير ولماذا

| الملف | السبب |
|---|---|
| `server/migrations/0001`–`0009` | ترحيلات مُطبَّقة (checksum يرفض التعديل) |
| بقية مستودعات المجال (موظف · روابط · إتاحة · موقف يومي · شؤون منتسبين) | §33 لا يحدّد نطاق القفل؛ لم تُخترع قاعدة أعمال لبقيتها. **نطاق: الكتاب وحده** |
| `audit/**` | لا نوع حدث جديد (§31)؛ القفل لم يُغيّر ما يُكتب في الحدث |
| `authorization/**` | لا صلاحية جديدة — الكتابة مقيدة لا مرخَّصة |
| `src/api/apiDataAdapter.ts` | `definedFields(patch)` يمرّر `expectedVersion` كما هو؛ لا تحويل لازم |
| `src/services/storageService.ts` | التطبيع في `AuthService.normalizeTransaction` (نقطة دخول القراءة الواحدة) |
| `server/tests/api/availability.test.ts` | 6 أخطاء أنواع قديمة من Phase 13 — خارج النطاق (انظر §15) |

---

## 4. الـMigration 0010

```sql
-- migrate:up
ALTER TABLE transactions
    ADD COLUMN version integer NOT NULL DEFAULT 1,
    ADD CONSTRAINT transactions_version_positive CHECK (version >= 1);

-- migrate:down
ALTER TABLE transactions
    DROP CONSTRAINT transactions_version_positive,
    DROP COLUMN version;
```

- **إضافة فقط**: لا جدول، لا إعادة بناء، لا تغيير في أي قيد من Phase 16 (`deleted_at`…).
- الصفوف القائمة تأخذ **1** لأن العمود `NOT NULL DEFAULT 1` — لا ترحيل بيانات ولا
  وقت توقف.
- قيد `CHECK (version >= 1)` يمنع `0` والقيم المخترعة السالبة من عميل يتجاوز التحقق.
- `down` قابل للتراجع ومُختبَر: `migrations.test.ts` يتراجع 0010 ويؤكد زوال العمود
  وبقاء الجداول ال22.
- بقاء `DEFAULT 1` بعد الترحيل مقصود: كل إدراج جديد يبدأ من 1 بلا أن يكتب أحد
  العمود صراحةً (و`CreateTransactionInput` يستثنيه).

---

## 5. سلوك القفل (optimistic locking)

| العملية | جملة واحدة | شرط النسخة | شرط الحالة | عند النجاح |
|---|---|---|---|---|
| `update` | `UPDATE … SET <الحقول>, updated_at = now(), version = version + 1` | `version = $expected` | `deleted_at IS NULL` | `updated` + السجل بنسخته الجديدة |
| `archive` | `UPDATE … SET deleted_at = now(), …, version = version + 1` | `version = $expected` | `deleted_at IS NULL` | `updated` |
| `restore` | `UPDATE … SET deleted_at = NULL, …, version = version + 1` | `version = $expected` | `deleted_at IS NOT NULL` | `restored` + الحالة السابقة |

- **لا نافذة**: الفحص والكتابة في **الجملة نفسها** — لا `SELECT` ثم `UPDATE` (وهو ما
  يسمح بكتابة قديمة بصمت). اختبار التزامن الفعلي (§11) يعدّ كتابة واحدة فقط.
- **صف صفر ⇒ فشل مُصنَّف** لا صمت نجاح: `classifyMiss` قراءة تصنيف واحدة فقط —
  `notFound` · `stale` (مع النسخة الحالية) · `stateMismatch` (النسخة مطابقة والحالة
  لا تقبل العملية).
- **`update` بلا حقول** لا يكتب ولا يخسر تحديثاً: يعيد السجل كما هو (سلوك Phase 10،
  ومُحقِّق الـAPI يرفض PATCH بلا حقل أصلاً).

---

## 6. استجابة التعارض والعقد مع العميل

| المسار | مكان النسخة | غيابها | نسخة قديمة | حالة لا تقبل العملية | غير موجود |
|---|---|---|---|---|---|
| `PATCH /api/transactions/:id` | جسم الطلب (`expectedVersion`) | 400 | **409** | 404 | 404 |
| `DELETE /api/transactions/:id` (أرشفة) | `?expectedVersion=` | 400 | **409** | 404 | 404 |
| `POST /api/transactions/:id/restore` | `?expectedVersion=` | 400 | **409** | 404 | 404 |

- `DELETE` و`restore` بلا جسم في هذا المشروع (انظر `postJson` في أدوات الاختبار)،
  فالنسخة في الاستعلام كما في `reason` — بلا استثناء واحد في العقد.
- جسم 409:

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "تعارض تحديث: الكتاب بالمعرّف «…» تغيّر منذ قراءتك هذه النسخة (المتوقعة 1، الحالية 2). لم تُكتب أي بيانات — أعد تحميل السجل ثم أعد المحاولة.",
    "details": { "expectedVersion": 1, "currentVersion": 2 }
  }
}
```

- `stateMismatch` و`notFound` مترجمان إلى **404 نفسه** (سلوك Phase 16: لا فرق يُكشف
  بين «غير موجود» و«موجود في حالة لا تقبل العملية»).
---

## 7. الأثر على Phase 16 (أرشفة/استعادة): ما الذي لُمس ولماذا

لم تُعَد كتابة فكرة المسارات، لكن **أصبحت كل كتابة على كتاب موجود تتطلّب نسخة**:

- `archive` و`restore` قفلان تفاؤليان بنفس جملة `UPDATE` الواحدة (لا `DELETE`).
- الاستعادة صارت تقرأ الحالة السابقة **داخل معاملة الاستعادة نفسها** بدل قراءة
  سابقة لها — فحدث التدقيق يصف ما استُعيد فعلاً (§31).
- **لم يتغيّر**: الأرشفة `UPDATE` لا حذف · الصف باقٍ بمعرّفه وتاريخه · الروابط
  والمرفقات وسجلات الإتاحة والاطلاع والتدقيق باقية · المؤرشف مستبعد من كل
  القراءات النشطة · `?reason=` اختياري كما كان · حارس `delete_archive` كما هو ·
  استعادة كتاب نشط 404.
- **لمس الاختبارات فقط**: `tests/api/softDelete.test.ts` (كل نداءات الأرشفة/الاستعادة
  صارت تمرّر `?expectedVersion=` عبر دالة مساعدة `currentVersion()` تقرأ النسخة
  الحقيقية من القاعدة) · `tests/api/transactions.test.ts` (اختبار الأرشفة 404) ·
  `tests/api/rbac.test.ts` (مصفوفة الصلاحيات على تعديل الكتاب). **لم يتغيّر أي تأكيد
  سلوكي** في هذه الملفات — تغيّر فقط ما يُرسَل ليُقبل الطلب أصلاً (401/403 تبقى
  قبل التحقق، والمصفوفة كما هي).

---

## 8. الأثر على التدقيق (Phase 15)

- **لا نوع حدث جديد**: الأرشفة `archive` والاستعادة `update` + `action: restore`
  كما في §31.
- حدث الاستعادة يحوي `old_values.deletedAt` **المقروء من داخل معاملة الاستعادة** —
  فلا يُسجَّل حدث بحالة قبل لم تُستعد (انظر §5 و§16).
- **طلب مرفوض (409) لا يُسجَّل**: لا كتابة فلا حدث؛ مُختبَر في
  `api/optimisticConcurrency.test.ts` («الطلب المرفوض (409) لا يكتب حدث تدقيق»).

---

## 9. Foreign Keys والمرفقات والإتاحة

**لا شيء**. عمود واحد على `transactions` فقط؛ لا قيود جديدة، ولا مساس بـ`storage_key`
ولا ببصمة المحتوى ولا بإتاحة Books (Phase 13). الأرشفة والاستعادة preservا كل هذه
العلاقات كما كانت (مُختبَر في `db/optimisticConcurrency.test.ts`: الروابط والمرفقات
كما هي بعد الاستعادة) — القفل يغيّر **متى** تُكتب لا **ماذا** يُكتب.

---

## 10. الأمان وسلوك الفشل

| الحالة | السلوك | السبب |
|---|---|---|
| نسخة قديمة على كتاب مرئي | 409 بلا كتابة | §33 «لا يكتب فوق تعديل B بصمت» |
| كتاب خارج نطاق رؤية الفاعل | الكتابة تذهب بالمعرّف وحده (سلوك قائم من Phase 10؛ النطاق في القراءة فقط) | §33 لا يغيّر نطاق الرؤية — خارج نطاق المرحلة |
| طلب بلا جلسة | 401 قبل التحقق | سلوك Phase 11 القائم (تستعيه اختبارات Phase 16 بلا نسخة) |
| طلب بدور لا يملك الصلاحية | 403 قبل التحقق | الحارس يسبق `validateApiRequest` في المسار |
| `expectedVersion` غير موجبة/غير عددية | 400 | `queryPositiveInt`/`positiveInt` |
| فشل القاعدة داخل معاملة | تراجع كامل بلا نصف كتابة | `withTransaction` + اختبار rollback |
- القيم غير الموجبة أو غير العددية (`?expectedVersion=abc` · `0` · `-1`) ⇒ 400 من
  `queryPositiveInt`.
---

## 11. الاختبارات

### جديد — على PostgreSQL مباشرة (`tests/db/optimisticConcurrency.test.ts`, 8)

| الاختبار | ما يُثبته |
|---|---|
| الإنشاء يبدأ بالنسخة 1 | `DEFAULT 1` + النسخة تُقرأ في كل قراءة |
| التعديل بالنسخة الحالية ثم القديمة | النجاح يرفع النسخة 1 · والقديمة `stale` مع النسخة الحالية **وبلا كتابة** (`subject` و`version` و`updated_at` كما هي) |
| تعديلان متزامنان بنفس النسخة | `[stale, updated]` بالضبط · النسخة 2 · قيمة مخزَّنة واحدة لا دمج |
| كتاب غير موجود (تعديل/أرشفة/استعادة) | `notFound` ثلاثةً (لا اختراع حالة) |
| الأرشفة بقفل | نسخة قديمة ⇒ `stale` بلا كتابة · نسخة صحيحة ⇒ `updated`/version 2 مع طوابع الأرشفة |
| كتابة على حالة لا تقبلها | أرشفة مؤرشف وتعديل مؤرشف ⇒ `stateMismatch` بلا زيادة نسخة |
| الاستعادة | نسخة قديمة ⇒ `stale` · نسخة صحيحة ⇒ `restored` مع `previous` (الحالة قبل الاستعادة) · الروابط والمرفقات كما هي · استعادة نشط ⇒ `stateMismatch` |
| التراجع عند الفشل | كتابة ثم خطأ في معاملة ⇒ لا أثر للأولى (لا نصف كتابة) |

### جديد — عبر الـHTTP (`tests/api/optimisticConcurrency.test.ts`, 7)

| الاختبار | ما يُثبته |
|---|---|
| PATCH بلا `expectedVersion` | 400 `VALIDATION_ERROR` + الحقل الناقص · ولا كتابة في القاعدة |
| PATCH بنسخة قديمة / حالية | 409 `VERSION_CONFLICT` مع النسختين في `details` وبلا كتابة · 200 مع النسخة+1 |
| تعديلان متزامنان | `[200, 409]` · كتابة واحدة فقط |
| DELETE (أرشفة) | 400 بلا نسخة · 409 بنسخة قديمة والصف ما زال نشطاً · 200 بالحالية مع النسخة+1 والسبب |
| restore | 400 بلا نسخة · 409 بنسخة ما قبل الأرشفة · 200 بالحالية مع النسخة+2 ونفس المعرّف |
| 409 بلا آثار جانبية | لا حدث تدقيق جديد · لا كتابة على الصف |
| دورة أرشفة ← استعادة | صف واحد · تاريخ إنشاء واحد · الخروج من النشط ودخول الأرشيف ثم العودة · النسخة 1→2→3 |

### تغطية §33

| مطلب §33 | الاختبار |
|---|---|
| stale update | `db`: «التعديل بالنسخة الحالية… والنسخة القديمة تُرفض» · `api`: «PATCH بنسخة قديمة ⇒ 409» |
| concurrent transaction | `db`: «تعديلان متزاممان» · `api`: «واحد 200 والآخر 409» |
### نتائج التشغيل

| المجموعة | النتيجة |
|---|---|
| `npm run test:server` | ✅ 117 / 117 |
| `npm run test:db` | ✅ 57 / 57 |
| `npm run test:api` | ✅ 156 / 156 |
| `npx tsc --noEmit` | 6 أخطاء قديمة فقط (§13) — صفر خطأ جديد |
| `npm run build` | ✅ نجح |

---

## 12–16. المشاكل والقرارات

### 12. Typecheck
`tsc --noEmit` على كامل المشروع: **الأخطاء الستة نفسها من Phase 13** في
`server/tests/api/availability.test.ts`، بلا زيادة ولا نقصان. كل ما لُمس في هذه
المرحلة (`src/**` · `server/src/**` · الاختبارات الجديدة) **نظيف**.

### 13. Lint
`npm run lint` = `tsc --noEmit` ⇒ **يفشل بستة أخطاء قديمة** (موثّقة في تقارير Phase
13/14/15/16): `phoneNumber` · `visibility` · `JsonResponse<TransactionBody>`
← `ApiErrorBody` (سطران) · `subject` (سطران). **لم تُصلَح** لأن إصلاحها توسيع أنواع
اختبارات Phase 13 لا علاقة له بـPhase 17. **صفر خطأ ناتج عن Phase 17.**

### 14. Build
✅ نجح — حزمة الواجهة مبنية بلا أخطاء.

### 15. المشاكل (قديمة وقيود)

1. **6 أخطاء أنواع في `availability.test.ts`** (Phase 13) — خارج النطاق كما سبق.
2. **عيب قديم في `handleSaveTransaction` (الواجهة)**: النداء يرسل كائن الكتاب كاملاً
   في جسم `PATCH` — وفيه حقول لا يقبلها مُحقِّق `PATCH` على الخادم
   (`id`/`month`/`createdAt`/`updatedAt`) فيرفضه الخادم بـ400. **قائم من Phase 10**
   (مُحقِّق `noUnknownFields` قائم منذها) و**لم يُصلَح**: إصلاحه اختيار قائمة حقول
   مسموحة وهو قرار نطاق (يُلمس نموذج الطلب بالشاشة، لا بالقفل). أُضيف سطر توضيح في
   `App.tsx` عند النداء لئلا يُنسب العيب إلى Phase 17.
3. **نصوص غريبة ملتصقة بحروف صينية/سيريلية** موجودة في Git منذ مراحل أقدم:
   `src/api/localDataAdapter.ts` · `server/src/auth/authValidators.ts` ·
   `server/tests/api/softDelete.test.ts` (كلها تعليقات أو رسالة تأكيد)، ونص سبب إجازة
   وهمي في `src/data/mockData.ts`. **أُصلحت الأربعة**: كلمة بلا معنى في ملف مرّرنا عليه
   أصلاً، ولا علاقة لها بالقفل ولا باختبار. بينما **تلف ترميز
   `validation/queryValidators.ts`** (موثّق في تقرير Phase 16، ملف بأكمله) **لم يُلمس**:
   إصلاحه خارج نطاق هذه المرحلة.
4. **معرّف مسار غير uuid** يُنتج 500 من القاعدة لا 400 (سلوك قائم في كل مسارات الكتب
   قبل Phase 16) — لم يُوسَّع النطاق. النسخة نفسها (وهي رقمية) تُتحقق بأمان: غير
   عددية ⇒ 400.
5. **لا قفل لبقية الموردات** (الموظف · الروابط · الموقف اليومي · شؤون المنتسبين):
   §33 لا يحدّد نطاقاً، وتوسيعه بلا نص مخالفة «لم تُخترع قواعد أعمال».
6. **الأرشفة والاستعادة بلا واجهة** (لا زر في React): الأمر نفسه من Phase 16 —
   المنع على الخادم والاختبارات تغطيه؛ لم تُبنَ شاشة في هذه المرحلة.

### 16. قرارات تقنية (داخل حدود الخطة)

| القرار | السند |
|---|---|
| `version integer DEFAULT 1` + `CHECK (version >= 1)` على `transactions` | «version column أو equivalent»؛ `DEFAULT 1` يعطي الصفوف القائمة 1 بلا ترحيل بيانات |
| القفل **داخل جملة `UPDATE`** لا قراءة ثم كتابة | «لا يكتب فوق تعديل B بصمت» + «database transactions للعمليات المركبة» |
| `409` + رمز `VERSION_CONFLICT` | 409 هو دلالة Conflict القياسية في HTTP؛ `details` فيها النسختان لتُقرأ برمجياً |
| `expectedVersion` **إلزامية** في المسارات الثلاثة | عقد واحد بلا استثناء؛ غيابها = كتابة بلا شرط (تسريب) |
| `expectedVersion` في الاستعلام لمساري `DELETE` و`restore` | المشروع لا يحمل جسماً مع `DELETE` (انظر أدوات الاختبار) — كما كان `?reason=` |
| `stateMismatch` ⇒ 404 لا 409 | سلوك Phase 16 «أرشفة مؤرشف ⇒ 404»؛ لا حالة ثالثة ولا كشف وجود |
| استعادة الحالة السابقة داخل معاملة الاستعادة | §33 «database transactions» + §31 (حدث التدقيق يصف ما استُعيد فعلاً) |
| كتابة **نموذج** واحدة يترجم الفشل ثلاثي | استجابة HTTP واحدة للتعديل والأرشفة والاستعادة؛ توزيع القرار في طبقة التطبيق لا المستودع |
| `version` في نموذج المجال مع تطبيع القديم إلى 1 | `DEFAULT 1`؛ بيانات `localStorage` القديمة بلا نسخة تُقرأ كـ1 فتصلح دون ترحيل |
| التنفيذ المحلي يرفض النسخة القديمة أيضاً | عقد واحد للوضعين؛ الواجهة ignorant بمكان البيانات |
| القفل على الكتاب وحده | §33؛ نطاق أدنى بلا اختراع قواعد لبقيته |

---

## 17. Git

```text
54acf89  feat(concurrency): implement phase 17 - optimistic concurrency control
```

- **Branch:** `phase-10-api-data-layer` (كما في كل المراحل السابقة)
- **Scope:** 34 ملفاً — 1743 إضافة و155 حذفاً. 4 ملفات جديدة (ترحيل · خطأ · ملفا
  اختبار) · 30 ملفاً معدَّلاً (17 كود · 7 اختبارات · الخطة وREADME · 4 صيانة · هذا
  التقرير).
- **الدفع:** **لم يُدفع** إلى GitHub — commit محلي فقط.

## 18. تأكيد عدم تنفيذ Phase 18

**لم تبدأ Phase 18 ولم يُكتب منها سطر**: لا محرك قواعد الإجازات ولا الأرصدة ولا
أذونات الوقت ولا التكليفات ولا الدورات (§34)، ولا عمل مجدول، ولا بحث، ولا OCR، ولا
إشعارات. تغييرات هذه المرحلة كلها عمود `version` ووُصله بالكتابة على `transactions`.
| rollback mid-operation | `db`: «التراجع عند الفشل» + الاستعادة داخل معاملة (§8) |
| conflict response واضح | `api`: 409 + `details` + رمز ثابت `VERSION_CONFLICT` |
| مثال §33 (مستخدمان) | مغطّى باختباري النسخة القديمة والتزامن أعلاه |