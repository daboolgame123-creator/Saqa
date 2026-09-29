# PHASE_15_REPORT — Audit Log + View/Acknowledgement Logs

> المرجع الملزم: `ALSQAYA_PLAN.md` §31 (+ §7.15/§7.16 و§9.1/§9.2 و§28 و§30).
> هذا التقرير يتبع بروتوكول §53 (عشرة بنود). لا يعيد تعريف المرحلة ولا يوسّعها؛
> يوثّق ما نُفِّذ فعلاً فقط.

---

## 1. Scope implemented · النطاق المُنفَّذ

| بند §31 | الحالة | الموضع |
|---|---|---|
| Audit Log: تسجيل الأحداث الحساسة | ✅ | `server/src/audit/auditLog.ts` + hooks في العمليات |
| `event_kind` المعتمد (12) | ✅ | `auditTypes.ts` مرآةً لقيد CHECK في 0004 (حارس اختبار) |
| old/new حسب سياسة الحساسية | ✅ | `old_values`/`new_values` jsonb + `AuditApiService` |
| login/logout/OTP/admin reveal | ✅ (موجود من Phase 11) | `auth/authAudit.ts` صار غلافاً فوق `audit` |
| sensitive file access | ✅ | `attachmentController.downloadAttachmentContent` |
| account actions | ✅ (موجود من Phase 11) | إعادة الضبط/كشف الرمز بلا تغيير سلوكها |
| backup/restore | ⛔ غير منفَّذ | Phase 24 — لا مسار اليوم |
| Historical Import Audit | ⛔ غير منفَّذ | لا عملية استيراد في النظام (Phase 31) |
| View Log خاص بالاطلاع الرسمي | ✅ | `audit/viewLog.ts` + `POST /api/transactions/:id/acknowledge` |
| عدم الخلط: فتح الصفحة ≠ تنزيل ≠ اطلاع | ✅ | لا مسار غير «اطلعت» يكتب `view_logs` |
| Audit Integrity: غير قابل للتعديل/الحذف | ✅ | لا مسار كتابة + لا `update`/`delete` في الطبقة |
| Audit Integrity: قابل للتتبع | ✅ | فاعل + كيان + طابع + سياق جلسة + نتيجة |
| صلاحية القراءة `view_audit_logs` | ✅ | `api/routes/auditRoutes.ts` + `api/routes/index.ts` |

**لم تُنفَّذ عمداً** (خارج نطاق ما هو موجود فعلاً): الاستيراد التاريخي، النسخ الاحتياطي/
الاستعادة، `permission_change` (لا مسار تغيير صلاحية)، وأحداث `create`/`update` لل-CRUD
العادي (سياسة «عند الحاجة» بلا نصّ يُوجبها في الخطة — لم تُوسَّع). ولا شاشة React جديدة:
الواجهة بلا جلسة (§27)؛ الخادم هو مصدر الحقيقة.

---

## 2. Files changed · الملفات المتغيّرة

### جديد — القاعدة (1)

`server/migrations/0008_view_log_acknowledgement.sql` — قيد
`UNIQUE (transaction_id, user_id)` على `view_logs` (إضافة فقط؛ down = `DROP CONSTRAINT`).

### جديد — طبقة `audit/` (4)

`server/src/audit/` — `index.ts` · `auditTypes.ts` · `auditLog.ts` · `viewLog.ts`
ومحذوف `server/src/audit/.gitkeep`.

### جديد — طبقة الـAPI (5)

`api/dto/audit.ts` · `api/services/auditService.ts` · `api/services/viewLogService.ts` ·
`api/controllers/auditController.ts` · `api/routes/auditRoutes.ts`

### جديد — الاختبارات (3)

`server/tests/audit.test.ts` (7) · `server/tests/api/audit.test.ts` (7) ·
`server/tests/api/acknowledgement.test.ts` (7)

### مُعدَّل (كود — 11)

| الملف | التغيير |
|---|---|
| `api/routes/index.ts` | تركيب `/api/audit-logs` بحارس `view_audit_logs` |
| `api/routes/resources.ts` | `POST /:id/acknowledge` في راوتر الكتب |
| `api/controllers/attachmentController.ts` | حدث `sensitive_file_access` بعد نجاح التحميل |
| `api/controllers/availabilityController.ts` | أحداث `create`/`update` للمنح والسحب |
| `api/controllers/employeeController.ts` | حدث `status_change` بالقيمة قبل/بعد |
| `api/controllers/shared.ts` | `auditActor(req)` — الفاعل من `req.auth` حصراً |
| `api/services/index.ts` | `audit` و`viewLogs` في `ApiServices` |
| `api/controllers/index.ts` · `api/dto/index.ts` | تصدير `auditController` و DTO التدقيق |
| `authorization/requirePermission.ts` | استثناء مسار «اطلعت»: `POST` بعائلة `view` |
| `auth/authAudit.ts` | تفويض الكتابة إلى `recordAuditEvent` (كاتب واحد) |

