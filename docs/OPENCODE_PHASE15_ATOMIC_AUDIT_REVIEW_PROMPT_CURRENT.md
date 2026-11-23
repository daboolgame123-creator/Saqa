# OC-15-ATOMIC-AUDIT — مراجعة مستقلة نهائية لمرشح المرحلة 15

**الحالة:** `READY_TO_SEND / NOT_ASSIGNED` — OpenCode غير متاح الآن، ولا توجد مراجعة مستقلة مُنجَزة.  
**التاريخ:** 2026-11-23  
**المستودع:** `daboolgame123-creator/Saqa`  
**مرشح المراجعة الحالي:** [Draft PR #88](https://github.com/daboolgame123-creator/Saqa/pull/88)، SHA المختبر `f13fd2923ebe5aaf47b9a675a752901d88729f40`. تحقّق من HEAD عند بدء المهمة.  
**المسودات السابقة:** PR #81–87، ولا Merge لأي منها.

## المطلوب الآن: Plan/read-only — لا تعديلات

راجع بنية الـAPI وقاعدة PostgreSQL في المرشح #88، مع وثائق `docs/PHASE_15_D_ATOMIC_AUDIT_ACCEPTANCE_20261123.md` على فرع #84 و`docs/PHASE_15_F_INTERNAL_NOTIFICATION_ACCEPTANCE_20261123.md` على فرع التوثيق.

**ما أثبته CHAT بالفعل، فلا تبدأ من الصفر:**
- P15-01: حقول الأسرار في old/new تنقّى.
- P15-02: خلل الاحتفاظ ببيانات المجال بعد فشل Audit ثبت في RED لـPR #82، ثم أصلح `auditedMutation` في PR #83/#84. حقن فشل Audit لعمليات create وgrant/revoke وarchive/restore وrequest workflow نجح في إثبات ROLLBACK.
- P15-06: فشل `notifications INSERT` بعد COMMIT كان يعيد 500 مع بقاء grant وrequest؛ [RED #45130019980](https://github.com/daboolgame123-creator/Saqa/actions/runs/45130019980). الإصلاح في #86 يكتب **الإشعارات الداخلية PostgreSQL فقط** ضمن المعاملة نفسها. [GREEN #45130471066](https://github.com/daboolgame123-creator/Saqa/actions/runs/45130471066): **967 PASS / 0 FAIL / 1 SKIP** و3/3 اختبارات إخفاق الإشعارات.
- P15-07: مسار `POST /transactions/:id/acknowledge` كان يسجل «اطلعت» على أي كتاب مرئي، حتى الصادر وغير العام: [RED #45134122362](https://github.com/daboolgame123-creator/Saqa/actions/runs/45134122362) كشف 200 بدل 404. [PR #88](https://github.com/daboolgame123-creator/Saqa/pull/88) يفرض الإعمام العام `direction='وارد' && visibility='PublicToEmployees'`، بما يطابق شرط `new_broadcast`. [GREEN #45134802099](https://github.com/daboolgame123-creator/Saqa/actions/runs/45134802099): **970 PASS / 0 FAIL / 1 SKIP**، وبقاء سجل الإقرار بعد الأرشفة مثبت. تحقق من سلامة هذا القيد ضمن السياسة المعتمدة وأي سباق وصول/سحب إتاحة، دون فتح وظائف غير مصدّق عليها.

**راجع بدقة:**
1. `server/src/api/services/index.ts` و`database/pool.ts`: تدفق `Pool → withTransaction → PoolClient`، عدم إعادة فتح BEGIN على Client، وماذا يحدث عند أي استثناء أو فشل COMMIT.
2. `server/src/api/controllers/{transactionController,availabilityController,requestController,employeeController,relationController}.ts`: هل يضمن كل مسار حساس أن كتابة المجال وAudit (والإشعار الداخلي حين يلزم) ذرية، ولا يوجد استعمال Pool خارجي مخفي أثناء المعاملة؟
3. `server/src/services/notificationEvents.ts`: تأكد أن العمليات داخل `auditedMutation` SQL فقط؛ لا SMTP/SMS/HTTP، ولا إنشاء لمستلم غير مخوّل، ولا إشعار لاستيراد تاريخي، ولا مضاعفة إشعار بعد retry. راجع مخاطر الأداء/طول المعاملة ضمن نطاق حوالي 15 منتسبًا.
4. `server/tests/api/{phase15AuditAtomicityDiagnostic,phase15InternalNotificationAtomicity}.test.ts`: قيّم جودة اختبارات حقن الفشل، التوقيت داخل المعاملة، السيناريوهات غير المغطاة، والآثار الأخرى. لا تضف اختبارات لمجرد زيادة العدد.
5. الحراس: `RBAC` و`Access Scope` و`expectedVersion` ومصفوفة الأدوار ثابتة؛ راجع `server/src/api/services/viewLogService.ts` و`server/tests/api/acknowledgement.test.ts` والتحقق الجديد من الإعمام العام، وابقِ `view_logs` idempotent وفاعلَه من الجلسة، ولا توسع نطاقه. أي استثناء لإقرار كتاب خاص يحتاج سياسة مالك مستقلة.
6. ما الذي يبقى **مسؤولية المالك/المضيف** (أذونات `audit_logs` على PostgreSQL، النسخ والاستعادة، الاختبار الحقيقي)، وما الذي يعتبر خطأ برمجيًا مثبتًا يحتاج CHAT؟
7. قدّم رأيًا واضحًا: `PASS` أو `BLOCKER` مع file/line، ودرجة أثره، وأصغر اختبار/إصلاح ممكن. لا تغيّر قواعد البيانات أو أي ملف في وضع Plan.

## التسليم

تقرير واحد موجز: `SHA | PASS/BLOCKERS | verified claims | gaps | severity | owner | next steps`. لا تسمي تقرير OpenCode منجزًا قبل إرسال النتيجة الفعلية.

**في هذه الجولة Plan فقط:** ممنوع Commit/Push/Merge، تعديل الملفات، أو أي اتصال بـ`alsqaya_staging` أو بيانات المؤسسة. إذا اعتمد المالك إصلاحات لاحقة، استخدم فرع Draft منفصل وPostgreSQL اصطناعية وCI على آخر SHA. لا تبدأ المرحلة 16 تلقائيًا.

### نص قصير لنسخه إلى OpenCode

> افتح مستودع Saqa وPR #88، واقرأ `docs/OPENCODE_PHASE15_ATOMIC_AUDIT_REVIEW_PROMPT_CURRENT.md`. نفّذ **Plan/read-only** للمراجعة الأمنية المستقلة لمعاملات المجال وAudit والإشعارات الداخلية؛ اختبارات RED/GREEN موجودة بالفعل (P15-02 وP15-06 وP15-07). اذكر فقط العوائق المثبتة والاختبارات اللازمة، ولا تكتب كودًا ولا تتصل بأي قاعدة إنتاج/‏staging ولا تعمل commit أو merge قبل موافقتي.

**حالة الإصدار:** `NO_MERGE / RELEASE_NO_GO`؛ وتبقى `OC-11-SEC` للمصادقة مهمة مستقلة `NOT_ASSIGNED`.
