# تقرير فحص المرحلة الحادية عشرة — Phase 11 / Authentication, Accounts & Sessions

**التاريخ:** 23 نوفمبر 2026  
**المنهج:** فحص مصدر الشيفرة ومقارنة فروع A/B/C مع مراجعة سجلات CI الموجودة؛ **تدوين فقط دون تعديل التطبيق أو تجارب جديدة أو تعامل مع قاعدة المستخدم أو دمج رسمي**.  
**المراجع الثابتة:** [PR #71 Phase11-A](https://github.com/daboolgame123-creator/Saqa/pull/71) `6c95bfd9d6c731ca8e2cceb67a41435db12c3528`، [PR #72 Phase11-B](https://github.com/daboolgame123-creator/Saqa/pull/72) `394037afe171249a7b419f0a6b2b2e99c92fe8b5`، [PR #74 Phase11-C](https://github.com/daboolgame123-creator/Saqa/pull/74) `401088aeb7e07b898617334094fd102fb6400b62`، مقارنة مع [PR #96](https://github.com/daboolgame123-creator/Saqa/pull/96) `0f16837a437dc9a9d76de395f95ddb80de947129`. جميعها **Draft / لا Merge**.  
**الحكم:** `REVIEWED_WITH_FINDINGS / SECURITY_INDEPENDENT_REVIEW_PENDING / FIXES_DEFERRED / RELEASE_NO_GO`.

## 1. الحدود وملفات المرحلة

حسب `ALSQAYA_PLAN.md` §11 و§27: تسجيل الدخول برقم باج أو هاتف، رمز تفعيل إداري ساعة واحدة، تغيير/استعادة السر، إدارة الحسابات، جلستان أو أكثر للمستخدم، خمول 30 دقيقة، RBAC قبل العمليات الإدارية وسجل أحداث أمني.

جُردت ملفات مرشح PR74 العشرة، وقورنت بفروع التشخيص والإصلاح: `server/src/auth/{authService,accountRepository,otpRepository,sessionRepository,authRoutes,authController,authTypes,otpProvider,secretVault,crypto,firstAdminBootstrap,sessionMiddleware}.ts`، `server/migrations/0005_authentication.sql`، `server/tests/{db/phase11AuthAuditDiagnostics.test.ts,db/phase11OtpQuotaNonmatch.test.ts,api/auth.test.ts}`، ملفات Workflow، وثيقة `docs/PHASE_11_A_AUTH_AUDIT_20261123.md`، ومرجع مصادقة العميل `src/api/sessionToken.ts` في Phase10.

## 2. سلامة مثبتة ضمن المرشحين والاختبارات السابقة

1. **حماية الهوية:** رموز الجلسة عشوائية لا يخزَّن منها إلا التجزئة؛ `AuthService.resolveSession` يتحقق من صلاحية الجلسة ومن حالة الحساب ومدة خمول 30 دقيقة. `SessionRepository.touchIfLive` يشترط عدم الإبطال وعدم انتهاء الخمول في جملة SQL واحدة. الجلسات المتزامنة مسموحة؛ logout يلغي الجلسة المعينة؛ تغيير السر يلغي جلسات الحساب.
2. **تشفير الاعتماد:** سر الحساب قابل للاسترجاع من خلال AES-256-GCM بمفتاح منفصل وفق سياسة العرض الإداري المعتمدة؛ هذه سياسة حساسة وتبقى عرضة لمراجعة مستقلة ولا تُغيّر من تلقاء نفسها. `authRoutes.ts:50–58` يفرض `Cache-Control: no-store` و`nosniff` حتى عند فشل المصادقة.
3. **صلاحيات الخادم:** المسارات الإدارية لإصدار OTP/إعادة الضبط محمية بجلسة وصلاحية `manage_accounts`، وكشف السر يستلزم `manage_security`، مع `requireChangedSecret`. مسارات البيانات الأخرى تفحص الجلسة قبل الموارد، ولا تُمنح صلاحية لمجرد إخفاء زر React.
4. **قواعد OTP:** `ADMIN_REGISTRATION_OTP_TTL_MINUTES=60` للإصدار الإداري؛ `OTP_TTL_MINUTES=5` للرمز الذاتي الموروث. وضع `AUTH_OTP_PROVIDER=admin` يمنع التسجيل والاستعادة الذاتيين بالهاتف (`forbidPhoneSelfService`) ويتطلب تحقق مسؤول حضوريًا؛ مزوّد `log` لا يسمح به في `NODE_ENV=production`. استهلاك الرمز ذرّي ولا يقبل استهلاكًا ثانيًا.
5. **إصلاحات مرشحة مثبتة باختبارات الاصطناعية:** PR72 يضيف قفل PostgreSQL لكل هاتف طوال فحص العداد/الإصدار، وتحققًا ذَرّيًا من نفس بيانات الاعتماد عند إنشاء جلسة، وشرطًا يحمي حظر الحساب الإداري عند فك التجميد، وتحققًا أخيرًا من الجلسة بعد logout؛ PR74 يضيف تسجيل طلبات OTP غير المطابقة **كرموز غير قابلة للاستخدام** حتى لا تتجاوز العداد.

### سجل CI والتفسير الصحيح

- [CI التشخيص #45072887615](https://github.com/daboolgame123-creator/Saqa/actions/runs/45072887615) على PR71: **2/2 اختبار تشخيصي ناجح = إعادة إنتاج الثغرتين** (تجاوز الستة للعدد؛ جلسة بالسر القديم بعد تغييره)، وليست موافقة أمنية.
- [CI PR72 #45074462235](https://github.com/daboolgame123-creator/Saqa/actions/runs/45074462235): اختبارات قبول الأمن **4/4 PASS** بعد الإصلاحات المرشحة P11-01/02/03/05.
- [CI قبل إصلاح 11-C #45076236296](https://github.com/daboolgame123-creator/Saqa/actions/runs/45076236296): **FAILED** باختبارين فعليين لعدم احتساب الطلبات غير المطابقة، وهذا إثبات للحالة P11-06.
- [CI PR74 للأمان #45076556334](https://github.com/daboolgame123-creator/Saqa/actions/runs/45076556334): اختبارات P11-B **4 PASS** وP11-C **3 PASS** وكل انحدارات الخادم/DB/API ناجحة.
- [CI التجميع المؤقت #45076556355](https://github.com/daboolgame123-creator/Saqa/actions/runs/45076556355): على SHA PR74، تركيبة Phases1–11-C داخل Runner مؤقت دون Push/Merge: **417 خادم +243 PostgreSQL +296 API = 956 ناجحًا، 0 فشل، 1 متخطى**؛ أمن 4+3 يُشغّل أيضًا منفصلًا وهو ضمن نطاق الفحوص السابقة، **ولا يُضاف مرة ثانية إلى عداد المجموع**. `npm audit` high-severity ناجح وفق PR74، وتبقي تنبيهات moderate وTypeScript7 ملفات صيانة منفصلة.

## 3. ملاحظات المسح — الإصلاح الحالي مؤجل

### AUD-11-01 — فحص أمن مستقل إلزامي (موجود سابقًا؛ لا معرّف جديد)

**`INDEPENDENT_REVIEW_PENDING / SECURITY_RELEASE_GATE`.**  
يظل فحص OpenCode المستقل `OC-11-SEC` غير مكلف/غير منفذ وفق PR71/72/74. يجب مراجعته على **SHA نهائي واحد بعد تجميع مصدر المراحل**، بما فيه تعاقب تغيير السر وتسجيل الدخول، OTP وحفظ Audit، إعادة ضبط الحساب الإداري، إبطال الجلسة، حماية المفتاح وRBAC، مع تقرير بالأدلة. نجاح CI وحده لا يغلق الشرط، ولا يجوز اعتبار OpenCode قيد العمل تلقائيًا.

### AUD-11-02 — تجاوز حد OTP بالطلبات المتزامنة على الكود الأصلي (P1 أمني؛ `P11-01`)

**`REPRODUCED_ON_BASE / FIX_CANDIDATE_PR72_PR74 / NOT_MERGED`.**  
PR71 أثبت في PostgreSQL اصطناعي 6/6 طلبات OTP متزامنة ناجحة بدل خمسة. PR72 يحمي `withSerializedOtpRequest` بقفل `pg_advisory_xact_lock(hashtextextended(phone,71111))` داخل معاملة مشتركة، ويسجل الحظر وAudit ثم يرجع HTTP 429 **بعد COMMIT**؛ اختبارات PR74 تثبت خمسة فقط من ستة. `authService.ts:410–458`، `otpRepository.ts:60–69`. **حد الانكشاف:** مزوّد `admin` المعتمد يمنع الخدمة الذاتية؛ لا ندعي أن سيناريو هاتف الاختبار قابل للاستغلال في الإنتاج الإداري الحالي، ومع ذلك يجب حفظ الإصلاح قبل إدخال أي مزوّد ذاتي مستقبلًا.

### AUD-11-03 — تسجيل دخول بالسر القديم بعد تغييره (P0 أمني على الأساس؛ `P11-02`)

**`REPRODUCED_ON_BASE / FIX_CANDIDATE_PR72_PR74 / SECURITY_REVIEW_PENDING`.**  
الاختبار التشخيصي أصدر Session صالحة بعد أن تغير الاعتماد وأُبطلت الجلسات، لأن قراءة السر سبقت معاملة إنشاء جلسة. PR72/74 يستخدم `AccountRepository.finalizeLoginIfUnchanged(snapshot)` بجملة `UPDATE users … WHERE status='active' AND secret_ciphertext/iv/tag/key_id IS NOT DISTINCT FROM snapshot` داخل معاملة إصدار الجلسة؛ محاولة قديمة تسجل رفضًا دائمًا بلا إنشاء جلسة (`authService.ts:688–754`، `accountRepository.ts:237–255`). قبول الاختبارات الاصطناعية مثبت؛ **لا إعلان إصلاح إنتاج رسمي حتى مراجعة مستقلة ودمج واحد**.

### AUD-11-04 — سباق فك التجميد مع الحظر الإداري (`P11-03`)

**`SOURCE_CONFIRMED_ON_BASE / FIX_CANDIDATE_PR72_PR74`.**  
المستودع القديم يعيد الحساب إلى active دون شرط الحالة. PR74 `accountRepository.ts:282–290` يشترط `status='frozen' AND frozen_until<=now()` ويمنع `freeze` من الكتابة على `blocked`، مع اختبار قبول P11-03. لا إجراء جديد الآن إلا الحفاظ على هذا SQL عند التكامل وإعادة الاختبار على SHA النهائي.

### AUD-11-05 — هاتف مشترك يُختار له أول حساب بصمت (`P11-04`؛ قرار مالك)

**`SOURCE_CONFIRMED / OWNER_IDENTITY_POLICY_PENDING / NOT_FIXED`.**  
`AccountRepository.findByEmployeePhone` في `accountRepository.ts:125–139` ينفذ `ORDER BY u.created_at,u.id LIMIT 1` حتى إذا اشترك أكثر من منتسب بالهاتف، وتستعمله مصادقة الهاتف واستعادة السر. لا يوجد قرار معتمد هل يمنع الهاتف المكرر أصلًا أو يطلب معرّفًا ثانيًا أو يتوقف غموض الهوية؛ لا يصح إعطاء حساب الأول تلقائيًا كحل دائم دون قبول. معيار القرار: اختبار هاتف مشترك بحسابين (نشط/محظور)، الحياد في كشف وجود الحساب، وسلوك الاستعادة/الدخول، والحفاظ على دخول الباج مستقلًا. يحتاج قرار مالك المشروع قبل أي تعديل لقاعدة العمل.

### AUD-11-06 — سباق Logout/Reset مقابل تحقق Session (`P11-05`)

**`SUSPECTED_ON_BASE / DETERMINISTIC_ACCEPTANCE_PASS_PR72_PR74`.**  
مرشح الأساس يقرأ حالة session ثم يلمسها بعد احتمال الإبطال؛ وُصف هذا السباق في Phase11-A بأنه مشتبه به ولم يثبت اختبارُه السلبي على الأصل. PR72/74 `sessionRepository.ts:68–81` يستخدم UPDATE مشروطًا `revoked_at IS NULL AND last_activity_at>idleLimit`، وتتحقق `authService.ts:913–917` من النتيجة قبل إرجاع الهوية. اختبار تزامن محدد يثبت أن Logout سابق لخطوة التحقق الأخيرة يمنع الاستعمال. هذا لا يعني إلغاء طلب قد حصل مسبقًا على هوية صحيحة؛ المطلوب ضمان ترتيب القرار المحدد.

### AUD-11-07 — طلبات OTP غير المطابقة لا تدخل عداد الهاتف في الكود القديم (`P11-06`)

**`REPRODUCED_RED_CI / FIX_CANDIDATE_PR74 / NOT_MERGED`.**  
قبل PR74، طلبات تسجيل بباج خاطئ أو استعادة هاتف مجهول أو إصدار إداري لهدف غير مطابق لا تُنشئ صفًا في `auth_otp_codes`؛ الاستعلام `countRequestsSince` لا يراها، وقد تحصل ست استجابات محايدة دون حد 5/15 دقيقة. [RED #45076236296](https://github.com/daboolgame123-creator/Saqa/actions/runs/45076236296) أثبت حالتين فاشلتين. PR74 `otpRepository.ts:96–106` يكتب صفًا عشوائي التجزئة، مُبطلًا عند الإدخال، لكل طلب غير قابل للإصدار، بما فيها الرفض الإداري الذي كان يرمي خطأ قبل commit؛ اختبارات P11-C الثلاثة ناجحة على CI النهائي. **لا يُصدر رمز قابل للتحقق أو SMS لهذه المحاولات.** حد الخدمة الذاتية في وضع admin كما في AUD-11-02.

### AUD-11-08 — الحفاظ على إصلاحات Phase11-C في شجرة التكامل النهائي (حاجز دمج)

**`SOURCE_BLOB_EQUAL_BETWEEN_PR74_AND_PR96 / FINAL_INTEGRATION_UNVERIFIED`.**  
مقارنة محتويات GitHub عند SHA PR74 وPR96 أظهرت أن **أربعة ملفات المصادقة** `authService.ts`، `otpRepository.ts`، `accountRepository.ts`، `sessionRepository.ts` تحمل **نفس SHA Git blob** بالفعل في الفرعين. هذا يقلل خطر فقدان إصلاحات Phase11-C على فرع Phase15-N، بخلاف تعارض `apiClient.ts` الخاص بمرحلة10 `AUD-10-05` و`server.ts` مرحلة8 `AUD-08-04`. لكنه **لا يثبت أن شجرة الإصدار الرسمية تضم كل هذه الملفات بنفس العلاقات والاختبارات**، ولا يستبدل مراجعة OpenCode؛ يجب اختبارها مجتمعة عند قرار الدمج، دون فتح إصلاح مكرر.

## 4. شروط الإغلاق والخطوة التالية

- **لا إعادة تشغيل** اختبارات عيوب OTP أو تغيير السر في هذه الجولة؛ استُخدمت سجلات CI السابقة فقط. لم يُثبت وجود اختراق لمستخدم فعلي أو تسريب أسرار من بيانات العمل.
- لا خروج من `RELEASE_NO_GO` قبل معالجة **قرار الهاتف المشترك `AUD-11-05`**، واعتماد مراجعة OpenCode المستقلة `AUD-11-01`، ومراجعة الدمج الكامل والمضيف/السياسات اللازمة. إصلاحات PR74 اجتازت CI اصطناعيًا **ولكنها ليست مدمجة رسميًا**.
- يحتفظ السجل المركزي بارتباط `P11-01…P11-06` بمعرّفات `AUD-11-02…AUD-11-07`، حتى لا تُعاد المهام من الصفر.
- **التالي:** Phase12 — RBAC / Authorization، مرجع البداية [Draft PR #75](https://github.com/daboolgame123-creator/Saqa/pull/75) Phase12-A، ثم [Draft PR #76](https://github.com/daboolgame123-creator/Saqa/pull/76) Phase12-B، وفحص الصلاحية الحالية بعد خفض الدور وعلاقة المصادقة بنطاق القراءة، وتوثيق النتائج فقط.

**الحالة:** `PHASE11_REVIEWED_WITH_FINDINGS / SECURITY_FIX_CANDIDATE_TESTED / INDEPENDENT_REVIEW_PENDING / FIXES_DEFERRED / RELEASE_NO_GO`.
