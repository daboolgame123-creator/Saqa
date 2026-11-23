# Phase 12-A — فحص بنية التفويض RBAC وفرز المخاطر

**التاريخ:** 2026-11-23
**المراجعة:** `12-A / INSPECTION ONLY` — لا تغيير صلاحية ولا كود إنتاج في هذه الخطوة.
**الأساس:** Phase11-C [Draft PR #74](https://github.com/daboolgame123-creator/Saqa/pull/74)، SHA `401088aeb7e07b898617334094fd102fb6400b62`. PR #60–69 غير مدمجة ولكن اجتازت التجميع المعزول على CI #45076556355.
**المرجع:** `ALSQAYA_PLAN.md` §10 و§28، البروتوكول `PHASE_AUDIT_TWO_STEP_PROTOCOL.md`.
**الحالة:** `PHASE12_A_INSPECTED / PHASE12_B_TESTS_REQUIRED / NO_MERGE`.

## البنية التي فُحصت

1. `authorization/permissions.ts`: الأدوار `admin/director/employee` والعائلات العشر؛ دور `archivist` التاريخي ليس مخوّلًا ولا يُرث من الواجهة.
2. `authorization/requirePermission.ts`: فرض `requirePermission` و`requireRole` و`requireResourcePermission`، وتحديد `approve_request` لقرارات المدير.
3. `api/routes/index.ts`: ترتيب `requireSession → requireChangedSecret → requireResourcePermission → attachAccessScope → attachRequestScope`، وحراسة `/audit-logs` و`/reminders` بوابة إدارية.
4. `auth/authRoutes.ts`: مسارات إعادة الضبط وكشف السر تتطلب `manage_accounts` و`manage_security`، والتسجيل الإداري يطلب `manage_accounts`.
5. `api/routes/resources.ts`: إتاحة الكتب ونسخها، الأرشفة والاستعادة، روابط الكتب، «اطلعت» وحدها للمنتسب بعد نطاق الرؤية.
6. `api/routes/requestRoutes.ts` مع `requestValidators`: قرار المدير `approve/reject/request_clarification` يمر على `approve_request`، وأفعال `submit/reply/cancel` تمر على `create` ولا تُمنح للموظف بلا قرار أعمال.
7. `api/rbac.test.ts` و`authorization.test.ts` و`api/requests.test.ts`: اختبارات مباشرة 401/403، الإدارة، تفويض القراءة والكتابة والقرارات موجودة بالفعل.

## الفرز

| ID | النتيجة | الدرجة / المؤكد | المسؤول والخطوة |
|---|---|---|---|
| P12-01 | `resolveSession` يعيد قراءة `users.role` في كل طلب، وهو تصميم صحيح ظاهريًا، لكن لا يوجد اختبار صريح في RBAC يثبت **خفض الدور مع استمرار نفس Bearer**. لا دليل على تجاوز قائم. | `TEST_GAP / SUSPECTED` | CHAT — 12-B: اختبار HTTP مباشر ينجح admin قبل التغيير، ثم بعد خفضه لـemployee تُرفض العمليات الحساسة 403، وبعد إعادته يعود الحق، ويبقى السجل دون كتابة ممنوعة. |
| P12-02 | إسناد الدور للحسابات الجديدة ليس له مسار إداري وفق §28، والاختبارات تغيّر `users.role` مباشرة؛ المستخدم طلب سابقًا تخصيص دور عند إنشاء الحساب. | `OWNER_POLICY_REQUIRED / NOT_CODE_SECURITY_DEFECT` | OWNER لاحقًا يحدد جهة الإسناد والدور الافتراضي قبل تصميم API/واجهة. **لا إضافة صلاحيات تلقائيًا**. |
| P12-03 | `archivist` قيمة تاريخية مقبولة في `users` لكنها `fail-closed` ولا تملك أي عائلة إذن. | `VERIFIED_EXPECTED / POLICY_DEFERRED` | OWNER يقرر مستقبلها؛ CHAT لا يغير schema أو grants. |
| P12-04 | HTTP method غير معروف يعيد `null` من `requiredPermissionForMethod` والوسيط يمرره، مع افتراض عدم وجود handler له. لا مسار منفذ ثبت تجاوزه. | `LOW / WATCHLIST` | لا تعديل تفويض بسبب خطر مستقبلي افتراضي؛ يُعاد تقييمه إن ظهر مسار غير معتمد. |
| P12-05 | `requestWorkflow` يفحص الإجراء لتحديد الحق، و`requestTransitionBody` يتحقق من القيم قبل الفرض. لم يظهر bypass مثبت. أفعال صاحب الطلب محجوبة حاليًا بقاعدة `create` وهو قيد أعمال معروف من Phase19. | `VERIFIED_BY_STRUCTURE / BLOCKER_EXTERNAL` | لا اختراع سياسة لرد المنتسب أو إرسال الطلب. |

## 12-B — عمل CHAT القابل للإثبات

- أضف **اختبارًا واحدًا محدودًا** لخفض/رفع الدور على Bearer قائم في `server/tests/api/rbac.test.ts`، يختبر الإدارة/القراءة/التعديل دون إعادة دخول، مع تحقق عدم تنفيذ الطلب المرفوض.
- شغّل `npm run lint` و`npm run build` و`npm run test:all` على PostgreSQL اصطناعية، وأعد `api/rbac.test.ts` بالتخصيص. إذا أثبت الاختبار تجاوزًا فعليًا فالإصلاح أصغر رقعة في Auth/RBAC فقط ثم إعادة الاختبارات.
- نفّذ اختبار تجميع موقّت لـPR #60–69 مع المرشح Phase12 على نفس SHA بعد اكتمال التغييرات؛ **لا push للفرع الرسمي أو merge**.
- **OpenCode:** لا حاجة لاستخدامه الآن؛ `OC-11-SEC` المراجعة الأمنية المستقلة السابقة تبقى `WAITING_EXTERNAL/NOT_ASSIGNED`.

**بوابة الانتقال:** نجاح 12-B وإغلاق أية ثغرة مثبتة يسمح بالانتقال إلى 13-A **لتدقيق الكود فقط**، مع عدم إعلان إغلاق Phase11 أو الجاهزية التشغيلية قبل المراجعة المستقلة وقبول المضيف. لا نفترض أن `CODE_AUDIT_CLOSED` يساوي `MERGED` أو `RELEASE_GO`.
