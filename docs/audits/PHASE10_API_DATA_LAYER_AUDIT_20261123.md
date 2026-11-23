# تقرير فحص المرحلة العاشرة — Phase 10 / API Data Layer

**التاريخ:** 23 نوفمبر 2026  
**المنهج:** قراءة الشيفرة ونتائج GitHub Actions القائمة، مقارنة فروع المرحلة العاشرة مع Phase15؛ **توثيق فقط**، بلا تعديل كود التطبيق أو قاعدة بيانات أو دمج.  
**مرجع المرحلة:** [Draft PR #69](https://github.com/daboolgame123-creator/Saqa/pull/69)، SHA `a3f3fa6e50e201047a6597a792b3454f7e6b17bc`، أساس `phase-10-api-data-layer`.  
**مرجع التكامل المقارن:** [Draft PR #96](https://github.com/daboolgame123-creator/Saqa/pull/96)، SHA `0f16837a437dc9a9d76de395f95ddb80de947129`؛ **ليس** مدمجًا رسميًا مع PR69.  
**حكم الجولة:** `REVIEWED_WITH_FINDINGS / FIXES_DEFERRED / RELEASE_NO_GO`.

## 1. النطاق المفحوص

وفق `ALSQAYA_PLAN.md §26` تشمل Phase10 عميل API، DTO ↔ Domain، المحولات، التحقق على الخادم واختيار مصدر البيانات الرسمي. راجعت **8 ملفات متغيرة** في PR69 (العميل وSessionToken وMapper وAdapter واختبارات API ووثائق/CI) وتتبعت:
- `src/api/{apiClient,apiError,apiDataAdapter,sessionToken,index,mappers,localDataAdapter,pilotBootstrap}.ts` و`src/core/interfaces/dataAdapter.ts`.
- `server/src/api/{validation/queryValidators,validation/transactionValidators,dto/transaction,dto/recordMappers,services/transactionService}.ts`، و`server/src/repositories/transactionRepository.ts`.
- `server/tests/api/{apiClient,transactions}.test.ts` و`.github/workflows/phase10-api-data-layer-audit.yml` و`src/App.tsx`.
- فروق `apiClient.ts` و`sessionToken.ts` و`mappers.ts` بين SHA مرشح Phase10 وSHA مرشح Phase15-N، حتى لا يُفقد إصلاح حسّاس أثناء دمج الفرعين.

## 2. سلامة مثبتة بالشيفرة وCI السابق

1. **العزل بين الحسابات في مرشح PR69:** `sessionToken.ts:6–30` يحتفظ بــ`sessionRevision` متزايد حتى عند إعادة استخدام نص Bearer نفسه. `apiClient.ts:102–138` يرفض نجاح مورد جاء بعد تبديل الحساب بـ`SESSION_CHANGED` بعد قراءة جسم الرد، ولا يسمح لـ401 القديم بإلغاء جلسة أحدث. الاستثناء المقصود لمسارات `/auth/*` يبقي مسؤولية التزامن عند مسار المصادقة نفسه.
2. **مصدر الحقيقة:** `src/api/index.ts:14–32` يختار API افتراضيًا ولا ينتقل إلى localStorage عند فشل الاتصال/401/403. الوضع المحلي يحتاج اختيارًا صريحًا `VITE_DATA_SOURCE=local` أو حقن Adapter اختباري. النتيجة التي تُعرض بعد الإنشاء/التعديل تعتمد على DTO المُعاد من الخادم، لا على UUID متخيّل في الواجهة.
3. **عقود الكتاب:** `targetScope` يعبر `server/src/api/dto/recordMappers.ts:94–96` ثم `src/api/mappers.ts` إلى Domain. يتتبع اختبار HTTP على PostgreSQL اصطناعي الإنشاء والقراءة وPATCH الفعلي. `version` يبقى صادرًا من الخادم ومطلوبًا عند التعديل، و`month` مشتق من تاريخ الكتاب.
4. **قراءة cursor:** `ApiDataAdapter.loadTransactions:112–151` يجمع صفحات حجمها 100 مع رفض IDs مكررة أو صفحات أكبر من المتوقع أو cursor غير صالح. `transactionRepository.ts:298–335` يبني cursor ذي **ستة أرقام كسرية** من SQL للحفاظ على دقة PostgreSQL ويطبق نطاق القراءة قبل `LIMIT`، فلا يحصل المستخدم على صفحة موهمة بسبب ترشيح الصلاحيات بعد القراءة.
5. **السرية لا تعتمد على React:** مسارات الخادم تتحقق من الجلسة والصلاحيات، ولا يستعمل DTO العميل اسم المنتسب كإذن وصول بديل عن SQL.

**أدلة CI السابقة على SHA PR69:** [GitHub Actions #45069255998](https://github.com/daboolgame123-creator/Saqa/actions/runs/45069255998) الوظائف الثلاث `success`، وتركيب Phases1–10 مؤقتًا داخل Runner فقط: **417 خادم +236 PostgreSQL +296 API = 949 PASS، 0 FAIL، 1 SKIP**. اختبار API Client المركّز (**24 نجاحًا**) مشمول في عداد API/الخادم المناسب ولا يُضاف إلى المجموع. تجربة React/Vite/pg الأحدث مع TS5.8 نجحت على Runner مؤقت، لا ترقية فعلية، وTypeScript7 غير معتمد؛ بقي تنبيهان moderate حسب ملخص PR69.

## 3. الملاحظات المؤجلة

### AUD-10-01 — عميل الخط الزمني يرسل `sourceTypes` بصيغة لا يقبلها الخادم (P2 / عقد HTTP، إحالة `AUD-07-02`)

**SOURCE_CONFIRMED_CROSS_LAYER / HTTP_REPRODUCTION_PENDING.**  
`src/api/apiDataAdapter.ts:250–258` يحوّل مصفوفة الأنواع إلى `filter.sourceTypes?.join(',')`؛ `src/api/apiClient.ts:49–55` يرسلها قيمة Query نصية واحدة مثل `sourceTypes=leave%2Ccourse`. بينما `server/src/api/validation/queryValidators.ts:151–163` يتحقق عبر `list('sourceTypes',enumValue(...))`، و`server/src/api/validation/primitives.ts:109–119` يرفض غير `Array`، حتى مع نوع واحد `leave`. **هذا تعارض صريح في العقد؛** توقع رفض 400 عند تمرير مصدر واحد أو أكثر، ولم يُشغّل طلب HTTP جديد هنا.

**مطلوب لاحقًا:** اعتماد تمثيل Query وحيد ومتعدد موثّق (مثل معاملات مكررة إذا كان Express يدعمها مع parser المعتمد)، واختبار API من العميل إلى الخادم مع الحفاظ على رفض الأنواع غير المعتمدة. **المعرف الأصلي للحالة `AUD-07-02`؛ هذا رابط طبقة عميل، لا مهمة إصلاح ثانية.**

### AUD-10-02 — `limit` الرقمي للخط الزمني لا يجتاز محقق Query النصي (P2 / عقد HTTP، إحالة `AUD-07-01`)

**SOURCE_CONFIRMED_CROSS_LAYER / HTTP_REPRODUCTION_PENDING.**  
`src/api/apiDataAdapter.ts:252–259` يمرّر `filter.limit` العددي، لكن `buildUrl` في `apiClient.ts:49–55` يحوله إلى نص Query `limit=5` (عقد HTTP طبيعي). الخادم في `queryValidators.ts:162` يستعمل `optionalQuery(positiveInt('limit'))` بدل `queryPositiveInt` الذي يستخدمه في قوائم الكتب؛ `positiveInteger` في `primitives.ts:55–61` يقبل `number` لا `string`. لذلك مرشح 5 أحداث متوقع أن يُرفض عند API.

**مطلوب لاحقًا:** اختبار HTTP `limit=5/0/invalid` وتمرير القيمة المحوّلة الصحيحة إلى Service؛ **نفس `AUD-07-01`، لا إصلاح مكرر.**

### AUD-10-03 — رد HTTP 2xx ليس JSON قد يصل إلى Domain كأنه DTO صحيح (P3 / صلابة بروتوكول)

**SOURCE_CONFIRMED / LIVE_BAD_RESPONSE_NOT_REPRODUCED.**  
`src/api/apiClient.ts:59–72` إذا تعذّر `JSON.parse` يعيد النص الخام، و`:117–145` بعد التأكد من `response.ok` يطبّق `return payload as T` دون التحقق من نوع المحتوى أو هيكل DTO. مثال: Proxy يعيد HTML بنجاح 200 بسبب تهيئة خاطئة؛ `ApiDataAdapter.loadEmployees:67–73` سيحاول `rows.map` على string فينتج خطأ تنفيذ غير موحد بدل فشل بروتوكول واضح. **ليس تسريبًا ولا ثغرة وصول مثبتة**؛ كل endpoint تحت سيطرة الخادم المعتاد يعيد JSON في الظروف الطبيعية.

**معيار قبول لاحق:** رفض 2xx غير JSON في endpoints ذات الأجسام المطلوبة بخطأ بروتوكول موحد، مع الاحتفاظ بمعالجة 204 الفارغة وسلوك نصوص الأخطاء التشغيلية إن لزم، واختبار Proxy misconfiguration اصطناعي.

### AUD-10-04 — وضع Local Adapter قابل للضم في بناء Production بتكوين صريح (P2 / بوابة نشر لا اختراق)

**SOURCE_CONFIRMED_CONFIG / DEPLOYMENT_POLICY_PENDING.**  
`src/api/index.ts:16–29` يختار local عندما `VITE_DATA_SOURCE === 'local'` دون اشتراط `import.meta.env.PROD === false` أو تأكيد «نسخة عرض فقط». إن بُنيت نسخة مستخدمين فعلية بهذا الإعداد بطريق الخطأ، فإنها قد تعرض/تكتب بيانات localStorage مختلفة عن PostgreSQL، رغم عدم وجود fallback تلقائي من API. **هذا يتطلب خطأً في تكوين النشر وليس هجومًا مثبتًا**، ويجب الإبقاء على وضع Demo الصريح للمطورين.

**معيار القبول:** حاجز CI/Release يرفض `VITE_DATA_SOURCE=local` في حزمة الإنتاج المؤسسي ويثبت `VITE_DATA_SOURCE=api` في build المعتمد؛ لا إلغاء لوضع Demo قبل قرار المالك.

### AUD-10-05 — تعارض أمني ووظيفي عند دمج مرشح Phase10 مع Phase15-N (P2 / مانع تكامل)

**SOURCE_CONFIRMED_BETWEEN_DRAFTS / RELEASE_BLOCKER / CROSSREF `AUD-15-06`.**  
مرشح **PR69** في `src/api/apiClient.ts:103,117–138` يفحص `sessionRevision` ويمنع أن يصل رد الحساب القديم إلى واجهة الحساب الجديد؛ و`src/api/sessionToken.ts:6–30` يضيف جيل الجلسة، و`src/api/mappers.ts` ينقل `targetScope`. مرشح **PR96** على SHA `0f16837...` ما زال يحمل `apiClient.ts` أقدم **بلا** `getBearerRevision` أو `SESSION_CHANGED`، و`sessionToken.ts` الأقدم بلا جيل جلسة، و`mappers.ts` بلا نقل `targetScope`. هذه **فروق مثبتة في الشيفرة بين مرشحين مستقلين**، وليست دليلًا على أن ميزة PR69 نفسها فاشلة.

**الخطر عند دمج غير واعٍ:** أخذ ملف عميل Phase15 القديم قد يعيد احتمال عرض بيانات استجابة حساب قديم بعد تبديل المستخدم، ويُفقد نطاق استهداف الكتاب من UI. يجب أن يحافظ الدمج الرسمي على ثلاثية `apiClient+sessionToken+mappers` من PR69 مع تحديثات Phase15 الضرورية، وأن يجتاز **اختبارات تبديل الحساب وإعادة استخدام Bearer وtargetScope** على SHA دمج واحد؛ لا يكفي نجاح CI مؤقت على فروع منفصلة. لا دمج أو إصلاح الآن.

### AUD-10-06 — تحميل أرشيف الكتب كاملًا عند التهيئة بلا سقف إجمالي للصفحات (P3 / أداء وقبول مضيف)

**SOURCE_CONFIRMED_DESIGN / HOST_BENCHMARK_PENDING.**  
`src/api/apiDataAdapter.ts:115–151` يواصل طلب `/transactions/cursor` بمجموعات 100 حتى يحصل على صفحة قصيرة، مع رفض الصفحات المعيبة وإلغاء النتيجة عند خطأ أو تبديل جلسة. **لا يوجد حد لعدد الصفحات أو إجمالي زمن الاستيراد** خارج مهلة كل طلب في `apiClient.ts:100–104`، بحيث قد يتكرر الاتصال مئات المرات على أرشيف متعدد السنوات. هذا مقصود حاليًا للواجهة التي تحتاج القائمة الكاملة ولا يعد عطلًا مثبتًا، لكنه عبء تحميل مبدئي واستهلاك ذاكرة محتمل إذا كبر السجل.

**معيار قبول لاحق:** قياس زمن التهيئة على أرشيف اصطناعي بحجم متوقع وحالات 100/1000/10000 كتاب، ثم إقرار ما إذا كان يلزم pagination في UI أو تحميل تدريجي يحافظ على عدم تقديم أرشيف جزئي كأنه مكتمل. لا تغيير تلقائي لقواعد الإتاحة أو منع قراءة الموروث.

## 4. حدود الحكم والخطوة التالية

- **لم يُشغّل** اختبار HTTP جديد للـTimeline أو رد HTML؛ تلك توقعات مبررة من قراءة تسلسل الشيفرة تحتاج إثباتًا اصطناعيًا في دفعة الإصلاحات.
- لا تسريب إنتاجي مثبت من ملاحظات Phase10؛ اختبارات جلسات PR69 السابقة ناجحة، لكن **فروع الدمج الرسمية لم تعتمد** والمخاطر العابرة للمراحل `AUD-10-05` تحجب النشر حتى الدمج المراجع.
- لا تسليم إلى OpenCode جديد: مراجعاته السابقة موثقة، وهو ليس مطلوبًا لهذه الجولة الوثائقية.
- **التالي:** Phase11 — Authentication / Sessions / Accounts، تثبيت SHA للمرشح الخاص به، فحص كلمات المرور والجلسات والرمز المؤقت والصلاحيات والتدقيق، وتوثيق النتائج فقط.

**الحالة:** `PHASE10_REVIEWED_WITH_FINDINGS / FIXES_DEFERRED / RELEASE_NO_GO`.
