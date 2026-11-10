# PHASE 13 REPORT — Access Scope + Book Availability / نطاق الرؤية وإتاحة الكتب

**الحالة:** مكتملة ومختبرة.
**نقطة الانتقال التالية:** Phase 14 — Attachments & Central File Storage (لم تبدأ).

المرجع: `ALSQAYA_PLAN.md` §29 (تعريف المرحلة) · §12 (Access Scope) ·
§9.1/§9.3/§9.4/§9.5 (الإتاحة والأعمام) · §10.1/§10.2/§10.3 (الأدوار).

**الهدف:** تطبيق الفصل بين الصلاحية والنطاق — `Identity → Permission → Access Scope → Resource` —
بمعنى أن `view` تسمح بالعملية، ويقرّر **النطاق** أي سجل من سجلات تلك العملية يُقرأ.

---

## 1. نطاق Phase 13

| بند §29 | الحالة |
|---|---|
| `PublicToEmployees` | ✅ مفروضة ومنفَّذة |
| `SpecificEmployees` | ✅ مفروضة عبر الإتاحة |
| `Administrative` | ✅ معرَّفة ومقروءة، لا يراها المنتسب |
| `DirectorOnly` | ✅ معرَّفة ومقروءة، لا يراها المنتسب |
| إنشاء علاقة بين transaction وemployees | ✅ جدول `transaction_availability` |
| grant availability | ✅ `POST /api/transactions/:id/availability` |
| bulk grant | ✅ `POST /api/transactions/:id/availability/bulk` |
| revoke availability | ✅ `DELETE /api/transactions/:id/availability/:employeeId` |
| inspect availability for admin | ✅ `GET /api/transactions/:id/availability` |
| المدير لا يدير هذا السجل | ✅ `requirePermission('manage_availability')` — 403 للمدير |

**اختبارات §29 السبعة** وأين تُغطّى (ترقيمها حسب ترتيب `server/tests/api/availability.test.ts`):

| اختبار §29 | التغطية |
|---|---|
| public circular | الحالة 1 (المسؤول والمدير) والحالة 2 (المنتسب) |
| one employee | الحالة 3 — منح لمنتسب واحد |
| multiple employees | الحالة 3 (قائمة `employeeIds`) والحالة 4 (بالجملة) |
| revoke | الحالة 3 — السحب ثم اختفاء الكتاب |
| linked employee but not available | الحالة 6 — كتاب إداري مرتبط بمنتسب لا يظهر في روابطه |
| available but employee role only | الحالة 3 — يظهر للمنتسب بعد المنح لا قبله |
| director access according to scope without managing availability | الحالة 1 (المدير يرى الكل) والحالة 5 (403 على مسارات الإتاحة) |

**لم يُنفَّذ عمداً** (خارج النطاق): تخزين مركزي للمرفقات · سجل الاطلاع (§9.2) وسجل التدقيق ·
إشعار الإتاحة الجديد (§9.3) · سير موافقة الطلبات · Soft Delete · أي تعديل في الواجهة React.


---

## 2. ما تم تنفيذه

### 2.1 طبقة النطاق — `server/src/authorization/accessScope.ts` (جديد)

مصدر الحقيقة على الخادم لقيم النطاق وقاعدة «من يرى أي كتاب»، ولا يستبدل الصلاحيات.

| الرمز | الدور |
|---|---|
| `ACCESS_SCOPE_VALUES` | القيم الأربع، المصدر الوحيد لقائمة التحقق |
| `DEFAULT_ACCESS_SCOPE` | `'Administrative'` — افتراض كتاب بلا قيمة مخزَّنة |
| `EMPLOYEE_DIRECT_SCOPES` | `['PublicToEmployees']` — ما يراه المنتسب بلا إتاحة (§9.1) |
| `AVAILABILITY_SCOPE` | `'SpecificEmployees'` — النطاق الذي تحلّ فيه الإتاحة محلّ الظهور (§9.3) |
| `isAccessScope()` | حارس قيمة: لا يقبل إلا واحدة من الأربع |
| `ScopeViewer` | `{ role, employeeId }` — يُقرأ من هوية الجلسة لا من المدخلات |
| `transactionScopeFilterFor()` | حساب القيد حسب الدور |
| `attachAccessScope()` | وسيط يثبّت القيد على `res.locals.accessScope` |
| `transactionScopeOf()` | قراءة القيد من الطلب (يعيد الحساب من الهوية عند غيابه) |

