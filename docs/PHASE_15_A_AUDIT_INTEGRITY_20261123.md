# Phase 15-A — تدقيق سجل التدقيق وViewLog

**التاريخ:** 2026-11-23 · **الخطوة:** `15-A / INSPECTION & TRIAGE` (لا تعديل إنتاجي).  
**الأساس:** `3c775947415ce355fd089a506d024f9c7727c83d` من [Phase14-B PR #80](https://github.com/daboolgame123-creator/Saqa/pull/80)، [CI #45079021084](https://github.com/daboolgame123-creator/Saqa/actions/runs/45079021084) ناجح (959 PASS / 0 FAIL / 1 SKIP).  
**مرجع السياسة:** `ALSQAYA_PLAN.md` §31، §9.1/§9.2، §10.1، §28.  
**الحالة:** `PHASE15_A_INSPECTED / P15_02_ATOMICITY_REVIEW_REQUIRED / NO_MERGE`.

## تمت مراجعة

- `audit/auditLog.ts` و`audit/auditTypes.ts`: كتابة `INSERT`، تنقية old/new recursive، 12 قيمة event_kind، وقراءة آخر 100 حدث فقط.
- `audit/viewLog.ts`: سجل «اطلعت» مستقل `ON CONFLICT` يثبت أول `acknowledged_at`، وليس ناتج فتح الصفحة أو تنزيل المرفق.
- `api/routes/auditRoutes.ts` و`api/routes/index.ts`: GET فقط، حارس `view_audit_logs` صريح؛ لا HTTP POST/PATCH/DELETE لإدارة الأحداث.
- `auth/authAudit.ts`: أحداث الدخول/الخروج/OTP/كشف السر تمرّ في كاتب التدقيق الموحّد.
- `api/services/auditService.ts` و`api/controllers/{transactionController,availabilityController,employeeController,attachmentController,requestController}`: الأحداث تحمل الفاعل من الجلسة وold/new حيث اعتمدت الخطة.
- `migrations/0004_operations_logs.sql`: الجدول لا يحتوي Trigger يمنع UPDATE/DELETE على مستوى DB؛ قنوات HTTP ليست قابلة للكتابة.
- `server/tests/audit.test.ts` و`server/tests/api/audit.test.ts`: اختبارات 401/403، عدم وجود POST/PATCH/DELETE، تنقية password/OTP/token، وختم الوصول بعد نجاح قراءة الملف.

## الفرز والتوزيع

| ID | نتيجة الفحص | الأولوية والعمل |
|---|---|---|
| **P15-01** | `isSensitiveKey` لا ينقّي مفاتيح مثل `authorization` و`apiKey` و`privateKey` و`cookie` إذا وصلتها قيمة إلى old/new. تنقية المفتاح مهمة دفاعية؛ لا يوجد حاليًا دليل أن مسار HTTP يمرّر أحد هذه الحقول. | **P1 / CHAT في 15-B:** أضف اختبار تسريب مباشر على `recordAuditEvent` ثم أصغر تعديل للتنقية، دون تنقية حقول سليمة مثل `badgeNumber` أو سياق الجلسة الاصطناعي. |
| **P15-02** | في `createTransaction` و`grantAvailability` و`revokeAvailability` وغيرها، كتابة بيانات المجال تكتمل **قبل** استدعاء `recordAuditEvent` بخطوة مستقلة. فشل INSERT في `audit_logs` بعد نجاح المجال يمكن أن يترك **تغييرًا دائمًا بلا سجل تدقيق** مع HTTP 500. لا يلزم اختراق لتفعيل الحالة؛ يكفي خلل مؤقت في الكتابة/القيد. | **P1 / CHAT diagnostic في 15-B** على DB اصطناعية بإجبار INSERT audit للفعل المحدد على الفشل، ثم **OpenCode بعد الإثبات** لوضع تصميم Transaction موحَّد للمجال+Audit مع مراجعة آثار الملفات والإشعارات؛ لا حل موزع اعتباطيًا عبر كل controllers. |
| **P15-03** | عدم وجود endpoint للكتابة لا يمنع DBA أو حسابًا يملك UPDATE على الجدول من تغييره مباشرة. لا trigger/DB-grant مانع في migration 0004. | **HOST/OWNER**: تحديد حساب تشغيل محدود الامتيازات، سياسة `immutable audit` والنسخ الاحتياطي؛ لا نغيّر صلاحيات قواعد المستخدم في التدقيق. |
| **P15-04** | `listAuditLogs` يقيد العرض بأحدث 100 حدث؛ هذا **حد معلن**، وليس ضمانًا أن كل التاريخ قابل للمراجعة عبر UI. | **P2 / FUTURE UX**: لا توسعة pagination أثناء إغلاق الأمن. |
| **P15-05** | كتابة `sensitive_file_access` تحصل قبل إرسال HTTP bytes لكنها بعد نجاح قراءة الملف. قد يسقط اتصال العميل بعد التدقيق. | **LOW / expected logging semantics**: لا يستنتج منه اختراق أو حذف سجل. |

## 15-B: بوابة الاختبارات

1. تنقية مفاتيح سرية إضافية من `new_values/old_values` مع اختبار الوحدة وإثبات أن `recordAuditEvent` لا يخزن قيمها.
2. اختبار تشخيصي **متوقع النجاح لإثبات العيب P15-02** (يجب تسميته `DIAGNOSTIC_NOT_SECURITY_ACCEPTANCE`) يُحاكي فشل audit INSERT، ويؤكد إن بقي الكتاب بينما اختفى حدث create؛ لا يُعدّ نجاح الاختبار إغلاقًا للثغرة.
3. اختبارات الوحدة/الواجهة والبناء والتجميع التراكمي على PostgreSQL اصطناعية فقط.
4. **إذا تأكد P15-02 لا تُغلق Phase15 ولا تنتقل لمرحلة 16** حتى إصلاحها أو تحديد قبول مخاطرة صريح من المالك، ويفضّل OpenCode مراجعة Architecture مستقلة قبل تعديل مسارات متعددة.

**قيد دائم:** `NO MERGE / NO STAGING / NO REAL DATA / RELEASE_NO_GO`. مراجعة Phase11 الأمنية `OC-11-SEC` لا تزال غير مُسنَدة.