### مُعدَّل (اختبارات — 3)

`server/tests/scope.test.ts` (حوارس: `audit` لم تعد محجوزة + تنفيذها) ·
`server/tests/authorization.test.ts` (اختبار استثناء المسار) ·
`server/tests/db/migrations.test.ts` (7 ← 8 إصدارات + تراجع ثلاثي + `DROP CONSTRAINT`)

### مُعدَّل (توثيق — 2)

`ALSQAYA_PLAN.md` (الجدول + نقطة الانتقال + «تقرير الإنجاز الفعلي») · `README.md` ·
`PHASE_15_REPORT.md` (هذا الملف)

---

## 3. Files intentionally untouched · ملفات لم تُلمس عمداً

| الملف/المجلد | السبب |
|---|---|
| `server/migrations/0001`–`0007` | ترحيلات مُطبَّقة — checksum يرفض تعديلها؛ 0008 إضافة فقط |
| `server/src/auth/**` عدا `authAudit.ts` | المصادقة Phase 11 مكتملة ولا تعارض؛ لم تُبنَ المصادقة |
| `server/src/authorization/permissions.ts` | المصفوفة من Phase 12 وفيها `view_audit_logs` أصلاً — لم تُعدَّل |
| `server/src/authorization/accessScope.ts` | Access Scope Phase 13 — استُعمل فقط (فلتر مرئية الكتاب) |
| `server/src/repositories/**` | لا مستودع جديد: `view_logs` جدول سجل لا كيان مجال (audit مستقل) |
| `server/src/storage/**` | تخزين المرفقات Phase 14 — لم يُمسّ |
| خدمات `api/services/*` القائمة | لا إعادة بناء للخدمات؛ الـhooks في الـcontrollers وحدها |
| `src/**` (React) | لا واجهة في §31 تُنفَّذ بلا جلسة (§27) — خارج النطاق |
| `server/src/jobs/**` | لا scheduled jobs (Phase 20/21/24) |
| `Architecture.md` §5.2 | نصّه يذكر عائلات بلا مسارات، وقديمٌ أصلاً منذ Phase 13 — تحديثه خارج نطاق هذه المرحلة |

| `server/tests/api/availability.test.ts` | 6 أخطاء أنواع قديمة من Phase 13 — خارج النطاق (بند 7) |
|

---

## 4. Tests executed · الاختبارات المُنفَّذة

| # | الأمر | النطاق |
|---|---|---|
| 1 | `npm run lint` (`tsc --noEmit`) | فحص الأنواع |
| 2 | `npm run build` | بناء الواجهة |
| 3 | `npm run test:server` | وحدة الخادم (يشمل `audit.test.ts`) |
| 4 | `npm run test:db` | الترحيلات والقاعدة (0008) |
| 5 | `npm run test:api` | تكامل HTTP (يشمل `audit.test.ts` و`acknowledgement.test.ts`) |
| 6 | `npm run test:all` | السلسلة الكاملة |

### بنود §31 المُغطّاة

| بند الاختبار | الاختبار |
|---|---|
| audit created | `وصول مرفق حساس…` · `تغييرات الإتاحة…` · `نقل حالة الموظف…` |
| حفظ actor/session/resource/action | نفس الاختبارات: `actor_user_id` + `entity_kind/entity_id` + `new_values.context.sessionId` + `event_kind` |
| عدم تخزين الأسرار الحساسة | `recordAuditEvent لا يكتب سراً…` (وحدة) · `لا تُخزَّن كلمات المرور ولا OTP…` (HTTP) |
| audit immutable to normal user | `لا مسار تعديل أو حذف للسجل…` (المسؤول 404، المستخدم العادي 403، والسجل بلا تغيّر) |
| view_audit_logs تحكم القراءة | `view_audit_logs تحكم القراءة…` (admin 200 · director/employee 403 · بلا جلسة 401) |
| sensitive file access is auditable | `وصول مرفق حساس…` + `تحميل مرفوق خارج النطاق مرفوض ⇒ بلا حدث وصول ناجح` |
| acknowledgement persists | `«اطلعت» صريح…` (صف دائم + `session_ref` + `acknowledged_at`) |
| duplicate acknowledgement لا يُنتج حالة زائفة | `تكرار «اطلعت» idempotent…` (صف واحد · نفس الختم · القيد يرفض التكرار) |
| view ≠ acknowledgement | `فتح الكتاب ليس اطلاعياً…` |
| download ≠ acknowledgement | `تنزيل المرفق ليس اطلاعاً — بل حدث وصول حساس في سجل التدقيق` |
| لا تزوير الفاعل | `جسم مزوَّر لا يغيّر الفاعل…` |
| historical import audit / import errors | ⛔ **غير قابل للتغطية**: لا عملية استيراد في النظام (لا تُنفَّذ مرحلة مستقبلية) |