**قرار الافتراض:** كتاب بلا `visibility` يُعامل كـ`Administrative` لا كـ`PublicToEmployees` — الغياب
لا يجعل الكتاب عاماً بالخطأ (fail-closed للمنتسب).

**قرار نطاق الإتاحة:** `SpecificEmployees` وحدها. الإتاحة تجعل كتاباً «خاصاً بمنتسبين» مرئياً لصاحبه؛
أما `Administrative` و`DirectorOnly` فوصفهما أنهما لا يظهران للمنتسبين أصلاً، فإتاحة كتاب أحدهما
لمنتسب لا تُبطل وصفه الأمني. الصواب تصحيح النطاق إلى `SpecificEmployees` ثم الإتاحة.

**قرار `attachAccessScope`:** لا يرفض طلباً — هو تصفية لا بوابة. رفض طلب كامل لنقص نطاق سجل واحد
كان سيخلق 403 بلا معنى للقراءات المسموحة.

### 2.2 قواعد الرؤية حسب الدور

| الدور | `transactionScopeFilterFor` | النتيجة |
|---|---|---|
| `admin` (§10.1) | `null` | كل النطاقات، بلا قيد |
| `director` (§10.2) | `null` | كل النطاقات، بلا قيد (إشرافي اطلاعي) |
| `employee` بلا `employeeId` | `{ visibilityIn: ['PublicToEmployees'] }` | الأعمام العامة فقط |
| `employee` له `employeeId` (§10.3) | `{ visibilityIn: ['PublicToEmployees'], availableToEmployeeId, availabilityScope: 'SpecificEmployees' }` | الأعمام العامة + المَتاح له |
| أي دور آخر (`archivist`، `guest`) | `{ visibilityIn: [] }` | **fail-closed: لا يرى أي كتاب** |

`null` تعني «بلا قيد» — وهي للمسؤول والمدير فقط. أي قيمة أخرى يجب تمريرها إلى الاستعلام.
والفرق بين «القيد الفارغ» و«نسيان القيد» هو الفرق بين `FALSE` وبين استعلام بلا شرط.

### 2.3 تصفية النطاق على مستوى SQL — `server/src/repositories/transactionScopeSql.ts` (جديد)

الصيغة الوحيدة المستعملة في مستودع الكتب ومستودع الروابط:

```sql
(visibility #>> '{}') = ANY($n::text[])
OR ((visibility #>> '{}') = $s AND EXISTS (
      SELECT 1 FROM transaction_availability a
      WHERE a.transaction_id = <alias>.id
        AND a.employee_id = $e
        AND a.revoked_at IS NULL
   ))
```

- `visibility` عمود `jsonb`؛ استخراج النص بـ`#>> '{}'`. أي شكل غير متوقع لا يطابق شيئاً ⇒ fail-closed.
- الإتاحة تُقرأ من الصف **غير المسحوب فقط**، وتُشترط لها قيمة `availabilityScope`؛ بغيابها لا تُطبَّق.
- **لا مسار مرئي = `FALSE`**، لا «بلا قيد» — وهو حارس يضمن أن نسيان القيد لا يحوّله إلى قراءة كاملة.
- كل المعاملات parameters مرقّمة (`$n`) — لا دمج نصي.

### 2.4 حجب الوجود: 404 لا 403

### 2.5 جدول الإتاحة — `server/migrations/0006_access_scope.sql` (جديد)

```sql
CREATE TABLE transaction_availability (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    employee_id    uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    granted_at     timestamptz NOT NULL DEFAULT now(),
    revoked_at     timestamptz,
    CONSTRAINT transaction_availability_revoke_after_grant
        CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

CREATE UNIQUE INDEX transaction_availability_active_unique
    ON transaction_availability (transaction_id, employee_id)
    WHERE revoked_at IS NULL;      -- فهرس جزئي: إتاحة سارية واحدة لكل (كتاب، منتسب)

CREATE INDEX transaction_availability_transaction_id_idx ON transaction_availability (transaction_id);
CREATE INDEX transaction_availability_employee_id_idx    ON transaction_availability (employee_id);
```

- **علاقة مستقلة عن الربط** (`transaction_employees` / BR-05): §29 يميّز «مرتبط» و«متاح»، و§9.4
  تسند الإتاحة الجماعية إلى المرتبطين — فالربط شرط سابق للإتاحة الجماعية لا بديل عنها.
- **السحب لا يحذف**: يملأ `revoked_at`، فالتاريخ محفوظ (§9.3)، ويُرفع قيد «إتاحة سارية واحدة»

