# PHASE_19_REPORT — Requests + Workflow

> المرجع الملزم: `ALSQAYA_PLAN.md` §35 (مع §7.12 · §10.2 · §10.3 · §12 · §18 ·
> §19 · §28 · §31 · §32 · §33 · §53 · §54 · §56 · §57).
> هذا التقرير يتبع بروتوكول §53 ولا يعيد تعريف المرحلة ولا يوسّعها.
> **لا تُنفَّذ أي مرحلة لاحقة** (§60: لا انتقال تلقائي) — وUI-06 لم تُنفَّذ.

---

## 1. حالة المرحلة

**مكتملة ومختبرة، مع خمسة قرارات أعمال لم تحسمها الخطة ولم تُخترع لها سلوك**
(§5 بالتفصيل). بنود §35 نُفِّذت نصّاً:

| بند §35 | الحالة | الموضع |
|---|---|---|
| الأنواع: عامة · أجهزة/معدات · إجازة · زمنية | ✅ | قيد `requests_kind_check` (ترحيل 0012) + `REQUEST_KINDS` |
| الحالات السبع | ✅ | `REQUEST_STATUSES` + قيد `requests_status_check` |
| submit | ✅ | `draft → submitted` في `REQUEST_TRANSITIONS` |
| approve | ✅ | `submitted`/`clarification_requested` → `approved` |
| reject | ✅ | `submitted`/`clarification_requested` → `rejected` |
| clarification | ✅ | `→ clarification_requested` بسؤال إلزامي |
| employee reply | ✅ | `clarification_requested` → نفسها (الرد لا يقرّر) |
| cancellation rules | ⚠️ جزئي | انتقال إلى `cancelled` بلا أثر؛ **شروط الإلغاء TBD** (§5.4) |
| permission tests | ✅ | `server/tests/api/requests.test.ts` (21 حالة) |
| «القرار ليس CRUD» (§10.2) | ✅ | `requireRequestWorkflowPermission` يفرض `approve_request` على أفعال المدير |
| «تاريخ التغييرات» (§18) | ✅ | جدول `request_status_history` + `history` في استجابة الطلب |

---

## 2. الملفات التي تغيرت

### جديد — القاعدة (1)
`server/migrations/0012_requests_workflow.sql` — إضافة فقط فوق 0004:
توسيع `requests.kind` إلى الأنواع الأربعة · توسيع `requests.status` إلى
الحالات السبع · `requests.version` + قيد موجب · جدول
`request_status_history` وفهرسه. تراجع نظيف يعيد القيود الأصلية.

### جديد — الخادم (10)
`server/src/services/requestWorkflow.ts` (جدول الانتقالات + الحالات +
`availableActions`) · `server/src/services/requestErrors.ts` ·
`server/src/authorization/requestScope.ts` ·
`server/src/repositories/requestRepository.ts` ·
`server/src/api/dto/request.ts` · `server/src/api/validation/requestValidators.ts` ·
`server/src/api/services/requestService.ts` ·
`server/src/api/controllers/requestController.ts` ·
`server/src/api/routes/requestRoutes.ts`.

### جديد — الاختبارات (3)
`server/tests/requestWorkflow.test.ts` (12) ·
`server/tests/db/requestWorkflow.test.ts` (12) ·
`server/tests/api/requests.test.ts` (21).

### مُعدَّل — الخادم (11)
`server/src/authorization/requirePermission.ts` (وسيط
`requireRequestWorkflowPermission` + استثناء مسار `view`) ·
`server/src/authorization/index.ts` · `server/src/api/routes/index.ts`
(تركيب `/api/requests` + `attachRequestScope`) ·
`server/src/api/routes/resourceRoutes.ts` · `server/src/api/controllers/index.ts` ·
`server/src/api/validation/index.ts` · `server/src/api/validation/catalogs.ts` ·
`server/src/api/dto/index.ts` · `server/src/api/services/index.ts` ·
`server/src/api/services/auditService.ts` (3 أحداث للطلبات) ·
`server/src/repositories/contracts.ts` · `server/src/repositories/index.ts` ·
`server/src/services/index.ts`.
---