**زيادة على المطلوب** (بند صريح من §31/§29/§12): الـidempotency مفروض في القاعدة لا في
الطلب · الكتاب خارج النطاق يعيد 404 بلا سجل · `archivist` (دور خارج §28) 403 على «اطلعت» ·
محاولة وصول مرفوضة لا تُسجَّل كوصول ناجح.

---

## 5. Test results · النتائج

| الفحص | النتيجة |
|---|---|
| `npm run test:server` | ✅ **117 / 117** — 0 فشل (كان 110 قبل المرحلة) |
| `npm run test:db` | ✅ **43 / 43** — 0 فشل (نفس العدد؛ الاختبار محدَّث لـ8 إصدارات) |
| `npm run test:api` | ✅ **139 / 139** — 0 فشل (كان 125 قبل المرحلة) |
| `npm run test:all` | ✅ **299 / 299** — 0 فشل |
| `npm run build` | ✅ نجح — `1728 modules transformed`، `built in 25.12s` |
| `npm run lint` | ⚠️ **يفشل بـ6 أخطاء قديمة** خارج نطاق المرحلة (بند 7) — **صفر خطأ جديد من Phase 15** |

`tests/audit.test.ts` (وحدة): 7/7 · `tests/api/audit.test.ts`: 7/7 · `tests/api/acknowledgement.test.ts`: 7/7.

---

## 6. Known limitations · قيود معروفة

1. **الاستيراد التاريخي غير منفَّذ** — لا مسار استيراد في النظام، فلم يُنفَّذ ولا مُحاكى؛
   التصميم جاهز: أي حدث استيراد مستقبلي يكتبه `recordAuditEvent` (القنوات موجودة)،
   و`view_logs` لا يكتبه إلا «اطلعت» فلا يُولَّد acknowledgement من استيراد.
2. **النسخ الاحتياطي/الاستعادة غير منفَّذ** — Phase 24؛ نوع الحدث `backup_restore` مُعرَّف
   ومقبول في القيد ومُتاح في `AUDIT_EVENT_KINDS` بلا مسار.
3. **`permission_change` غير مستعمل** — لا مسار تغيير صلاحية (لا إسناد أدوار في النظام).
4. **لا تدقيق لـ`create`/`update` العادي** (كتب/موظفون) — «عند الحاجة» في §31 بلا نصّ
   يُوجبها؛ تسجيل كل كتابة CRUD ليس في نصّ المرحلة.
5. **لا مسار «قراءة سجل الاطلاع»** — متابعة الاطلاع مذكورة في §10.2 بلا مسار محدَّد في
   §31؛ المطلوب في المرحلة هو الختم الرسمي فقط (وحدود الاختبارات تعتمده).
6. **حد القراءة ثابت (100)** بلا ترقيم أو فلترة — لا قيمة من العميل في حدّثه أو تصفّيه.
7. **فشل كتابة التدقيق يُرمى ولا يُبتلع** — يردّ 500 بعد نجاح العملية (سياسة Phase 11
   نفسها)؛ لا مرور صامت لعملية حسّاسة بلا سجل.
8. **لا زر «اطلعت» في الواجهة** — الواجهة بلا جلسة (§27)؛ الخادم يوفّر المسار وهيكل
   الطلب، والقرار في واجهة لاحقة.

---

## 7. Deviations from plan · انحرافات عن الخطة

### 7.1 ستة أخطاء أنواع قديمة في `availability.test.ts` — **لم تُصلَح**

خارج نطاق §31، موثّقة أصلاً في `PHASE_13_REPORT.md` و`PHASE_14_REPORT.md`:
`phoneNumber` · `visibility` · `JsonResponse<TransactionBody>` ← `ApiErrorBody` (سطران) ·
`subject` (سطران). الأثر: `npm run lint` يفشل بستة أخطاء و`test:api` يمرّ كاملاً (يُشغَّل
بـ`tsx`). **لم تُلمس** لأن إصلاحها توسيع أنواع اختبارات Phase 13 لا علاقة له بالتدقيق.
**فحص أنواع كل ملفات Phase 15 نظيف تماماً** (لا خطأ واحد جديد).

