# PHASE_16_REPORT — Soft Delete + Data Integrity

> المرجع الملزم: `ALSQAYA_PLAN.md` §32 (+ §13 و§28 و§9.3 و§30 و§31).
> هذا التقرير يتبع بروتوكول §53 (عشرة بنود). لا يعيد تعريف المرحلة ولا يوسّعها.

---

## 1. حالة المرحلة

**مكتملة ومختبرة.** المتطلبات المنصوص عليها في §32 نُفِّذت دون تعديل أو تخفيض:

| بند §32 | الحالة | الموضع |
|---|---|---|
| `deletedAt` | ✅ | `transactions.deleted_at` (الترحيل 0009) |
| `deletedBy` | ✅ | `transactions.deleted_by` → `users(id)` بـ`SET NULL` |
| سبب الحذف عند الحاجة | ✅ | `delete_reason` نص حر اختياري + مُحقِّق `?reason=` |
| `restore where allowed` | ✅ | `POST /api/transactions/:id/restore` خلف `delete_archive` |
| FK restrictions | ✅ | القيود الثلاثة نحو `transactions`: `CASCADE` → `RESTRICT` |
| unique constraints | ✅ بلا تغيير | روابط · إتاحة جزئية · `storage_key` · اطلاع (مُتحقَّق منها) |
| historical preservation | ✅ | لا `DELETE` في طبقة المستودع؛ كل التصفية داخل الاستعلام |
| Employee → former بلا حذف | ✅ (كان منفَّذاً) | `POST /:id/status` — أُكّد ولم يُعَد بناؤه |
| Transaction لا يُحذف نهائياً | ✅ | الأرشفة `UPDATE` بشرط، لا `DELETE` |
| archive preserves relations | ✅ | `softDelete.test.ts` (HTTP) + `db/softDelete.test.ts` |
| restore | ✅ | هو نفسه + دورة `archive → restore → archive` |
| deleted records excluded from active views | ✅ | `findById`/`list`/الروابط/الخط الزمني/المرفقات/الإتاحة/الاطلاع |
| historical query for authorized admins | ✅ | `GET /api/transactions/archived` خلف `delete_archive` |

---

## 2. الملفات التي تغيرت

### جديد — القاعدة (1)
`server/migrations/0009_transaction_soft_delete.sql`

### جديد — الاختبارات (2)
`server/tests/db/softDelete.test.ts` (6) · `server/tests/api/softDelete.test.ts` (10)

### مُعدَّل — المستودعات (2)
`repositories/contracts.ts` (الحقول · `TransactionReadOptions` · `ArchiveTransactionInput` ·
`archive`/`restore` · `archived` في الفلترة) · `transactionRepository.ts` (الأعمدة · الاستبعاد
داخل الاستعلام · `archive`/`restore`).

`repositories/transactionEmployeeRepository.ts` — `JOIN` دائم مع `t.deleted_at IS NULL`
(قبلها كان `JOIN` للنطاق فقط، فكان المؤرشف يظهر لأصحاب النطاق غير المقيَّد).

### مُعدَّل — الـAPI (6)
`dto/transaction.ts` (الحقول + `ArchiveTransactionQuery`) · `dto/recordMappers.ts` ·
`services/transactionService.ts` (`archive`/`restore`/`listArchived`) ·
`services/auditService.ts` (`recordTransactionArchive`/`recordTransactionRestore`) ·
`controllers/transactionController.ts` (ثلاثة handlers) ·
`routes/resources.ts` (ثلاثة مسارات + حارس) · `validation/transactionValidators.ts`
(مُحقِّق الأرشفة).

### مُعدَّل — الاختبارات (2)
`tests/db/migrations.test.ts` (8 ← 9 إصدارات وسلسلة تراجع) · `tests/api/transactions.test.ts`
(اختبار «لا مسار حذف» صار يقيس **الأثر** بدل رمز 404 على مسار لم يعد موجودًا).

### مُعدَّل — التوثيق (3)
`ALSQAYA_PLAN.md` · `README.md` · `PHASE_16_REPORT.md`

---

## 3. الملفات التي لم تتغير ولماذا

| الملف | السبب |
|---|---|
| `server/migrations/0001`–`0008` | ترحيلات مُطبَّقة (checksum يرفض التعديل) |
| `repositories/attachmentRepository.ts` · `storage/**` | لا حذف ملفي: المرفق يبقى كما هو (§30) |
| `audit/**` · `auth/**` | Phase 15 مكتملة؛ استُخدمت فقط (لا نظام تدقيق جديد) |
| `authorization/permissions.ts` | المصفوفة من Phase 12 وفيها `delete_archive` أصلاً |
| `repositories/employeeRepository.ts` | §13 منفَّذ في Phase 10 (`former`) |
| `src/**` (React) | لا شاشة في §32؛ المنع على الخادم |
| `server/tests/api/availability.test.ts` | 6 أخطاء أنواع قديمة من Phase 13 — خارج النطاق |
| `Architecture.md` | قديم منذ Phase 13 أصلاً (موثّق في تقرير Phase 15) |