## 3. الملفات التي لم تُمسّ عمداً

- **`server/migrations/0004_operations_logs.sql`** — مُطبَّق؛ تعديله يكسر
  `checksum`. كل إضافة في `0012`.
- **`server/src/authorization/permissions.ts`** — **لا صلاحية ولا دور جديد**.
  المصفوفة كما في Phase 12 بالضبط (اختبار صريح في `requests.test.ts`).
- **`server/src/audit/auditTypes.ts`** — **لا `AuditEventKind` جديد**؛ يُستعمل
  `create` و`update` و`status_change` فقط (قائمة §31 مقفولة).
- **مكوّنات React / `src/App.tsx`** — لا شاشة ولا تنقّل ولا Dashboard.
  Phase 19 نطاق الخادم؛ UI-06 مرحلة منفصلة.
- **`src/services/requestService.ts`** (نموذج أولي في العميل) — لم يُحذف ولم
  يُعدَّل: هو نموذج نطاق مرجعي، وليس مصدر الحقيقة بعد الآن.
- **قواعد الإجازات والزمنيات** — لم تُعدَّل؛ `approved` لا يُنشئ سجلاً ولا
  حركة رصيد (§5.2).

---

## 4. قرارات تقنية (داخل حدود الخطة)

| القرار | السند |
|---|---|
| `kind` عمود مستقل عن `payload` | §35 «النوع» + الفصل بين الطلب والسجل (§18)؛ والعمود موجود منذ Phase 9 |
| مسار واحد `/workflow` والإجراء في الجسم | الفرق بين approve وreject وreply فرق في **القاعدة** لا في المسار؛ وقاعدتها مكان واحد |
| `approve_request` بفرض صريح داخل الراوتر لا بخريطة method | §10.2 «إجراء Workflow خاص … وليس CRUD عام»؛ لولا ذلك لما استطاع `director` الاعتماد لأن `POST` = `create` وهي `admin` وحده |
| جدول `request_status_history` | §18 يطلب «تاريخ التغييرات» نصّاً، و`clarification`/`director_decision` يحملان الحالة الراهنة لا التاريخ |
| `expectedVersion` إلزامية في كل كتابة على الطلب | Phase 17 (§33) نفس نمط `transactions` |
| 409 لا 400 لانتقال غير مسموح | الجسم صحيح؛ **الحالة** هي ما يرفض |
| `404` لا `403` لطلبٍ خارج النطاق، ولطلبٍ ليس مسوّداً | §12 «حجب وجود» + سلوك Phase 16/17 نفسه |
| فحص مزدوج للانتقال (خدمة + مستودع) | الخدمة واجهة المصدر؛ والمستودع يمنع الكتابة المباشرة عليه. النتيجة خطأ واحد |
| `availableActions` في الاستجابة | §35 «الإجراءات المسموحة»؛ تُحسب من الجدول نفسه فلا تتقادم ولا تُنفَّذ في React |

---

## 5. قرارات لم تُحسم — Business Rule Blockers / TBD

هذه **لم تُحسم في الخطة**، ولم يُخترع لها سلوك (§4 «لا اختراع لقواعد الأعمال»).

### 5.1 صلاحية صاحب الطلب (submit · employee reply · cancel) — TBD

**التعارض:** §10.3 يمنح المنتسب `view` فقط، و§28/Phase 12 لا يمنحه `create`
ولا `update`؛ لكن §18 و§35 يصفان أن «المنتسب يرسل الطلب» و«employee reply»
عملية من عملياته.

**ما نُفِّذ:** أفعال صاحب الطلب تمرّ على خريطة `method ← family` القائمة
(`POST` ⇒ `create`) ⇒ **المسؤول وحده** اليوم. ولا صلاحية جديدة ولا تعديل
للمصفوفة.