### 2.6 المستودعات

| الملف | التغيير |
|---|---|
| `repositories/availabilityRepository.ts` (جديد) | `PgTransactionAvailabilityRepository`: `listByTransaction` (الساري + المسحوب معاً، الأحدث أولاً) · `grant` (`UNNEST` + `ON CONFLICT … WHERE revoked_at IS NULL DO NOTHING`) · `revoke` (تحديث واحد يخدم كل الصفوف السارية للمنتسب) |
| `repositories/transactionScopeSql.ts` (جديد) | `transactionScopeCondition()` — الصيغة الوحيدة (§2.3) |
| `repositories/transactionRepository.ts` | `findById(id, scope?)` و`list(filter, scope?)`: القيد **قبل** `ORDER BY`/`LIMIT` فلا صفحة ناقصة ولا تسرّب |
| `repositories/transactionEmployeeRepository.ts` | `listByTransaction(id, scope?)` و`listByEmployee(id, scope?)`: `JOIN transactions` عند تمرير النطاق، فالرابط يتبع رؤية كتابه |
| `repositories/contracts.ts` | `TransactionScopeFilter` · `TransactionAvailabilityRecord` · `TransactionAvailabilityRepository` · توقيعات مستودع الكتب والروابط |

ملاحظة تقنية في نفس الكوميت: `toVisibilityParam()` في `transactionRepository.ts` شدّد حفظ `visibility`
كـJSON string عند الكتابة، وصارت القراءة تمرّ بـ`toVisibility()` — فالتخزين والإخراج متسقان مع
`#>> '{}'` الذي يعتمد عليه شرط النطاق.

### 2.7 طبقة الـAPI

| الملف | التغيير |
|---|---|
| `api/dto/availability.ts` (جديد) | `TransactionAvailabilityDto` (`revokedAt` يغيب ما دامت سارية) · `GrantAvailabilityDto` (`employeeIds`) |
| `api/validation/availabilityValidators.ts` (جديد) | `transactionIdParam` · `availabilityEmployeeIdParam` · `grantAvailabilityBody` (قائمة غير فارغة، لا `null` صريح، لا حقول مجهولة) |
| `api/validation/catalogs.ts` | قائمة التحقق للنطاق صارت **مشتقّة** من `ACCESS_SCOPE_VALUES` — قائمة واحدة لا قائمتان |
| `api/services/availabilityService.ts` (جديد) | `TransactionAvailabilityApiService`: `inspect` · `grant` (يزيل التكرار، يتحقق أن كل معرّف يقابل منتسباً) · `grantToLinked` (من جدول `transaction_employees`) · `revoke` |

### 2.8 المسارات

| المسار | الصلاحية | الحالة |
|---|---|---|
| `GET /api/transactions/:id/availability` | `manage_availability` | 200 — السجل كامل (ساري + مسحوب) |
| `POST /api/transactions/:id/availability` | `manage_availability` | 201 — الصفوف المنشأة الآن |
| `POST /api/transactions/:id/availability/bulk` | `manage_availability` | 201 — كل المرتبطين |
| `DELETE /api/transactions/:id/availability/:employeeId` | `manage_availability` | 204 — سحب (لا حذف) |

الأربعة محمية بـ`requirePermission('manage_availability')` — وهي صلاحية `admin` وحده
(§9.5: المدير لا يدير حالة الإتاحة · §10.2: المدير يملك `view` فقط). النتيجة: **403** للمدير
والمنتسب على المسارات الأربعة.

`GET` inspection محمي أيضاً: كشف سجل الإتاحة (الساري والمسحوب) كشف إداري خاص لا قراءة كتاب عادية.

تركيب `attachAccessScope()` في `api/routes/index.ts`:

```text
requireSession             ← لا هوية    ⇒ 401
requireChangedSecret       ← رمز مؤقت   ⇒ 403 SECRET_CHANGE_REQUIRED
requireResourcePermission  ← دور ناقص   ⇒ 403 PERMISSION_DENIED
attachAccessScope          ← يحسب قيد النطاق ويحفظه على الطلب
→ راوترات الموارد
```

### 2.9 تطبيق النطاق على الخط الزمني والروابط

تطبيق النطاق على المداخل المشتقة كان شرطاً أمنياً لا تحسيناً: أي مسار يقرأ من `transactions` أو
`transaction_employees` بدون القيد يصير قناة تسرّب لعناوين الكتب المحجوبة.