---

## 4. Migration الجديدة

`0009_transaction_soft_delete.sql` — **إضافة فقط**، قابلة للتطبيق والتراجع:

```sql
ALTER TABLE transactions
    ADD COLUMN deleted_at    timestamptz,
    ADD COLUMN deleted_by    uuid REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN delete_reason text,
    ADD CONSTRAINT transactions_delete_reason_requires_archive
        CHECK (delete_reason IS NULL OR deleted_at IS NOT NULL);
CREATE INDEX transactions_active_idx  ON transactions (document_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX transactions_archived_idx ON transactions (deleted_at DESC)      WHERE deleted_at IS NOT NULL;
-- تقييد الحذف الفعلي: CASCADE ← RESTRICT
ALTER TABLE transaction_employees / attachments / transaction_availability ...
```

`down` يعيد `CASCADE` ويحذف الفهارس والأعمدة والقيد. **أمان البيانات**: كل الأعمدة
nullable والقيد يمرّ على كل صف قائم (القيم NULL)؛ تغيير قيد FK لا يمسّ أي صف.

---

## 5. Soft Delete behavior

| العملية | API | الأثر في القاعدة |
|---|---|---|
| أرشفة | `DELETE /api/transactions/:id?reason=` | `UPDATE … SET deleted_at=now(), deleted_by, delete_reason WHERE id=$1 AND deleted_at IS NULL` |
| استعادة | `POST /api/transactions/:id/restore` | `UPDATE … SET deleted_at=NULL, deleted_by=NULL, delete_reason=NULL WHERE id=$1 AND deleted_at IS NOT NULL` |
| أرشيف إداري | `GET /api/transactions/archived` | قائمة `WHERE deleted_at IS NOT NULL` (الأحدث أرشفة) |

- **لا `DELETE` في طبقة المستودع**: دالة الحذف غير موجودة في العقد ولا في التنفيذ.
- الشرط داخل جملة `UPDATE`: أرشفة مؤرشف ⇒ `0 rows` ⇒ 404 بلا كتابة (لا تصعيد
  تاريخي، ولا طابع جديد، ولا حدث تدقيق مزدوج)؛ استعادة نشط ⇒ 404 بلا تعديل.
- `archive → restore → archive`: صف واحد، نفس `id`، نفس `created_at`، نفس
  الروابط (بلا تكرار — قيد `UNIQUE` على الروابط يضمن ذلك).
- **القراءات النشطة تستبعد المؤرشف داخل الاستعلام**: `findById` و`list`
  (وكل ما يقرأ عبرهما: الخط الزمني، المرفقات، الإتاحة، الاعتراف) — والنتيجة 404
  لا كشف وجود، كغير المرئي تماماً.
- `findById(..., { includeArchived: true })` **للاستعادة فقط**.

---

## 6. Archive/Restore authorization

- `DELETE /:id` → عائلة `delete_archive` من خريطة الـmethod (Phase 12) **+**
  حارس صريح `requirePermission('delete_archive')` على المسار.
- `POST /:id/restore` → `create` من الخريطة + **نفس** الحارس.
- `GET /api/transactions/archived` → `view` من الخريطة + **نفس** الحارس.

النتيجة: **admin فقط**. `director` و`employee` يُرفضان بـ403 `PERMISSION_DENIED` على
الخادم (لا إخفاء زر في React)، وبلا جلسة 401 قبل أي فحص صلاحية. مُختبَرة في
`softDelete.test.ts` (مصفوفة × أرشفة/استعادة/قراءة أرشيف).

---

## 7. تأثير التغييرات على Foreign Keys

`ON DELETE CASCADE` → `ON DELETE RESTRICT` لثلاثة قيود فقط (كلها نحو
`transactions`): `transaction_employees` · `attachments` · `transaction_availability`.

**السبب**: الحذف الناعم صار مسار النظام الإداري الوحيد، فالحذف الفعلي لم يعد
عملية نظام؛ و`RESTRICT` يمنع أن يمحو خطأ واحد الروابط والمرفقات وسجلات الإتاحة
وسجل الاطلاع معاً. `view_logs` كان مقيَّداً بـ`RESTRICT` منذ Phase 9، فاكتمل
التقييد. **لم تُمسّ** قيود `employees` (CASCADE) لأنها خارج نطاق الكتب، ولم
تُمسّ `daily_situations`/`requests` (بلا `ON DELETE` = `NO ACTION` أصلاً).