### 7.2 استثناء مسار في خريطة الصلاحيات (توسيع لا استبدال)

`POST /:id/acknowledge` يُفرض عليه `view` لا `create`. السبب: «اطلعت» إجراء اطلاع (§9.1)
والمستخدم الأساسي هو المنتسب (`view` فقط §10.3). **لم يُبنَ نظام صلاحيات جديد** ولا صُرفت
صلاحية: الاستثناء مُقيَّد بنمط مسار واحد، والدور بلا `view` (مثل `archivist`) ما زال
مرفوضاً 403، ومصفوفة §28 كما هي بلا تعديل.

### 7.3 سياق الجلسة داخل jsonb

`audit_logs` لا عمود جلسة (بنية Phase 9 و§7.15). فالفاعل من `actor_user_id`/
`actor_employee_id` والسياق داخل `new_values.context.sessionId` (§9.2 «بيانات الجلسة عند
الحاجة»). لم يُضَف عمود جديد لأن البنية القائمة كافية والترحيل 0008 تقييدي فقط.

### 7.4 تفويض `authAudit` إلى الطبقة الموحّدة

`auth/authAudit.ts` لم يُعَد بناء: نفس التوقيع ونفس الاستدعاءات في `authService`، لكنّ
الـSQL صار واحداً عبر `recordAuditEvent` (تنقية أسرار + سياق + كاتب واحد للجدول). سلوك
Phase 11 لم يتغيّر واختباراته لم تُعدَّل.

---

## 8. Business-rule decisions used · قرارات استخدام القواعد

**لا قاعدة أعمال جديدة.** كل قرار تنفيذ تقني لبنود §31، والقيم مشتقّة من نصّها:

| القرار | سند §31/§9/§28 |
|---|---|
| القراءة عبر `GET /api/audit-logs` فقط، بحدّ ثابت 100 | §28 `view_audit_logs` + §10.1 «متابعة Audit Log» |
| لا مسار قراءة لسجل الاطلاع (عرض إداري) | §31 يذكر الختم الرسمي فقط؛ لا مسار قراءة مفروض |
| لا يُسجَّل `create`/`update` العادي | «يسجل **عند الحاجة**» بلا نصّ يُوجب |
| `sensitive_file_access` بعد نجاح التحميل | «sensitive file access» + ترتيب §30 (Backend بعد authorization) |
| منح الإتاحة `create` · سحبها `update` بقيمة `revoked` | §9.3 «السحب تحديث لا حذف» |
| نقل حالة الموظف `status_change` بـold/new | §31 «status change» + «old/new» |
| `view_logs` صف واحد لكل (كتاب، مستخدم) | §31 «duplicate acknowledgement…no false new official state» |
| الفاعل من `req.auth` حصراً | §31 «مرتبط بالمستخدم/الجلسة» + §28 «Backend نقطة فرض» |
| 404 لكتاب خارج النطاق عند الاعتراف | §12 حجب الوجود (موروث من Phase 13) |
| سياق الجلسة في `new_values.context` | §9.2 «بيانات الجلسة اللازمة للتدقيق» |

---

## 9. Git commit

```text
6fb62e8  feat(audit): implement phase 15 - audit log and view/acknowledgement logs
```

- **Branch:** `phase-10-api-data-layer` (كما في كل المراحل السابقة)
- **Scope:** 31 ملفاً — 2086 إضافة و58 حذفاً. ترحيل واحد · طبقة `audit/` (4 +
  حذف `.gitkeep`) · طبقة API (5) · مُعدَّل (11 كود + 3 اختبارات + 2 توثيق + هذا
  التقرير) · جديد (3 ملفات اختبار).
- **الدفع:** **لم يُدفع** إلى GitHub — commit محلي على الفرع فقط.
- `git status` بعد الـcommit: شجرة نظيفة، ولا ملفات زمنية أو غير مقصودة.

---

## 10. Stop

**توقّف.** لم تبدأ Phase 16 ولم يُكتب منها سطر: لا `deletedAt` ولا `deletedBy` ولا
`restore` ولا قيود FK جديدة على الحذف. `src/**` (React) لم يُمسّ. Phase 16 تبدأ بقراءة
`ALSQAYA_PLAN.md` §32.