- `TimelineApiService.forEmployee` يمرّر `TransactionScopeFilter` إلى مستودع الكتب **و** مستودع الروابط.
- `transactionController` و`linkController` و`timelineController` تمرّر `transactionScopeOf(req)`
  إلى `listByTransaction` و`listByEmployee` و`findById`.

### 2.10 ما لم يُلمس

---

## 3. الملفات

### مُضاف

| الملف | الدور |
|---|---|
| `server/migrations/0006_access_scope.sql` | جدول `transaction_availability` + الفهارس |
| `server/src/authorization/accessScope.ts` | قيم النطاق · حساب القيد · وسيط الطلب |
| `server/src/repositories/transactionScopeSql.ts` | الصيغة SQL الوحيدة لقيد النطاق |
| `server/src/repositories/availabilityRepository.ts` | مستودع الإتاحة (منح · منح جماعي · سحب · فحص) |
| `server/src/api/dto/availability.ts` | DTOs الإتاحة |
| `server/src/api/validation/availabilityValidators.ts` | مُحقِّقات المسار والجسم |
| `server/src/api/services/availabilityService.ts` | `TransactionAvailabilityApiService` |
| `server/src/api/controllers/availabilityController.ts` | أربعة handlers HTTP |
| `server/tests/accessScope.test.ts` | 9 اختبارات وحدة |
| `server/tests/api/availability.test.ts` | 6 اختبارات HTTP |

### مُعدَّل (كود)

| الملف | التغيير |
|---|---|
| `server/src/api/routes/index.ts` | تركيب `attachAccessScope()` بعد `requireResourcePermission()` |
| `server/src/api/routes/resources.ts` | الحارس `availabilityGuard` + المسارات الأربعة |
| `server/src/authorization/index.ts` · `api/controllers/index.ts` · `api/dto/index.ts` · `api/validation/index.ts` · `api/services/index.ts` · `repositories/index.ts` | تصدير الوحدات الجديدة |
| `server/src/api/validation/catalogs.ts` | قائمة النطاق مشتقّة من `ACCESS_SCOPE_VALUES` |
| `server/src/api/controllers/{transaction,link,timeline}Controller.ts` | تمرير `transactionScopeOf(req)` للخدمات |
| `server/src/api/services/{transaction,link,timeline}Service.ts` | تمرير النطاق إلى المستودعات |
| `server/src/repositories/contracts.ts` | العقود الجديدة وتوقيعات النطاق |
| `server/src/repositories/transactionRepository.ts` | تصفية النطاق + `toVisibilityParam`/`toVisibility` |
| `server/src/repositories/transactionEmployeeRepository.ts` | تصفية النطاق بـ`JOIN transactions` |
| `server/src/api/dto/recordMappers.ts` | `toTransactionAvailabilityDto()` |

### مُعدَّل (اختبارات)

| الملف | التغيير |
|---|---|
| `server/tests/db/testDb.ts` | عدّاد الجداول وترحيل `transaction_availability` |
| `server/tests/db/migrations.test.ts` | عدد الإصدارات 6 · تغطية up/down للجدول الجديد |
| `server/tests/authorization.test.ts` | اختبار `manage_availability` للمدير والمنتسب والمسؤول |
| `server/tests/scope.test.ts` | استبدال حارس «Access Scope لم يبدأ» بحارس تنفيذ، وحارس جديد لـPhase 14/15 |

### مُعدَّل (توثيق)

| الملف | التغيير |

---

## 4. الاختبارات والنتائج

### 4.1 وحدة النطاق — `server/tests/accessScope.test.ts` (9)

| # | الاختبار | ما يثبته |
|---|---|---|
| 1 | قيم النطاق هي الأربعة بالضبط (§12) | لا قيمة خامسة ولا نقص |
| 2 | `isAccessScope` يتحقق بدقة | يرفض `Public` و`Private` و`null` |
| 3 | `admin` و`director` يرون كل الكتب (`null`) | §10.1 و§10.2 |
| 4 | `employee` بلا معرّف: `PublicToEmployees` فقط | §9.1 |
| 5 | `employee` بمعرّف: عام + `SpecificEmployees` بإتاحة | §9.3 |
| 6 | fail-closed: دور مجهول ⇒ `{ visibilityIn: [] }` | لا مسار مفتوح |
| 7 | `attachAccessScope` + `transactionScopeOf` | الوسيط يكتب ويقرأ على `res.locals` |
| 8 | شروط النطاق + الإتاحة ⇒ SQL متماسك وبارامترات صحيحة | ترقيم `$n` بلا دمج نصي |
| 9 | قيد فارغ ⇒ `FALSE` | «لا صفوف» لا «بلا قيد» |