**الاختبار**: `DELETE FROM transactions` يُرفض بـ`23503` عند وجود رابط أو مرفق
أو إتاحة أو سجل اطلاع (`db/softDelete.test.ts`).

---

## 8. تأثير التغييرات على Attachments

- **لا مساس بالتخزين المركزي**: لا استدعاء `FileStorage.remove` (لا مسار له)،
  والملفات على القرص والمفاتيح `storage_key` والبصمات `content_hash` كما هي.
- صف `attachments` لا يُحذف (قيد `RESTRICT`)، وبياناته تُقرأ مع الكتاب المؤرشف
  عبر `includeArchived` داخل مسار الاستعادة.
- **مسارات المرفقات النشطة تردّ 404 للكتاب المؤرشف** — لأن `requireVisibleTransaction`
  يقرأ الكتاب بقاعدة النشط. هذا سلوك مقصود: الكتاب المؤرشف خارج الرؤية النشطة،
  والبيانات محفوظة وقابلة للاستعادة كاملة (مُختبَر: التنزيل بعد الاستعادة 200).

---

## 9. تأثير التغييرات على View/Acknowledgement

- الأرشفة **لا تمس** `view_logs` (بلا مسار حذف، وقيد `RESTRICT`).
- الاعتراف على كتاب مؤرشف يعيد 404 (الكتاب غير مرئي) — لا يُنشأ اعتراف جديد.
- بعد الاستعادة: **نفس** صف الاعتراف، بنفس `acknowledged_at` — لا تكرار ولا
  `reset`. مُختبَر بعدّ الصفوف في القاعدة عبر دورة الأرشفة والاستعادة.

---

## 10. Audit events

| العملية | `event_kind` | `entity_kind` | `new_values` | `old_values` |
|---|---|---|---|---|
| أرشفة | `archive` | `transaction` | `deletedAt` · `deletedBy` · `deleteReason` · `action: archive` | `deletedAt: null` · `deletedBy: null` |
| استعادة | `update` | `transaction` | `deletedAt: null` · `action: restore` | طوابع الأرشفة السابقة |

- **بلا نوع حدث جديد**: قائمة §31 (وقيد CHECK في 0004) لا تتضمن `restore`، ولم
  يُعدَّل القيد؛ الاستعادة `update` بقيمتها قبل/بعد — قرار تقني موثّق.
- الفاعل `actor_user_id` من `req.auth` (Phase 15) لا من الطلب؛ وسياق الجلسة
  يمرّ بـطبقة التدقيق نفسها.
- الأحداث تظهر في `GET /api/audit-logs` (محميّ بـ`view_audit_logs`)، ولا مسار
  تعديل أو حذف لسجل التدقيق (Phase 15) — لم يُمسّ في هذه المرحلة.

---

## 11. الاختبارات

| الفحص | النتيجة |
|---|---|
| `npm run lint` | ⚠️ **6 أخطاء قديمة فقط** (Phase 13) — صفر خطأ من Phase 16 |
| `npm run build` | ✅ `1728 modules transformed` · `built in 13.13s` |
| `npm run test:server` | ✅ **117 / 117** (بلا تغيير) |
| `npm run test:db` | ✅ **49 / 49** (كان 43) |
| `npm run test:api` | ✅ **149 / 149** (كان 139) |
| `npm run test:all` | ✅ **315 / 315** |

### تغطية §32

| بند الاختبار | الاختبار |
|---|---|
| archive preserves relations | `الأرشفة تحفظ المرفقات والروابط وسجل الاطلاع في القاعدة` |
| restore | `الاستعادة: الكتاب نفسه يعود بهويته ومرفقاته وبياناته` |
| deleted records excluded from active views | `الأرشفة: 200 … مستبعَد من القائمة النشطة` (GET مفرد 404) |
| historical query for authorized admins | `الاستعلام التاريخي: قائمة الأرشيف لمسؤول السقاية فقط` |
| archive لا يحذف الصف | نفس الاختبار + عدّ الصفوف في `db/softDelete.test.ts` |
| archive → restore → archive | `archive → restore → archive: الهوية والعلاقات والتاريخ سليمة` |
| صلاحيات الأرشفة/الاستعادة | `مصفوفة الصلاحيات…` + `بلا جلسة ⇒ 401…` |
| المرفقات لا تُحذف | عدّ `attachments` + `storageKey`/`contentHash` باقيان + تنزيل بعد الاستعادة |
| سجلات الاطلاع لا تُحذف | عدّ `view_logs` قبل/بعد |
| Audit للأرشفة والاستعادة | `التدقيق: حدث archive… وحدث update(action=restore)…` |
| FK/Unique migration up & down | `db/softDelete.test.ts` (6) + سلسلة التراجع في `migrations.test.ts` |
| الموظف لا يُحذف | `الموظف لا يُحذف (§13)…` |