**ما يلزم قراراً:** هل يُمنح المنتسب صلاحية، أم مساراً منفصلاً بلا صلاحية
عامة؟ **الأثر:** اليوم لا يستطيع منتسب إرسال طلبه أو الردّ على توضيح بنفسه.

### 5.2 أثر `approve` على السجلات الفعلية — TBD

**السؤال:** هل `approved` ينشئ `Leave`/`TimePermission` أو يربطهما؟

**ما نُفِّذ:** **لا شيء**. الاعتماد يغيّر حالة الطلب فقط، و
`linked_leave_id`/`linked_time_permission_id` يبقيان `NULL`، ولا يُنشأ
`leave_ledger` ولا سطر `leaves` ولا `time_permissions` (اختبار صريح في
`db/requestWorkflow.test.ts`). §18 تنصّ فقط أن الطلب «يرتبط» بالسجلات
الفعلية ولا يستبدلها — ولا تربط.

### 5.3 `under_review` — TBD

الحالة معتمدة في §35 لكن **لا نصّ يحدّد أي عملية تنقل الطلب إليها ولا من
يحق له ذلك**. لذلك: تُقبل في قيد القاعدة وتُقرأ، و`availableActions`
لها قائمة فارغة، و**لا مسار ينتجها**.

### 5.4 شروط الإلغاء — TBD جزئي

§35 تذكر «cancellation rules» **كاختبار مطلوب** لا كقاعدة نصّية. فالمُنفَّذ
هو الحدّ الأدنى غير المخترَع: انتقال `→ cancelled` من الحالات المفتوحة
فقط، **بلا أي أثر** على أي سجل آخر (لا عكس خصم، لا حذف). «من يحقّ له
ومتى» غير محسومين.

### 5.5 حمولة `general` و`equipment` — TBD جزئي

الأنواع معتمدة في §35 لكن **حقول حمولتها غير محددة في نصّ الخطة** ⇒ تُقبل
ككائن JSON وتُحفظ كما أُرسلت بلا قواعد مخترَعة. `leave` و`time_permission`
لهما عقد نموذج المجال ففُحصان فحصاً كاملاً.

---

## 6. API Changes

| الطريقة | المسار | الصلاحية | ملاحظة |
|---|---|---|---|
| GET | `/api/requests` | `view` | مفلترة + نطاق (§10.3) |
| GET | `/api/requests/:id` | `view` | الطلب + `history` + `availableActions` |
| POST | `/api/requests` | `create` | ينشئ `draft` — **لا `status` من العميل** |
| PATCH | `/api/requests/:id` | `update` | مسوّد فقط + `expectedVersion` |
| POST | `/api/requests/:id/workflow` | بحسب الإجراء | `expectedVersion` + `action` إلزاميان |
| — | `DELETE /api/requests/:id` | — | **غير موجود** (§32) |

**رمز خطأ جديد واحد:** `REQUEST_TRANSITION_NOT_ALLOWED` (409). —
`VERSION_CONFLICT` (409) و`RESOURCE_NOT_FOUND` (404) و`PERMISSION_DENIED`
(403) و`VALIDATION_ERROR` (400) قائمة قائمة.

---

## 7. Database changes

ترحيل واحد `0012`، إضافة فقط، تراجع نظيف:

| التغيير | التفصيل |
|---|---|
| `requests.kind` | CHECK موسَّع إلى `('general','equipment','leave','time_permission')` |
| `requests.status` | CHECK موسَّع إلى الحالات السبع |
| `requests.version` | `integer NOT NULL DEFAULT 1` + `CHECK (version >= 1)` |
| `request_status_history` | `id · request_id(FK RESTRICT) · from_status · to_status · action · actor_user_id(SET NULL) · actor_employee_id(SET NULL) · comment · created_at` + فهرس `(request_id, created_at, id)` |

**لا مساس بأي بيانات قائمة** ولا بأي ترحيل مُطبَّق (12 ترحيلاً · 23 جدولاً).