### 4.2 HTTP — `server/tests/api/availability.test.ts` (6)

| # | الاختبار | المسارات المستخدمة |
|---|---|---|
| 1 | المسؤول والمدير يرون كل النطاقات | `GET /api/transactions` · `GET /api/transactions/:id` |
| 2 | المنتسب يرى العام فقط · المحجوب **404** | `GET /api/transactions` · `GET /api/transactions/:id` |
| 3 | منح ← ظهور ← سحب ← اختفاء، والتاريخ محفوظ | `POST` · `GET` · `DELETE …/availability/:employeeId` |
| 4 | المنح بالجملة لكل المرتبطين | `POST …/availability/bulk` |
| 5 | `manage_availability`: المدير والمنتسب 403 | المسارات الأربعة |
| 6 | الخط الزمني والروابط لا تسرب كتاباً محجوباً | `GET /api/transaction-employees?employeeId=` · `GET /api/timeline?employeeId=` |

### 4.3 نتائج التشغيل الفعلي

| الفحص | النتيجة |
|---|---|
| `npm run test:server` | **82 / 82 pass** · 0 fail |
| `npm run test:db` | **43 / 43 pass** · 0 fail |
| `npm run test:api` | **113 / 113 pass** · 0 fail |
| `npm run test:all` | **238 / 238 pass** (82+43+113) · 0 fail |
| `npm run build` | PASS |

الأرقام أعلاه مقروءة من مخرجات التشغيل الفعلية (`# pass` / `# fail`) لا من تقدير.

**تصحيح مهم — `npm run lint` (= `tsc --noEmit`) لا يمر حالياً**: يخرج 6 أخطاء أنواع، كلها في
`server/tests/api/availability.test.ts` ومكتوبة أصلاً في كوميت `25b1f49` (لم تُعدَّل في هذه الوثيقة):

| السطر | الخطأ |
|---|---|
| 55 | `phoneNumber` غير موجود في `NewAccountOptions` (المفتاح الصحيح `phone`) |
| 106 | `visibility` غير موجود في `TransactionBody` |
| 175 | إسناد `JsonResponse<TransactionBody>` إلى متغيّر معلَن `ApiErrorBody` |
| 177 | `id` غير موجود على `ApiErrorBody` |
| 312 · 313 | `subject` غير موجود في `TransactionBody` |

الأثر عملي محدود: الاختبارات تُشغَّل بـ`tsx` الذي يتجاهل الأنواع، و`test:api` يمرّ كله. لكن
`npm run lint` كان يمرّ قبل هذه المرحلة، فوجود خطأ في مستودع المشروع حالة يجب إصلاحها بمهمة
مستقلة: توسيع `TransactionBody` و`NewAccountOptions` في `apiTestData.ts`، وتصحيح الأنواع المعلنة
في ملف الاختبار. هذا خارج نطاق التوثيق هذا، ولم يُلمس.

|---|---|
| `ALSQAYA_PLAN.md` | Phase 13 في جدول الحالة · نقطة الانتقال إلى Phase 14 · «تقرير الإنجاز الفعلي» في §29 |
| `PHASE_13_REPORT.md` | هذا التقرير (جديد) |


- **لا تعديل في `src/` (الواجهة React)** — ولا في `src/core/models/accessScope.ts`: قيم النطاق تُقرأ

---

## 5. تقييدات معروفة (موثّقة لا مُخفاة)

1. **`archivist` يبقى دوراً يرفضه 403 على كل مورد** (تقييد Phase 12). Phase 13 أضاف له fail-closed
   على مستوى النطاق، فلا يقرأ كتاباً حتى لو أُعطي صلاحية لاحقاً. تحويله إلى `employee` أو إزالته
   مهمة مستقلة تحتاج قراراً وظيفياً.
2. **حجب الوجود بالـ404 في القراءة المفردة**: القوائم تُصفّى ببساطة بلا صف بديل. ما دام
   404 هو المتبقي فلا يبقى تسريب.
3. **لا إشعار عند الإتاحة الجديدة** (§9.3) ولا **سجل اطلاع** (§9.2) — متأخران إلى Phase 21/15.
4. **`grantToLinked` بلا مرتبطين** يعيد قائمة فارغة و**201** بلا خطأ: العملية صحيحة ونتيجتها صفر
   (§9.4 لا تُلزم بوجود مرتبطين).