---

## 12–16. المشاكل والقرارات

### 12. Typecheck
`tsc --noEmit` على كل ملفات Phase 16: **نظيف**. الأخطاء الستة الباقية كلها في
`server/tests/api/availability.test.ts` (انظر 13).

### 13. Lint
`npm run lint` = `tsc --noEmit` ⇒ **يفشل بستة أخطاء قديمة** (Phase 13، موثّقة في
`PHASE_13/14/15_REPORT`): `phoneNumber` · `visibility` · `JsonResponse<TransactionBody>`
← `ApiErrorBody` (سطران) · `subject` (سطران). **لم تُصلَح** لأن إصلاحها توسيع أنواع
اختبارات Phase 13 لا علاقة له بـPhase 16. **صفر خطأ ناتج عن Phase 16.**

### 14. Build
✅ نجح — `1728 modules transformed` · `built in 13.13s`.

### 15. المشاكل (قديمة وقيود)

1. **6 أخطاء أنواع في `availability.test.ts`** (Phase 13) — خارج النطاق كما سبق.
2. **تلف ترميز سابق في `server/src/api/validation/queryValidators.ts`**: النص العربي
   في الملف مقروء كـmojibake (نصّه في Git). **قديمة من مراحل أقدم** (ليست من
   Phase 15/16؛ تحققت بقراءة الملف بترميز UTF-8) — **لم تُلمس**: خارج نطاق هذه
   المرحلة، وإصلاحها تذكير موثّق لمشروع قائم. حارس `scope.test.ts` لا يلتقطها لأنه
   يفحص نطاق Presentation Forms لا نطاق الحروف العربية.
3. **معرّف مسار غير uuid** (مثل `/api/transactions/any-id`) يُنتج 500 من قاعدة
   البيانات لا 400 — سلوك قائم في كل مسارات الكتب قبل Phase 16 (لا تحقّق `params`
   فيها)، فاتركته متسقاً بدل توسعة النطاق.
4. **`archived` مسار ثابت** يُسجَّل قبل `/:id`؛ لو أُضيف كتاب بمعرّف حرفي
   `archived` لاصطدم — سلوك Express المعتاد لكل مسار ثابت.

### 16. قرارات تقنية (داخل حدود الخطة)

| القرار | السند |
|---|---|
| `DELETE /:id` = أرشفة (لا حذف) | §32 «لا يحذف نهائيًا» + عائلة `delete_archive` في §28 |
| `POST /:id/restore` بمسار `POST` | §32 «restore where allowed»؛ الاستعادة تُنشئ حالة نشطة، والحارس الإداري يبقى |
| `GET /api/transactions/archived` للاستعلام التاريخي | §32 «historical query still available to authorized admins» |
| المؤرشف غير مرئي في كل القراءات النشطة ⇒ 404 | §32 «deleted records excluded from active views» + §12 (لا كشف وجود) |
| أرشفة مؤرشف/استعادة نشط ⇒ 404 بلا كتابة | السلوك الأبسط المتّسق؛ لا حالة ثالثة ولا حدث بلا أثر |
| `delete_reason` نص حر بلا قائمة | «سبب الحذف عند الحاجة» بلا قائمة معتمدة في الخطة |
| `CASCADE → RESTRICT` لثلاثة قيود فقط | §32 «FK restrictions» + «historical preservation» |
| حدث الاستعادة `update` + `action: restore` | §31 لا تحدّد نوعاً جديداً؛ لم يُعدَّل قيد CHECK في 0004 |
| `deleted_by` → `users(id)` بـ`SET NULL` | اتساقاً مع `audit_logs.actor_user_id` (بقاء الصف مضمون) |

---

## 17. Git

```text
97acedc  feat(softdelete): implement phase 16 - soft delete and data integrity
```

- **Branch:** `phase-10-api-data-layer` (كما في كل المراحل السابقة)
- **Scope:** 18 ملفاً — 1593 إضافة و45 حذفاً. ترحيل واحد · 2 ملف اختبار جديدان ·
  14 ملفاً معدَّلاً (11 كود + 2 اختبار + هذا التقرير + الخطة).
- **الدفع:** **لم يُدفع** إلى GitHub — commit محلي فقط.
- `git status` بعد الـcommit: شجرة نظيفة، ولا ملفات زمنية أو غير مقصودة.

## 18. تأكيد عدم تنفيذ Phase 17

**لم تبدأ Phase 17 ولم يُكتب منها سطر**: لا `version` ولا `updatedAt` مقارن ولا
قفل تفاؤلي (Optimistic Concurrency)، ولا scheduled jobs، ولا بحث، ولا OCR، ولا
إشعارات. التغييرات كلها في `transactions` (أرشفة/استعادة) وما يتصل بها مباشرة.

