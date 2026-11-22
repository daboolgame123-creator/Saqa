# OpenCode handoff — P15-02 atomic domain and Audit Log writes

**إعداد:** 2026-11-23. **الحالة:** `READY_FOR_INDEPENDENT_PLAN / NOT_ASSIGNED`.
**المستودع:** `daboolgame123-creator/Saqa`.
**الأساس الجاري:** [Draft PR #82](https://github.com/daboolgame123-creator/Saqa/pull/82)، branch `fix/phase15-b-audit-redaction-and-diagnostic-20261123`، مبني على Phase14-B و15-A. يجب التحقق من HEAD عند البدء وعدم افتراض SHA قديم.
**دليل التشخيص:** `server/tests/api/phase15AuditAtomicityDiagnostic.test.ts` (DIAGNOSTIC)، `docs/PHASE_15_A_AUDIT_INTEGRITY_20261123.md`. **اختبار التشخيص الناجح يثبت الخلل ولا يثبت أمانه.**

## المهمة الأولى لـOpenCode — Plan / read-only (إلزامية قبل Build)

راجع فقط ولا تُعدل أي ملف أو تُرسل Commit/Push/Merge أو تتصل بقواعد التطوير أو staging. راجع:

- `server/src/api/controllers/transactionController.ts` و`availabilityController.ts` و`employeeController.ts` و`requestController.ts` و`attachmentController.ts`.
- `server/src/api/services/index.ts` و`auditService.ts` و`server/src/audit/auditLog.ts` و`server/src/database/pool.ts`.
- مسارات `create/update/status_change/archive/restore/grant/revoke` وكل حدث أمني يكتب بعد تعديل مجال على Pool خارج Transaction.
- `server/tests/api/phase15AuditAtomicityDiagnostic.test.ts`: كيف يؤدي فشل INSERT السجل إلى HTTP 500 بينما بقيت بيانات المجال محفوظة بلا الحدث.

أعطِ:
1. **قائمة مرتبة** بكل مسار توجد فيه نافذة فقد سجل التدقيق، مع مستوى الخطورة والدليل (file/line).
2. أصغر تصميم موحد يجعل **تعديل المجال وكتابة الحدث في معاملة PostgreSQL واحدة**: فشل كتابة Audit يسبب ROLLBACK للمجال، ويعود HTTP 500 بلا تغيير ولا حدث كاذب. تجنب أي Transaction متداخلة غير آمنة.
3. فصل آثار **الملفات على القرص والإشعارات الخارجية/المجدولة** عن معاملة SQL (لا إرسال إشعار أو حذف/كتابة ملف معلق في Transaction طويل). اذكر سياسة الإخفاق/التعويض المطلوبة بوضوح، ولا تخترع ضمانًا شاملاً للملفات من غير اختبار.
4. تجنّب نسخ منطق قواعد الأعمال على مسارات متعددة، وتأكد من عدم تجاوز حدود Access Scope وRBAC أو القفل التفاؤلي Phase17.
5. **خطتان صغيرتان للتنفيذ إن أمكن**: (A) إصلاح الكتاب/الإتاحة والأفعال عالية الخطورة، (B) بقية المعاملات، ثم إجراء اختبارات ذرية على قاعدة اصطناعية.
6. ذكر القرارات التي تحتاج مالك المشروع/المضيف، خصوصًا امتيازات `audit_logs` ومنع `UPDATE/DELETE` على مستوى DB. **لا تغيّر أذونات قاعدة الإنتاج في مرحلة Plan**.

## بعد اعتماد الخطة فقط — Build مقيد

- أنشئ فرع إصلاح منفصل من الرأس المعتمد؛ **لا تغير الفرع الرسمي**.
- حوّل الاختبار التشخيصي إلى **اختبار قبول فعلي**: عند حقن فشل audit يجب أن لا يبقى صف المعاملة/الإتاحة المعدَّلة، وأن لا يسجل حدث نجاح زائف. لا تُبقِ اختبارًا يمر وهو يؤكد سلوكًا غير آمن.
- اكتب اختبارات failure injection إضافية للعمليات المغطاة، واحتفظ باختبارات رفض الوصول وتوقيت view_logs وأحداث Auth وOTP.
- شغّل lint/build/all unit+isolated PostgreSQL+API، إضافة إلى CI التجميعية لمراحل 1–15. لا ملف حقيقي ولا اتصال `alsqaya_staging` ولا بيانات منتسبين.
- تسليم: SHA محدد، PR مسودة، نتائج CI على HEAD النهائي، جدول قبل/بعد، والمخاطر المتبقية؛ **لا Merge** بدون موافقة المستخدم.

## نموذج برومبت مختصر للإرسال إلى OpenCode

> راجع مشروع ALSQAYA في `daboolgame123-creator/Saqa`، Draft PR #82، مع الملف `docs/OPENCODE_PHASE15_ATOMIC_AUDIT_REVIEW_PROMPT.md`. ابدأ **Plan/Read-only**: شخّص مشكلة P15-02، وهي أن تعديلات المجال تنجح قبل حفظ Audit، وقد يتبقى تغيير بلا سجل عند فشل INSERT. أعطني تصميمًا ذا نطاق محدود لمعاملة موحدة مع خطة اختبار Failure Injection، وفرز ما يحتاج قرار المالك. لا تعدّل ولا تنفّذ Build أو Commit أو Push أو Merge قبل موافقتي. استخدم قاعدة اصطناعية فقط لاحقًا.

**قيد المشروع:** Phase15 `NO_GO` ما دام P15-02 غير مصحَّح ومقبول؛ OC-11-SEC مراجعة Auth المستقلة ما زالت مهمة منفصلة لم تُنفذ.