5. **قاعدة الإتاحة تقتصر على `SpecificEmployees`**: منح إتاحة لكتاب `Administrative` أو
   `DirectorOnly` لا يجعله مرئياً لمنتسب. هذا سلوك مقصود (§2.1) لا نقص.
6. **لا واجهة React للإتاحة أو النطاق**: لا زر ولا شاشة. الفرض كله على الخادم كما يقتضي §12 و§28.
7. **`transactions.visibility` قد يحمل قيماً خارج الأربع** في بيانات قديمة (لا قيد CHECK على العمود).
   `isAccessScope` ترفضها وSQL لا يطابقها ⇒ لا رؤية (fail-closed). لا migration لتوحيد البيانات الآن.
8. **`npm run lint` لا يمر بسبب أخطاء أنواع في ملف اختبار Phase 13** (التفصيل في §4.3). لا أثر
   على نتيجة الاختبارات ولا على البناء، لكنه انحدار في نظافة الأنواع يجب إصلاحه بمهمة مستقلة.

---

## 6. حالة الإغلاق

- بنود §29 الأربعة للنطاقات والعمليات الأربع للإتاحة مُنفَّذة ومغطّاة باختباراتها السبعة.
- الفصل `Identity → Permission → Access Scope → Resource` مطبَّق في `api/routes/index.ts` بترتيب
  صريح مقروء في تركيب المسارات.
- التصفية على مستوى الاستعلام لا بعد قراءة البيانات؛ والحجب بالـ404 لا الـ403.
- لا تسرّب لأي تنفيذ من مراحل لاحقة: لا تخزين مركزي (Phase 14) ولا تدقيق (Phase 15)، ومجلدا
  `storage/` و`audit/` ما زالا محجوزين بحارس آلي في `scope.test.ts`.

---

## 7. الانتقال إلى Phase 14 (لم يُنفَّذ)

**Phase 14 — Attachments & Central File Storage** (§30): نقل المرفقات من Base64 إلى تخزين مركزي مع
`metadata` كاملة (stable ID · اسم أصلي · MIME · حجم · hash · storage key · OCR status · integrity)،
وحماية من path traversal والمخفوفات، ودعم مرفق واحد أو عدة لكل كتاب، واستيراد الأرشيف التاريخي
مع الإبلاغ عن الملفات غير المرتبطة.

**نقطة محسومة في هذه المرحلة وتستحق النقل**: `getTransaction` يعيد `attachments` مع الكتاب بعد
تطبيق النطاق، فالمرفقات مربوطة أصلاً برؤية كتابها. وهذا هو السلوك المطلوب في §30 «الملف يقدم عبر
Backend بعد authorization» — لكنه اليوم قراءة ضمن استجابة الكتاب، لا مسار تنزيل مستقل بعد فحص صلاحية.

  من هناك بالاستيراد فقط، ولا منطق رؤية نُقل إليه ولا منه.
- **لا مسار إسناد أدوار** ولا شاشة دخول جديدة.
- **لا تغيير في مصفوفة `ROLE_PERMISSIONS`** (Phase 12): `manage_availability` كانت معرَّفة هناك
  وانتظرت مسارها؛ Phase 13 أعطتها المسارات فقط.
- **لا إشعار عند الإتاحة** (§9.3) — الإشعارات مرحلة لاحقة (Phase 21).
- **لا سجل اطلاع** (§9.2) — مرحلة التدقيق (Phase 15).

| `api/controllers/availabilityController.ts` (جديد) | `inspectAvailability` · `grantAvailability` · `grantAvailabilityToLinked` · `revokeAvailability` |
| `api/dto/recordMappers.ts` | `toTransactionAvailabilityDto()` |
| `api/services/index.ts` | تركيب المستودع والخدمة الجديدين |

  فيصح إعادة المنح بسجل جديد بلا فقد تاريخ.
- `down` الإسقاطي: `DROP TABLE transaction_availability`.
- لم يُغيَّر عمود `transactions.visibility` (موجود منذ Phase 9/10): هذه المرحلة تقرأه وتفرضه.


`findById(id, scope)` يعيد `null` إذا لم يقع الكتاب ضمن نطاق الفاعل، فيُترجم عند الطبقة الأعلى إلى
`ResourceNotFoundError` → **404 `RESOURCE_NOT_FOUND`**.

السبب: 403 على كتاب محجوب يؤكد وجوده ومخالفته للنطاق، و404 لا يمنح أي معلومة.
و403 محجوز لغياب **الصلاحية** على العملية — قاعدتان منفصلتان لا تختلطان.