### مُعدَّل — نموذج المجال والواجهة (3)
`src/core/models/request.ts` (الأنواع الأربعة · الحالات السبع ·
`RequestWorkflowAction` · `RequestStatusHistoryRecord` · `kind` كعمود مستقل) ·
`src/core/models/personnelCatalogs.ts` (كتالوجات النصوص + نصوص العمليات) ·
`src/data/mockData.ts` (إضافة `kind` لبيانات النموذج — **TypeScript فقط**).

### مُعدَّل — الاختبارات (3)
`server/tests/db/migrations.test.ts` (12 ترحيلاً · 23 جدولاً · تراجع 0012) ·
`server/tests/db/testDb.ts` · `server/tests/errors.test.ts` (المسار صار منفَّذاً).
---

## 8. Workflow transitions

| الإجراء | من | إلى | الصلاحية المطلوبة اليوم |
|---|---|---|---|
| `create` | — | `draft` | `create` |
| `submit` | `draft` | `submitted` | `create` (Blocker §5.1) |
| `request_clarification` | `submitted` · `clarification_requested` | `clarification_requested` | `approve_request` |
| `employee_reply` | `clarification_requested` | `clarification_requested` | `create` (Blocker §5.1) |
| `approve` | `submitted` · `clarification_requested` | `approved` | `approve_request` |
| `reject` | `submitted` · `clarification_requested` | `rejected` | `approve_request` |
| `cancel` | `draft` · `submitted` · `clarification_requested` | `cancelled` | `create` (Blocker §5.1) |

**الحالات النهائية** (`approved` · `rejected` · `cancelled`): صفر انتقال خارجها
(اختبار صريح: `FINAL` × كل الإجراءات = `[]`).
**`under_review`**: معتمدة بلا مُنتِج (§5.3) — `availableActions` لها فارغة.

**كل انتقال يكتب صفَّه في `request_status_history`** داخل نفس المعاملة، فالتاريخ
كامل ودائم ولا يُحذف (§18 · §32).

---

## 9. Permission checks

| الدور | قراءة | إنشاء/تعديل | قرار المدير | أفعال صاحب الطلب |
|---|---|---|---|---|
| `admin` (§10.1) | ✅ | ✅ | ❌ `403` | ✅ (خريطة method) |
| `director` (§10.2) | ✅ | ❌ `403` | ✅ | ❌ `403` |
| `employee` (§10.3) | طلباته وحدها | ❌ `403` | ❌ `403` | ❌ `403` |

بلا هوية ⇒ `401` (لا `403`). الطلب خارج النطاق ⇒ `404` (لا كشف وجود).
اختبار صريح: `director` لا يستطيع `POST /api/employees` بـ`approve_request`.
كل الرفضات تمرّ عبر `fetch` مباشر بلا أي مكوّن React (§28).

---

## 10. Audit behavior

| العملية | الحدث | ملاحظة |
|---|---|---|
| إنشاء الطلب | `create` | بعد نجاح العملية لا داخلها |
| تعديل مسوّد | `update` | `action: 'update_draft'` |
| كل انتقال حالة | `status_change` | `old_values.status` من الصف المقروء قبل الكتابة |
| **كل قراءة** | — | **بلا حدث** (§31) |

لا `AuditEventKind` جديد؛ الفاعل من هوية الجلسة لا من جسم الطلب.

---

## 11. Concurrency behavior

`version` على الطلب + `expectedVersion` إلزامية في كل كتابة. `UPDATE` واحدة
مقيدة بـ`version = expectedVersion` و`version = version + 1` ( ومع
`status` المتوقَّعة في `transition`، و`status = 'draft'` في `update`).
صفر صفوف ⇒ `notFound` (404) · `stale` (409 `VERSION_CONFLICT`) ·
`notAllowed` (409 قاعدة). **لا كتابة فوق الأحدث ولا نجاح صامت.**
اختبار: نسخة قديمة ⇒ 409 وثلاثة صفوف تاريخ فقط.

