# OC-15-ATOMIC-AUDIT — مراجعة مستقلة نهائية لمرشح المرحلة 15

**الحالة:** `READY_TO_SEND / NOT_ASSIGNED` — OpenCode غير متاح الآن، ولا توجد مراجعة مستقلة مُنجَزة.  
**التاريخ:** 2026-11-23  
**المستودع:** `daboolgame123-creator/Saqa`  
**مرشح المراجعة الحالي:** [Draft PR #92](https://github.com/daboolgame123-creator/Saqa/pull/92)، SHA المختبر `9c7c1a5e550ac9c654a3fbe57f512a687637ac84`، مبني على [Draft PR #91](https://github.com/daboolgame123-creator/Saqa/pull/91) SHA `37c3040e78fb9f3e6ac115548465988b16b2090e`، فوق [Draft PR #89](https://github.com/daboolgame123-creator/Saqa/pull/89) SHA `8320d749d7d62fcf131e6f0a10d5c02a81914a32`. تحقق من HEAD للطلبات الثلاثة عند بدء المهمة؛ إن تغيّر أي منها فأوقف الحكم وحدّد الفرق.  
**المسودات السابقة:** PR #81–88، ولا Merge لأي منها.

**مهم قبل إبداء الحكم:** [بيان SHA ومصفوفة التكامل](https://github.com/daboolgame123-creator/Saqa/blob/docs/phase-audit-opencode-workflow-20261123/docs/PHASE15_EXIT_GATE_INTEGRATION_MANIFEST_20261123.md) يثبت أن **CI 973 PASS ليس اختبارًا لـPR #92 منفردًا**: `.github/workflows/phase15-i-acknowledgement-race.yml` يدمج مراجعات المراحل 1–10 (SHAs ثابتة) مؤقتًا داخل runner. في وضع Plan لا تدمج شيئًا على GitHub؛ راجع علاقة #92 وفرعيه الأبويين #91 و#89 بهذه الفروع وأثرها، واذكر إن كان فحص الكود وحده لا يكفي للحكم على نسخة ما بعد الدمج الرسمي. لا تُعلن التكامل من HEAD #92 منفردًا.

## المطلوب الآن: Plan/read-only — لا تعديلات

راجع بنية الـAPI وقاعدة PostgreSQL في المرشح #92 متضمنًا سلفيه #91 و#89، مع وثائق `docs/PHASE_15_D_ATOMIC_AUDIT_ACCEPTANCE_20261123.md` على فرع #84 و`docs/PHASE_15_F_INTERNAL_NOTIFICATION_ACCEPTANCE_20261123.md` على فرع التوثيق.

**ما أثبته CHAT بالفعل، فلا تبدأ من الصفر:**
- P15-01: حقول الأسرار في old/new تنقّى.
- P15-02: خلل الاحتفاظ ببيانات المجال بعد فشل Audit ثبت في RED لـPR #82، ثم أصلح `auditedMutation` في PR #83/#84. حقن فشل Audit لعمليات create وgrant/revoke وarchive/restore وrequest workflow نجح في إثبات ROLLBACK.
- P15-06: فشل `notifications INSERT` بعد COMMIT كان يعيد 500 مع بقاء grant وrequest؛ [RED #45130019980](https://github.com/daboolgame123-creator/Saqa/actions/runs/45130019980). الإصلاح في #86 يكتب **الإشعارات الداخلية PostgreSQL فقط** ضمن المعاملة نفسها. [GREEN #45130471066](https://github.com/daboolgame123-creator/Saqa/actions/runs/45130471066): **967 PASS / 0 FAIL / 1 SKIP** و3/3 اختبارات إخفاق الإشعارات.
- P15-07: مسار `POST /transactions/:id/acknowledge` كان يسجل «اطلعت» على أي كتاب مرئي، حتى الصادر وغير العام: [RED #45134122362](https://github.com/daboolgame123-creator/Saqa/actions/runs/45134122362) كشف 200 بدل 404. [PR #88](https://github.com/daboolgame123-creator/Saqa/pull/88) يفرض الإعمام العام `direction='وارد' && visibility='PublicToEmployees'`، بما يطابق شرط `new_broadcast`. [GREEN #45134802099](https://github.com/daboolgame123-creator/Saqa/actions/runs/45134802099): **970 PASS / 0 FAIL / 1 SKIP**، وبقاء سجل الإقرار بعد الأرشفة مثبت. تحقق من سلامة هذا القيد ضمن السياسة المعتمدة وأي سباق وصول/سحب إتاحة، دون فتح وظائف غير مصدّق عليها.

- P15-08: فُقد قفل حالة الكتاب بين التحقق من `ViewLog` وكتابة الإقرار؛ [RED #45137606374](https://github.com/daboolgame123-creator/Saqa/actions/runs/45137606374) أثبت اكتمال الأرشفة قبل الإقرار أثناء حجز INSERT اصطناعيًا. [PR #89](https://github.com/daboolgame123-creator/Saqa/pull/89) يستخدم `withTransaction` و`SELECT ... FOR SHARE OF t` مع إعادة فحص scope/eligibility تحت القفل؛ [GREEN #45137856092](https://github.com/daboolgame123-creator/Saqa/actions/runs/45137856092) **971 PASS / 0 FAIL / 1 SKIP**. راجع تسلسل الأقفال والاستثناءات وتحريرها وعدم نشوء deadlocks مع أرشفة/تحديث كتاب متزامن.

- P15-09 / Phase15-J: [PR #91](https://github.com/daboolgame123-creator/Saqa/pull/91) يعالج كتابة `create` Audit وهمي بعد grant مباشر مكرر أو grant جماعي فارغ؛ يضيف شرط `grantedEmployeeIds.length > 0` للمسارين واختبار HTTP/PostgreSQL. CI التراكمي [#45153758268](https://github.com/daboolgame123-creator/Saqa/actions/runs/45153758268) على SHA #91 أتم **418 server + 243 DB + 311 API = 972 PASS / 0 FAIL / 1 SKIP**؛ هذه ليست مراجعة مستقلة ولا دمجًا رسميًا. اقرأ **diff PR #91 كاملًا** مع فرعه الأب #89، وراجع إن كان حدث التدقيق يمثل تغيّرًا حقيقيًا ويقع ضمن المعاملة ذاتها، ومنع إشعارات no-op، وعدم تغيير سلوك revoke أو RBAC. تأكد ألا يصدر حكم PASS استنادًا إلى #89 وحده.

- P15-10 / Phase15-K: [Draft PR #92](https://github.com/daboolgame123-creator/Saqa/pull/92) يصلح حذف ارتباط كتاب بعنوان URL خاطئ: كان `DELETE /transactions/:id/relations/:relationId` يحذف بالـrelationId وحده ثم ينسب Audit لكتاب `:id`؛ الآن يشترط المصدر في `DELETE ... WHERE id=$1 AND transaction_id=$2`، وتتحول محاولة عدم التطابق إلى 404 بلا إزالة أو Audit. اختبار HTTP/PostgreSQL يثبت حالة الخطأ ثم الحذف الصحيح، واختبار DB يثبت عقد `remove`. [CI #45172005973](https://github.com/daboolgame123-creator/Saqa/actions/runs/45172005973) اكتمل على SHA #92: **418 server + 243 DB + 312 API = 973 PASS / 0 FAIL / 1 SKIP** (مسارات Phase15 B–I الثمانية كلها SUCCESS؛ 2 Moderate في الإنتاج، 0 high/critical). راجع diff PR #92 كاملًا، وفحص الانتماء إلى الكتاب، وعدم تسجيل حدث إن لم يتغيّر الصف، وعدم تأثير التصحيح على صلاحيات المستخدم، دون افتراض أن CI هو مراجعة مستقلة.

**راجع بدقة:**
1. `server/src/api/services/index.ts` و`database/pool.ts`: تدفق `Pool → withTransaction → PoolClient`، عدم إعادة فتح BEGIN على Client، وماذا يحدث عند أي استثناء أو فشل COMMIT.
2. `server/src/api/controllers/{transactionController,availabilityController,requestController,employeeController,relationController}.ts`: هل يضمن كل مسار حساس أن كتابة المجال وAudit (والإشعار الداخلي حين يلزم) ذرية، ولا يوجد استعمال Pool خارجي مخفي أثناء المعاملة؟
3. `server/src/services/notificationEvents.ts`: تأكد أن العمليات داخل `auditedMutation` SQL فقط؛ لا SMTP/SMS/HTTP، ولا إنشاء لمستلم غير مخوّل، ولا إشعار لاستيراد تاريخي، ولا مضاعفة إشعار بعد retry. راجع مخاطر الأداء/طول المعاملة ضمن نطاق حوالي 15 منتسبًا.
4. `server/tests/api/{phase15AuditAtomicityDiagnostic,phase15InternalNotificationAtomicity}.test.ts`: قيّم جودة اختبارات حقن الفشل، التوقيت داخل المعاملة، السيناريوهات غير المغطاة، والآثار الأخرى. لا تضف اختبارات لمجرد زيادة العدد.
5. الحراس: `RBAC` و`Access Scope` و`expectedVersion` ومصفوفة الأدوار ثابتة؛ راجع `server/src/api/services/viewLogService.ts` و`server/tests/api/acknowledgement.test.ts` والتحقق الجديد من الإعمام العام، وابقِ `view_logs` idempotent وفاعلَه من الجلسة، ولا توسع نطاقه. أي استثناء لإقرار كتاب خاص يحتاج سياسة مالك مستقلة. راجع خصوصًا أن `withTransaction` على Pool لا يُعيد فتح BEGIN داخل Client، وأن `FOR SHARE` يمنع archive وPATCH قبل COMMIT، والـ404 لا يفصح عن وجود كتاب محجوب.
6. ما الذي يبقى **مسؤولية المالك/المضيف** (أذونات `audit_logs` على PostgreSQL، النسخ والاستعادة، الاختبار الحقيقي)، وما الذي يعتبر خطأ برمجيًا مثبتًا يحتاج CHAT؟
7. قدّم رأيًا واضحًا: `PASS` أو `BLOCKER` مع file/line، ودرجة أثره، وأصغر اختبار/إصلاح ممكن. لا تغيّر قواعد البيانات أو أي ملف في وضع Plan.

## التسليم

تقرير واحد موجز: `SHA | PASS/BLOCKERS | verified claims | gaps | severity | owner | next steps`. لا تسمي تقرير OpenCode منجزًا قبل إرسال النتيجة الفعلية.

**في هذه الجولة Plan فقط:** ممنوع Commit/Push/Merge، تعديل الملفات، أو أي اتصال بـ`alsqaya_staging` أو بيانات المؤسسة. إذا اعتمد المالك إصلاحات لاحقة، استخدم فرع Draft منفصل وPostgreSQL اصطناعية وCI على آخر SHA. لا تبدأ المرحلة 16 تلقائيًا.

### نص قصير لنسخه إلى OpenCode

> افتح مستودع Saqa وPR #92 (HEAD `9c7c1a5e550ac9c654a3fbe57f512a687637ac84`) المتراكم على PR #91 ثم PR #89، واقرأ `docs/OPENCODE_PHASE15_ATOMIC_AUDIT_REVIEW_PROMPT_CURRENT.md`. نفّذ **Plan/read-only** للمراجعة الأمنية المستقلة لمعاملات المجال وAudit والإشعارات الداخلية؛ اختبارات RED/GREEN موجودة بالفعل (P15-02 وP15-06 وP15-07 وP15-08)، والإصلاحان Phase15-J/K مضمنان في CI. اذكر فقط العوائق المثبتة والاختبارات اللازمة، ولا تكتب كودًا ولا تتصل بأي قاعدة إنتاج/‏staging ولا تعمل commit أو merge قبل موافقتي.

**حالة الإصدار:** `NO_MERGE / RELEASE_NO_GO`؛ وتبقى `OC-11-SEC` للمصادقة مهمة مستقلة `NOT_ASSIGNED`.
