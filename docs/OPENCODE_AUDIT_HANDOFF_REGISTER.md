# سجل المهام التي قد تتطلب OpenCode — ALSQAYA

**لقطة تم التحقق منها:** 2026-11-23 (Phase 11-C cumulative CI #45076556355)  
**المرجع التنفيذي:** [بروتوكول الفحص والإصلاح على خطوتين](PHASE_AUDIT_TWO_STEP_PROTOCOL.md)  
**تحذير:** هذه قائمة تسليم مستقبلية وليست أوامر عمل مُرسلة إلى OpenCode. **لا توجد مهمة نشطة مؤكدة له** في هذا السجل ما لم يُبلغ المالك بفرعها/نتيجتها؛ حالة المهام الخارجية مبدئيًا `NOT_ASSIGNED`.

## A. وضع التدقيق في لحظة إنشاء السجل

- **CHAT:** Phase 11-A/B/C أُنجز فحصها وإصلاحات OTP وجلسات الدخول، واجتازت النسخة المجمّعة 1–11 اختبارات CI. لم تُغلق Phase 11 نهائيًا لأن المراجعة الأمنية المستقلة معلقة.
- **OPENCODE:** `NOT_ASSIGNED / STATUS_UNKNOWN` — لا نفترض وجود جلسة تنفيذ جارية أو نتيجة لم يُبلغ عنها.
- **آخر مراجعة كود أغلقت:** Phase 10، [Draft PR #69](https://github.com/daboolgame123-creator/Saqa/pull/69)، الالتزام `a3f3fa6e50e201047a6597a792b3454f7e6b17bc`، [CI #45069255998](https://github.com/daboolgame123-creator/Saqa/actions/runs/45069255998): مراجعة المراحل 1–10 **949 نجاحاً، 0 فشل، 1 متخطى** في دمج اختباري مؤقت، دون دمج رسمي.
- **فروع تدقيق المراحل 1–10:** [PR #60–69](https://github.com/daboolgame123-creator/Saqa/pulls) كلها `Draft / merged=false` وقت آخر فحص؛ **لا تعتبرها في نسخة المستخدم**.
- **المسار التشغيلي:** `A2.3 / UI-04` اختبار تطبيق مضيف معلّق؛ تقارير Phase23 تحافظ على `HTTP 503`، والإطلاق `RELEASE_NO_GO`.
- لا اعتماد للبيئة المحلية أو الملفات/البيانات الحقيقية استنادًا إلى هذه اللقطة.

## آخر تحديث موثق: Phase 11-A → Phase 11-B (2026-11-23)

- **11-A / فحص وفرز:** أثبت [PR #71](https://github.com/daboolgame123-creator/Saqa/pull/71) بقاعدة PostgreSQL اصطناعية سباق OTP (6/6 رغم حد 5)، وجلسة تُنشأ بكلمة سر قديمة بعد تغييرها؛ التقرير التشخيصي **ليس** اختبار قبول.
- **11-B / إصلاح:** رُفعت إصلاحات [Draft PR #72](https://github.com/daboolgame123-creator/Saqa/pull/72) على SHA `394037afe171249a7b419f0a6b2b2e99c92fe8b5`؛ عدم تجاوز حد OTP تحت التزامن، رفض جلسة قديمة بعد تبديل السر، عدم إلغاء حظر إداري عبر freeze/unfreeze، ومنع قبول جلسة أُبطلت قبل فحصها النهائي.
- **دليل CI على SHA الأخير:** [Run #45074462235](https://github.com/daboolgame123-creator/Saqa/actions/runs/45074462235)؛ وظيفتان **success**، اختبارات أمنية 4/4، الاختبارات الشاملة 376 server + 230 DB + 269 API = **875 ناجحة، صفر فشل، اختبار واحد متخطى**. TypeScript والبناء نجحا في وظيفة الأمان. لا يشمل هذا إثبات دمج PR #60–69 معه.
- **تكامل المراحل 1–11:** [Draft PR #73](https://github.com/daboolgame123-creator/Saqa/pull/73)؛ [CI #45075262725](https://github.com/daboolgame123-creator/Saqa/actions/runs/45075262725) نجح عند SHA `4a58c68053252231780ae1cc6861bb52d8b0daf2` قبل تحديث التقرير فقط: **953 PASS / 0 FAIL / 1 SKIP** (417 خادم، 240 DB، 296 API) مع إعادة 4/4 أمنية و0 ثغرات عالية و2 متوسط. **اختبار تركيب PR #60–69 + #72 لم يعد عائقًا**؛ لا حاجة تلقائيًا لـOC-INTEGRATION.
- **قرار:** `PHASE11_CUMULATIVE_CODE_TESTS_PASS / INDEPENDENT_SECURITY_REVIEW_WAITING_EXTERNAL / P11_04_OWNER_DECISION_PENDING / CODE_AUDIT_NOT_CLOSED / NO_MERGE`. لا يُساوي نجاح الاختبارات اعتماد التشغيل المحلي.
- **OpenCode:** المالك لا يستطيع استخدامه حاليًا؛ [OC-11-SEC](OPENCODE_PHASE11_SECURITY_REVIEW_PROMPT.md) **NOT_ASSIGNED / WAITING_EXTERNAL**؛ يبقى الاختبار المستقل مطلوبًا قبل اعتماد Auth. لا ندّعي أنه شُغّل.
- **CHAT:** أنجزت إصلاحات المصادقة واختبارها وتكامل 1–11 بنفسي. لا أنقل المهام المكتملة إلى OpenCode. أراجع أي نتيجة مهددة للأمان عند ورود دليل؛ ولا أفتح تحسينات غير حاجزة. **OWNER:** يراجع [مذكرة P11-04 لهاتف مشترك](PHASE11_SHARED_PHONE_POLICY_DECISION.md)؛ التوصية رفض الدخول بالهاتف عند الغموض مع إبقاء الرقم الوظيفي، لكن **لا تغيير سياسة دون اعتماد صريح**.


## متابعة Phase 11-C — استكمال CHAT دون OpenCode

- **الدليل الأحمر قبل الإصلاح:** [CI #45076236296](https://github.com/daboolgame123-creator/Saqa/actions/runs/45076236296) على SHA `39ba775fc19674b8b2a201ca0b54dc650506a313`: فشل اختباران جديدان كما توقعنا، لأن طلب تسجيل ببيانات غير مطابقة وطلب استعادة بهاتف غير مسجل لا يستهلكان الحصة `5/15 دقيقة`.
- **الإصلاح:** [Draft PR #74](https://github.com/daboolgame123-creator/Saqa/pull/74) على SHA `401088aeb7e07b898617334094fd102fb6400b62`: طلب OTP غير المطابق يُكتب كسجل عشوائي **مبطل من لحظة الإدخال** كي يحسبه حد الهاتف دون إرسال رمز أو إفشاء وجود الحساب. يشمل الطلبات الإدارية المرفوضة مع حفظ الحد وAudit عند رد 400؛ ومدة رمز التفعيل الإداري تبقى **60 دقيقة**.
- **الدليل الأخضر التراكمي:** [CI #45076556355](https://github.com/daboolgame123-creator/Saqa/actions/runs/45076556355): **417 server PASS / 243 synthetic DB PASS / 296 API PASS = 956 PASS، 0 FAIL، 1 SKIP**؛ إعادة اختبارات أمان 4+3 = 7 PASS (ليست زيادة في الإجمالي)، TypeScript والبناء ناجحان؛ تدقيق الحزم الإنتاجية صفر high و2 moderate.
- **المسار:** CHAT أتمّ الإصلاح والاختبار والتكامل في GitHub من دون OpenCode. المراجعة الأمنية المستقلة لا تزال `WAITING_EXTERNAL / NOT_ASSIGNED`، والهوية عند الهاتف المشترك `P11-04` قرار للمالك، واختبار المضيف لاحق.
- **الحكم:** `PHASE11_CUMULATIVE_CI_PASS / CODE_AUDIT_NOT_CLOSED / INDEPENDENT_SECURITY_REVIEW_PENDING / OWNER_POLICY_PENDING / HOST_ACCEPTANCE_PENDING / NO_MERGE`. لا يُعتمد استمرار العمل على قاعدة مؤسسية من نجاح هذه الاختبارات.


## تقدم Phase 12-A و12-B (2026-11-23)

- **12-A:** [Draft PR #75](https://github.com/daboolgame123-creator/Saqa/pull/75) — مراجعة المصفوفة والأدوار، ترتيب الحراسة ومسارات Auth/API/Requests/Reminders/Audit. لم يثبت bypass مباشر.
- **12-B:** [Draft PR #76](https://github.com/daboolgame123-creator/Saqa/pull/76)، HEAD `1152bc9275c19224e9cc0c2fb6039f4b3ce74112`. اختبار API جديد أثبت أن تغيير دور الحساب النشط `admin → employee → director → archivist → admin` يعيد تقييم الصلاحية على **نفس Bearer** دون تسجيل دخول جديد؛ لا آثار كتابة لمَن رُفض.
- **دليل التكامل:** [Cumulative CI #45077339502](https://github.com/daboolgame123-creator/Saqa/actions/runs/45077339502) على SHA الكود، ثم [CI #45077628660](https://github.com/daboolgame123-creator/Saqa/actions/runs/45077628660) **نجح** على HEAD النهائي بعد إضافة التقرير: **957 PASS / 0 FAIL / 1 SKIP** (417 server، 243 PostgreSQL اصطناعية، 297 API)؛ TypeScript والبناء ناجحان؛ 0 high و2 moderate في تدقيق الاعتماديات الإنتاجية. لا تكرار لاحتساب اختبارات الأمان المستقلة.
- **الحكم:** `PHASE12_SCOPED_CODE_AUDIT_CLOSED / CUMULATIVE_CI_PASS / NO_MERGE / HOST_ACCEPTANCE_PENDING`. لا تفعيل لأي Role أو ترحيل في بيانات المؤسسة.
- **التوزيع:** CHAT نفّذ الفحص والاختبار؛ **OPENCODE لا يحتاج مهمة جديدة للمرحلة 12**. بقيت `OC-11-SEC` مستقلة `WAITING_EXTERNAL / NOT_ASSIGNED`؛ و`P12-02` (إسناد أدوار الحسابات)، `P12-03` (مصير archivist)، وسياسة أفعال صاحب الطلب من Phase19 قرارات للمالك لا تُفرض تلقائياً.
- **التالي:** `13-A / Access Scope architecture audit`؛ لا يُستدل من انتقال مراجعات الكود على دمج الفروع أو اعتماد النشر.

## Phase 13-A/B — نطاق رؤية البيانات وسحب الإتاحة

- **13-A:** [Draft PR #77](https://github.com/daboolgame123-creator/Saqa/pull/77) — مراجعة `Access Scope`، قيد SQL للكتب، الإتاحة والروابط والمرفقات والبحث والخط الزمني؛ لم يُثبت تسريب في البنية. حُدّدت فجوة اختبار `P13-01`.
- **13-B:** [Draft PR #78](https://github.com/daboolgame123-creator/Saqa/pull/78) — اختبار HTTP لملف مرفق بكتاب `SpecificEmployees`: 404 قبل المنح، 200 بايتات كاملة بعد المنح، 404 عند السحب على **نفس Bearer** للمرفق والكتاب، مع بقاء البايتات محفوظة للإدارة. **لا تغيير كود إنتاج**.
- **الدليل:** [CI #45078122304](https://github.com/daboolgame123-creator/Saqa/actions/runs/45078122304): **958 PASS / 0 FAIL / 1 SKIP** (417 server، 243 DB، 298 API)، بالإضافة لإعادة اختبارات الأمان والمرفقات كلها ناجحة؛ Zero high/critical، تنبيهان moderate. تقرير القبول موثق في `docs/PHASE_13_B_ACCESS_SCOPE_ACCEPTANCE_20261123.md`. بعد آخر تغيير توثيقي يجب اعتماد CI الخاص بآخر SHA.
- **الحكم:** `PHASE13_SCOPED_CODE_AUDIT_PASS / HOST_ACCEPTANCE_PENDING / NO_MERGE`. CHAT نفّذ الفحص والاختبارات؛ **OpenCode لا يتطلب مهمة جديدة للمرحلة 13**. لا تزال `OC-11-SEC` `WAITING_EXTERNAL / NOT_ASSIGNED`، واعتماد التشغيل منفصل.
- **التالي:** فحص `14-A` لتخزين المرفقات بعد تثبيت نتيجة آخر SHA.

## Phase14-A/B — تخزين المرفقات وسلامة فشل القرص

- **14-A:** [Draft PR #79](https://github.com/daboolgame123-creator/Saqa/pull/79) — تدقيق MIME والحجم وتنظيف الاسم والمفتاح والـhash والـmetadata والخدمة والتخزين الفعلي وتغطية الاختبارات. لا تسريب مباشر ثبت.
- **14-B:** [Draft PR #80](https://github.com/daboolgame123-creator/Saqa/pull/80) — اختبار HTTP على PostgreSQL اصطناعية مع `FileStorage({rootDir:''})`: فشل كتابة القرص **503** وليس 201، وبقاء `integrity_state='missing'` وليس `verified`. بلا تعديل كود إنتاج.
- **الأدلة:** [CI #45078794287](https://github.com/daboolgame123-creator/Saqa/actions/runs/45078794287): **959 PASS / 0 FAIL / 1 SKIP** (417 server، 243 DB، 299 API)، واختبارات إضافية للأمن والمرفقات وإخفاق التخزين ناجحة؛ صفر high/critical و2 moderate. أضيف تقرير `docs/PHASE_14_B_STORAGE_ACCEPTANCE_20261123.md`، ثم نجح [CI النهائي #45079021084](https://github.com/daboolgame123-creator/Saqa/actions/runs/45079021084) على آخر SHA `3c775947415ce355fd089a506d024f9c7727c83d` (success). **`PHASE14_SCOPED_CODE_AUDIT_CLOSED`** مع بقاء اختبارات المضيف والدمج منفصلة.
- **الفرز:** P14-01 غلقت فجوة الاختبار. P14-02 أذونات التخزين وsymlinks في بيئة المضيف — **HOST**. P14-03 سياسة تنزيل ملف تالف — **OWNER POLICY**، لا تغيير تلقائي. ملفات الجود الحقيقية واختبارات LAN — **HOST/OWNER**.
- **التوزيع:** CHAT أتمّ العمل البرمجي؛ OpenCode **لا مهمة لازمة لهذه المرحلة**، و`OC-11-SEC` السابقة مستمرة `WAITING_EXTERNAL/NOT_ASSIGNED`. **لا Merge ولا Release**.
- **التالي بعد بوابة CI:** `Phase15-A` لفحص Audit Log فقط.

## Phase 15-A/B/C/D — اكتشاف وتصحيح ذرية Audit Log (2026-11-23)

- **15-A:** [Draft PR #81](https://github.com/daboolgame123-creator/Saqa/pull/81) — فحص `auditLog.ts` وViewLog وAuth وcontrollers. عُثر على `P15-01` نقص تنقية مفاتيح سرية و`P15-02` تعديل مجال ناجح يسبق Audit.
- **15-B:** [Draft PR #82](https://github.com/daboolgame123-creator/Saqa/pull/82)، [CI #45079563990](https://github.com/daboolgame123-creator/Saqa/actions/runs/45079563990) — إصلاح تنقية Authorization/cookie/apiKey/privateKey واختبارها. أثبت اختبار فشل audit الاصطناعي **HTTP 500 مع بقاء كتاب بلا حدث Audit**؛ الاختبار **تشخيص لا قبول أمني**.
- **15-C:** [Draft PR #83](https://github.com/daboolgame123-creator/Saqa/pull/83)، [CI #45079923597](https://github.com/daboolgame123-creator/Saqa/actions/runs/45079923597) — `auditedMutation` يكتب إنشاء الكتاب وAudit في معاملة واحدة؛ اختبار failure injection يثبت **ROLLBACK**.
- **15-D:** [Draft PR #84](https://github.com/daboolgame123-creator/Saqa/pull/84)، [CI #45080332491](https://github.com/daboolgame123-creator/Saqa/actions/runs/45080332491) — توسيع نفس المعاملة إلى تعديل/أرشفة/استعادة الكتب، الإتاحة الفردية والجماعية وسحبها، نقل حالة منتسب، طلبات workflow، وروابط الكتب. **962 PASS / 0 FAIL / 1 SKIP** (418 server، 243 DB، 301 API). فشل Audit لمنح وسحب الإتاحة يتسبب في ROLLBACK كما يجب. تقارير القبول في `docs/PHASE_15_D_ATOMIC_AUDIT_ACCEPTANCE_20261123.md`. أضيف التوثيق ومهمة المراجعة، ثم نجح [CI على HEAD النهائي #45080640275](https://github.com/daboolgame123-creator/Saqa/actions/runs/45080640275) على SHA `bb8a9e50f8794f3b5e5def0f24efe27fd7d7b31e`: 962 PASS / 0 FAIL / 1 SKIP؛ مراجعة OpenCode المستقلة تبقى غير مُنفَّذة.
- **مهمة OpenCode الجديدة `OC-15-ATOMIC-AUDIT`:** `READY_TO_SEND / NOT_ASSIGNED` — مراجعة مستقلة **Plan/read-only** للمرشح المصحح PR #84، وليس بدء إصلاح من الصفر. [نص المهمة](https://github.com/daboolgame123-creator/Saqa/blob/fix/phase15-d-audit-atomic-operations-20261123/docs/OPENCODE_PHASE15_ATOMIC_AUDIT_REVIEW_PROMPT.md). التركيز صحة معاملة Pool/Client، كل مسار حساس، حقن فشل إضافي فقط حيث يخدم خللًا، والإشعارات بعد commit.
- **الفصل بين المسؤوليات:** CHAT أنجز الفحص والتعديلات والاختبارات؛ OpenCode مسؤولة عن مراجعة مستقلة غير منفذة؛ **HOST/OWNER** لأذونات قاعدة PostgreSQL وتحديد سياسة الإشعارات المتأخرة وUAT الحقيقي. `OC-11-SEC` ما زالت `NOT_ASSIGNED`. لا دمج فروع أو اعتماد تشغيل.
- **الحكم المؤقت:** `PHASE15_CODE_CANDIDATE_PASS / SECURITY_REVIEW_PENDING / HOST_ACCEPTANCE_PENDING / RELEASE_NO_GO`؛ لا الانتقال إلى Phase16 بمجرد نجاح عدد الاختبارات.

## B. مهام OpenCode عند تحقق شرط الحاجة

| ID | متى تفتح المهمة؟ | المنفذ/الحالة | الخطوات المطلوبة | دليل قبول قابل للتحقق |
|---|---|---|---|---|
| **OC-11-SEC** | **عند توفر OpenCode:** PR #74 يتضمن إصلاحات 11-B/11-C، SHA `401088a`؛ المراجعة المستقلة شرط إغلاق Phase 11 | **OPENCODE (Plan/Review)** — `WAITING_EXTERNAL / NOT_ASSIGNED` | طبق [التكليف المفصل](OPENCODE_PHASE11_SECURITY_REVIEW_PROMPT.md): أمان OTP/الجلسات/تجميد/استعادة/صلاحيات، قراءة فرق #71→#72→#74 على SHA ثابت، تحليل تعارض #60–69، بلا تعديل | تقرير مستقل مشروح بالاختبارات والأسطر والشدة وقرار PASS/NO_GO؛ لا إغلاق قبل تحقق CHAT من الملاحظات |
| **OC-INTEGRATION** | إذا ظهرت مشكلة جديدة في تركيب PR #60–69 + #74 لا تغطيها CI #45076556355، لا قبل ذلك | **CHAT — VERIFIED via latest CI #45076556355؛ OPENCODE unnecessary now** — `CLOSED_BY_CHAT` | clone/worktree نظيف؛ `git status` وSHA لكل PR #60–69 و#74؛ مقارنة الأساس واختبار تعارض وتبعيات خاصة بترحيل 0016؛ لا دمج/Push إلى الفرع المشترك | بيان branch→SHA→تعارض→اختبار→HOLD/GO، تشغيل lint/build/server/db/api داخل بيئة اختبار صناعية |
| **OC-MIGRATION-0016** | قبل أي اعتماد/دمج تشغيلي لترحيل 0016 المرتبط بعلاقات منتسب/معاملة، لا لمجرد نجاح CI | **OPENCODE المحلي أو CHAT CI** — `NOT_ASSIGNED` | تأكد من هوية **عنقود PostgreSQL مؤقت مستقل**، اسمه ومساره ومنفذه وقاعدته؛ تطبيق جميع migrations على بيانات صناعية تمثل حالات التكرار و`NULL`؛ جرّب preflight وتطبيقًا وتراجعًا/استعادة مسموحين؛ سجّل الفروق | إثبات أن uniqueness يعمل وأن الفشل يعود بأمان؛ **لا اتصال إلى `alsqaya_staging`** دون تفويض إضافي صريح |
| **OC-UI04-A23** | عند توفر جهاز Windows المحلي وتقرير المالك أن عمل UI-04 ما زال في مجلد العمل | **OPENCODE + المالك** — `WAITING_LOCAL_HOST / NOT_ASSIGNED` | افحص العمل غير الملتزم بلا حذفه؛ شغّل React/Express/PostgreSQL المحلي ببيانات اختبار؛ تحقق من القوائم اليمنى، تبديل الأدوار، ملف المنتسب، Timeline، زر «اطلعت» والإعمام الرسمي، وشاشات A2.3 | سيناريوهات UAT حقيقية ولقطات ومخطط الطلب/الرد، pass/fail لكل دور؛ لا ادعاء بانطباق نجاح اختبارات UI السابقة على Backend |
| **OC-ATTACHMENTS-UAT** | عند إعادة اختبار الرفع والتنزيل في UI-04/A2.3؛ رُصد خلل أزرار المرفقات سابقًا لكنه يحتاج إعادة إثبات بعد التغييرات | **OPENCODE محليًا** — `WAITING_LOCAL_HOST / NOT_ASSIGNED` | بيانات صناعية؛ رفع ملف صغير بالسحب/الزر، تأكيد byte upload وعدم فتح تبويب جديد، فحص original download، منع تجاوز الدور، اختبار ملف غير صالح ثم استعادة | URL/status، قيمة hash/الحجم الحقيقي ولقطات UI، نجاح/فشل موثق؛ لا تخدع الواجهة بمرفق metadata فقط |
| **OC-ROLE-VISIBILITY-UAT** | بعد Phase11–13 وعند توفر حسابات اختبار حقيقية على API | **OPENCODE + المالك** — `NOT_ASSIGNED` | اختبر منتسبين وحساب مدير/أدمن مع مؤشرات هوية صناعية؛ الكتاب المخصص لموظف يظهر له وحده، الإتاحة والسحب، منع قوائم/عمليات لا يملكها، عدم ظهور سجلات الآخرين والعودة بعد logout | HTTP 401/403/404 بحسب العقد، عدم تسريب وجود كتاب محجوب، سجل خطوات ولقطات، وعدم توسيع الصلاحيات لتجاوز الاختبار |
| **OC-ACK-ADMIN-UAT** | إذا استمر خطأ «تعذر قراءة السجل» عند إعادة اختبار سجل إقرارات الإعمام | **CHAT تحليل API أولًا، OPENCODE للمتصفح عند الحاجة** — `RECHECK_REQUIRED / NOT_ASSIGNED` | تعيين API endpoint والحساب والدور، مراجعة طلب/رد وعزل السجل؛ لا تعديل زر «اطلعت» لغير الإعمام | نتيجة UI/HTTP حقيقية مع حالتي إعمام وغير إعمام؛ تعديل حد أدنى فقط إن بقي الخلل |
| **OC-HOST-ACCEPTANCE** | بعد اكتمال مراجعات الكود والتحضير للنشر الداخلي وتصريح المالك | **OPENCODE + مسؤول الخادم + المالك** — `WAITING_HOST / NOT_ASSIGNED` | فحص تشغيل Windows/LAN الحقيقي وخادم Express/PG، الصلاحيات وتخزين الملفات، نسخ احتياطي/استعادة بيانات صناعية، فشل الشبكة وإعادة التشغيل، الأداء، وعدم كشف البيانات؛ فحص SHA معتمد | تقرير UAT مضيف واضح، استعادة مثبتة وقرار `RELEASE_GO/NO_GO` مستقل عن نجاح CI |
| **OC-REPORTS-23** | فقط عند العمل على قبول تشغيل التقارير في نطاقها المعتمد، بعد استيفاء حواجزها | **OPENCODE + مراجعة أمنية/مضيف** — `BLOCKED_BY_503_GATE / NOT_ASSIGNED` | فحص PDF/Docker/الخط العربي/الحقوق/العزل/انهيار المتصفح/التصدير وSQL للمنتسب؛ افصل code review عن تشغيل الصورة الحقيقية | براهين SQL العزل والتصدير الفعلي وDocker/host، وقرار أمني مستقل؛ **ممنوع إزالة HTTP 503 تلقائيًا** |

## C. الأعمال التي تبقى على CHAT ولا نستهلك لها OpenCode تلقائيًا

1. **Phase 11-A وN-A لكل مرحلة لاحقة:** فحص المسارات والموديلات/المكتبات وأخطاء المجال والصلاحيات، مع إحالات دقيقة إلى الملفات.
2. **N-B القابلة للإثبات عبر الأدوات:** تعديل الكود في فرع مستقل، إنشاء اختبارات، تشغيل GitHub CI وPostgreSQL الاصطناعية، ومراجعة التقارير.
3. **فحص تعارضات PR غير المدمجة بالـCI:** تحميل رؤوس PR، دمج تجريبي في runner، مقارنة الاختبارات؛ لا حاجة لـOpenCode إذا كانت الأدلة كافية.
4. **التقارير/القرارات والفرز:** تعيين شدة كل عيب، اختيار `RECHECK N` أو `AUDIT N+1`، وتجهيز تسليم OpenCode عند وجود مانع حقيقي.
5. **التوافق مع المكتبات الحديثة:** التثبيت المؤقت في CI دون تعديل `package-lock.json`، ومعالجة تحديث إلزامي فقط عند ثغرة/عائق مؤكد.

## D. ترتيب التشغيل عند عودة الجهاز

1. **قراءة فقط** أولًا: `git status --short` و`git rev-parse HEAD` ومسارات ملفات OpenCode/المستخدم، دون `reset/clean/checkout` مدمّر.
2. تحديد ما إذا كان OpenCode مكلفًا فعلًا بمهمة نشطة؛ لا يلمس CHAT ملفاته حتى تُسلَّم المهمة.
3. **مسار منفصل:** اختبار كل الإصلاحات النهائية في clone/قاعدة صناعية، ثم `OC-MIGRATION-0016` إن كان مرشح الدمج يحتاجه.
4. بعدها اختبار `OC-UI04-A23` و`OC-ATTACHMENTS-UAT` و`OC-ROLE-VISIBILITY-UAT` وفق الصلاحيات المتاحة؛ المالك يراجع الشاشة والحالات الحرجة.
5. قبول التشغيل/الدمج/النشر يبقى قرارًا مستقلًا؛ لا يُستنتج من إغلاق المراحل 1–10 برمجيًا.

## E. بطاقة التحديث لكل مهمة خارجية

```text
Task ID:
Phase / step: N-A | N-B | HOST
Classification: CHAT | OPENCODE | HYBRID | BLOCKED
Status: NOT_ASSIGNED | ASSIGNED | IN_PROGRESS | BLOCKED | VERIFIED | CLOSED
Confirmed owner / branch / SHA:
What is already verified:
Blocked_by / why ChatGPT cannot prove it:
Exact machine/test database target (synthetic only):
Scope and forbidden changes:
Plan/Build mode:
Commands to run after script + target inspection:
Expected positive/negative test evidence:
OpenCode output SHA + CI / screenshots / logs:
Independent review and user's decision:
Next action:
```

**قانون تحديث السجل:** لا تغيّر `ASSIGNED` أو `VERIFIED` بناءً على نشاط GitHub وحده؛ يجب تكليف أو نتيجة أبلغ عنها المالك. حافظ على العيوب المؤكدة فقط، وأعد التحقق من المشاكل القديمة بعد كل إصلاح جديد، ولا تنقل أوامر مؤثرة على قاعدة المؤسسة إلى قائمة مهام آلية.