---

## 12. Tests

| الملف | العدد | يغطّي |
|---|---|---|
| `server/tests/requestWorkflow.test.ts` | 12 | الحالات السبع · كل انتقال مسموح/ممنوع · الحالات النهائية · `under_review` · `availableActions` · أفعال المدير |
| `server/tests/db/requestWorkflow.test.ts` | 12 | الذرّية · القفل · المسوّد فقط · الإلغاء بلا حذف · النطاق · CHECK (23514) · FK/RESTRICT/SET NULL · لا سجل فعلي بعد الاعتماد |
| `server/tests/api/requests.test.ts` | 21 | المسار الكامل · الصلاحيات · استدعاء مباشر · 400 لأجسام مشوّهة · 409 لانتقال غير مسموح · 409 لتعارض نسخة · النطاق 404 · التدقيق · 401 |

**نتائج التشغيل الكاملة:**

| الفحص | النتيجة |
|---|---|
| `npm run lint` (`tsc --noEmit`) | ✅ نظيف |
| `npm run build` | ✅ نجح |
| `npm run test:server` | ✅ 174 / 174 |
| `npm run test:db` | ✅ 105 / 105 |
| `npm run test:api` | ✅ 194 / 194 |
| `npm run test:all` | ✅ 473 / 473 |

بلا `as any` · بلا `@ts-ignore` · بلا تعطيل `strict` أو lint · بلا حذف
اختبار فاشل · بلاskip.

---

## 13. Known limitations

1. **صلاحية صاحب الطلب** غير محسومة (§5.1) — الأثر: لا يستطيع منتسب إرسال
   طلبه ذاتياً أو الردّ على توضيح.
2. **الاعتماد لا يُنشئ سجلاً فعلياً** ولا يربطه (§5.2).
3. **`under_review` غير قابلة للوصول** كحالة (§5.3).
4. **شروط الإلغاء جزئية**: الانتقال مكتمل، «من ومتى» غير محسومين (§5.4).
5. **حمولة `general`/`equipment` حرة** بلا قواعد (§5.5).
6. `PATCH` المسوّد لا يغيّر النوع ولا صاحب الطلب (بلا قاعدة معتمدة لتغيير
   صاحب طلب أثناء المسودة).

---

## 14. Deviations

| # | الانحراف | السبب |
|---|---|---|
| 1 | `requests.kind` CHECK موسَّع إلى 4 أنواع | §35 تنصّ عليها صراحةً؛ والعمود موجود من Phase 9 بقيدَين |
| 2 | جدول `request_status_history` جديد | §18 تطلب «تاريخ التغييرات»؛ `clarification` حالة راهنة لا تاريخ |
| 3 | `requireRequestWorkflowPermission` وسيط خاص | خريطة `method` تعطي `POST = create` (admin) بينما صاحب `approve_request` هو `director`؛ بالاستثناء فقط كان الفرض غامضاً |
| 4 | تعديل `mockData.ts` و`personnelCatalogs.ts` في `src/` | **TypeScript فقط** (اكتمال `Record<Union,string>` و`Request.kind`)؛ لا سلوك واجهة ولا شاشة |
| 5 | تعديل `errors.test.ts` و`migrations.test.ts` | حارسا «المرحلة القادمة»: صار `/api/requests` منفَّذاً والترحيلات 12؛ لم يُحذف أي اختبار |

---

## 15. Git

- **الفرع:** `phase-10-api-data-layer` (فرع العمل الحالي؛ لم يُنشأ فرع جديد
  لأن المهمة لم تطلب ذلك ولم تأمر بدمج).
- **الالتزام:** يُسجَّل بعد `git commit` مباشرةً في هذا القسم.

**لا انتقال إلى Phase 20 ولا إلى أي مرحلة UI.**
`server/tests/scope.test.ts` **لم يُعدَّل** — لم تنكسر أي حمايته.