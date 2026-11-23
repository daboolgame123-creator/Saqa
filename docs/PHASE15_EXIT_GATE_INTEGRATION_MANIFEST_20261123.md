# Phase 15 — بوابة الإغلاق وبيان النسخة التراكمية

**التاريخ:** 2026-11-23  
**الحالة:** `PHASE15_CODE_CANDIDATE_PASS / OC-15_INDEPENDENT_REVIEW_PENDING / OC-11_INDEPENDENT_REVIEW_PENDING / HOST_ACCEPTANCE_PENDING / NO_MERGE / RELEASE_NO_GO`.

## 1. الحكم المؤكد — بلا تضخيم

**آخر كود مرشح للمرحلة 15:** [Draft PR #89](https://github.com/daboolgame123-creator/Saqa/pull/89) HEAD `8320d749d7d62fcf131e6f0a10d5c02a81914a32`.  
**آخر CI تراكمي ناجح:** [run #45137856092](https://github.com/daboolgame123-creator/Saqa/actions/runs/45137856092)، 971 PASS / 0 FAIL / 1 SKIP (418 server، 243 synthetic DB، 310 API)، npm lint/build PASS و`npm audit --omit=dev --audit-level=high` بلا high/critical (2 moderate).
**لا يُفسَّر هذا على أنه قبول مستقل أو قبول استضافة أو إذن دمج.**

**تنبيه تكامل أساسي:** Workflow `.github/workflows/phase15-i-acknowledgement-race.yml` في PR #89 لا يختبر PR #89 بمعزل عن بقية أعمال المراحل؛ بل يعمل `checkout` للـHEAD، ويتحقق من أن الفروع المبينة أدناه عند SHAs ثابتة، ثم يدمج فروع **المراحل 1–10 في Working Directory مؤقت داخل GitHub Actions فقط**، وبعد ذلك يُنفِّذ الاختبارات. **PR #89 ليس بديلاً عن إدماج الفروع 1–10 بالترتيب**. لا يجوز استنتاج أن نسخ المستودع الأساسية تحتوي هذه التعديلات لأن Workflow نجح، أو دمج PR #89 بمفرده ثم إعلان اكتمال النظام.

## 2. مكونات المرشح المتحقّق منها — بالترتيب

| المرحلة | الفرع في GitHub | SHA المثبت في CI |
|---|---|---|
| 1 | `fix/phase1-domain-integrity-20261122` | `f2c91947d815d37e066de841c5216f3680473a86` |
| 2 | `audit/phase2-personnel-20261122` | `64b0b35619038ceb4b1cf4b44c6226f304cd41f8` |
| 3 | `audit/phase3-employee-profile-20261122` | `c993756837a44d9b7da682f37a48303a783276dd` |
| 4 | `audit/phase4-transaction-domain-20261122` | `ed93da612d7e6e471e47951d4894391370f0ba07` |
| 5 | `audit/phase5-transaction-employee-20261122` | `cbb1eae9de186862b0fd49fe6ac9477ad41c63ee` |
| 6 | `audit/phase6-daily-situation-20261122` | `83ffa7be95250affd60104a86d063561f7b52949` |
| 7 | `audit/phase7-timeline-20261122` | `7293aaccbe34108880b8ef76488bc6e3ee6b1546` |
| 8 | `audit/phase8-backend-foundation-20261122` | `8fac8363e6a900abd64fdea4d3d830ec89d428a1` |
| 9 | `audit/phase9-postgres-migrations-20261122` | `949802221cbcc96418b6be5405c115164dc03422` |
| 10 | `audit/phase10-api-data-layer-20261122` | `a3f3fa6e50e201047a6597a792b3454f7e6b17bc` |
| 11–15 | السلسلة الموروثة على PR #89 (تتضمن PR #71–89) | `8320d749d7d62fcf131e6f0a10d5c02a81914a32` |

**مرجع تكوين النسخة التراكمية:** راجع الأسطر 53–95 من `.github/workflows/phase15-i-acknowledgement-race.yml` على SHA #89، لا تنسخ أوامر الدمج لتطبيقها مباشرةً على فروع الإنتاج. الـWorkflow يستعمل merge مؤقتًا فقط؛ كل فرع يظل Draft وغير مدمج رسميًا.

## 3. العوائق المتبقية، ومن يحلها

| البوابة | من | معيار الإغلاق |
|---|---|---|
| `OC-15-ATOMIC-AUDIT` | **OpenCode (Plan/read-only)، لم يُرسَل بعد** | مراجعة أمن مستقلة للـHEAD الحالي مع فحص `withTransaction` وAudit/Notification/ViewLog و`FOR SHARE` وتسلسل القفل/الأرشفة والـRBAC/Scope؛ إما PASS موثق أو عائق حقيقي بملف وسطر وتأثير |
| `OC-11-SEC` | **OpenCode، لم يُرسَل بعد** | مراجعة مستقلة للمصادقة والجلسات ومدة تفعيل الرمز (ساعة)؛ لا تعدّ CI مراجعة مستقلة |
| **سياسة المالك** | OWNER | تأكيد سياسة الهاتف المشترك، سياسة تخصيص الدور، ومعيار الإعمام الذي يستلزم «اطلعت». معيار الخادم الحالي للعموم `direction='وارد' && visibility='PublicToEmployees'`؛ لا تُخترع استثناءات للكتب الخاصة أو تعتمد صفة الإعمام من اسم حقل حر |
| **تشغيل المضيف** | OWNER/HOST | قبول على بيئة Windows/LAN الفعلية *باستخدام حسابات وكتب اصطناعية فقط* مع تحقق الصلاحيات، حفظ إقرارات الإعمام، الأرشفة/الاستعادة، أذونات قاعدة بيانات Audit، النسخ الاحتياطي/الاستعادة وفق إجراءات المؤسسة، وحجب 503 للتقارير حيث ما يزال شرطًا |
| **دمج رسمي لاحق** | OWNER بعد المرور بكل البوابات | مراجعة تكامل المراحل **1–15 جميعًا** على Target صحيح، وتجميع نهائي من Commit التكامل نفسه، ثم قرار Merge صريح؛ لا تعتمد تشغيل CI التاريخي وحده |

## 4. فحص تشغيل محلي مختصر عند السماح — لا يُنفذ بواسطة CHAT الآن

- في **staging اصطناعي ومعزول مُحدّد الهوية**، حساب admin ينشئ كتابًا واردًا عامًا وكتابًا عاديًا وحساب employee. لا تستخدم أسماء أو معاملات المنتسبين الحقيقيين ولا قاعدة المؤسسة.
- يتأكد صاحب الحساب من ظهور «اطلعت» للإعمام المؤهل فقط، وحفظ ختم واحد للتكرار، وأن منتسبًا آخر لا يستطيع الادعاء بالنيابة عنه. فحص HTTP المباشر للكتاب غير المؤهل يجب أن يُعيد 404؛ إذا لم توجد أداة موثوقة لا تنفّذ الطلب يدويًا باستخراج رموز جلسات حساسة، بل اتركه للاختبار الآلي المثبت.
- أرشفة الكتاب بعد الإقرار لا تُفقد صف الاطلاع أو المرفقات والروابط؛ الكتاب المؤرشف محجوب عن القراءة النشطة، والاستعادة تعيده وفق صلاحية المسؤول.
- يُراجع المسؤول `audit_logs` بإذن DB المناسب، ويُتأكد أن المدير/المنتسب لا يستطيعان التعديل أو القراءة خارج صلاحياتهما، وأن تقارير 503 ما تزال محجوبة حيث يلزم.

**شرط السلامة:** لا تشغيل أو تغيير تلقائي على `alsqaya_staging` أو بيانات المؤسسة. لا تنفيذ لاختبار Host دون إذن المالك لتلك البيئة.

## 5. قرار الحركة التالية

1. **لا مزيد من فتح مهام CHAT الاختبارية للمرحلة 15 بلا دليل جديد.** الاختبارات المتعلقة بالعيوب P15-02 وP15-06 وP15-07 وP15-08 والاختبار الشامل نجحت.
2. تسليم المهمة المكتوبة في `docs/OPENCODE_PHASE15_ATOMIC_AUDIT_REVIEW_PROMPT_CURRENT.md` إلى OpenCode بوضع Plan/read-only عند توفره، وإتمام `OC-11-SEC` منفصلًا.
3. بعد مراجعات OpenCode وHost وقرار المالك، أغلق المرحلة 15 وابدأ **Phase16-A inspect/triage** فقط وفق خطة المراحل. **لا يُعلن إغلاق نهائي الآن**.

**كل الأعمال المذكورة أعلاه حالة تسليم وليس تنفيذًا موعودًا في الخلفية؛ أي نجاح لاحق يجب أن يكون موثقًا فعليًا.**


## 6. Live reference verification and acknowledgement scope triage — 2026-11-23

**Read-only evidence; no new code or test execution in this inspection.**

- Queried GitHub refs for **all 10 Phase1–10 branches** listed in §2 and matched each live branch HEAD **exactly** against the corresponding pinned 40-character SHA. Result: **10/10 MATCH, 0 DRIFT**. This confirms the candidate inputs have not changed since the documented CI run; it does not mean that those commits have been merged into the canonical base.
- Queried PR #89 metadata: HEAD remains `8320d749d7d62fcf131e6f0a10d5c02a81914a32`, `draft=true`, `merged=false`, base `phase-10-api-data-layer`.
- Queried GitHub Actions attached to that exact SHA: [run #45137856092](https://github.com/daboolgame123-creator/Saqa/actions/runs/45137856092), `completed/success`. Its workflow explicitly checks all 10 pinned refs and merges them **only within the ephemeral runner** prior to TypeScript, build, server/DB/API and targeted regression tests. Thus **CI success is for the temporary cumulative tree, not the raw PR head by itself**.
- Scoped source review of `viewLogService.ts`, `transactionScopeSql.ts` and `availabilityRepository.ts`: a concurrent **per-employee availability revoke** does not affect the current formal-acknowledgement policy, since `acknowledge()` admits only `direction='وارد' && visibility='PublicToEmployees'`, whereas the per-employee availability branch in `transactionScopeCondition()` applies when `visibility='SpecificEmployees'`. **No defect established; do not add a speculative regression or widen acknowledgements.** A future owner decision allowing acknowledgements on restricted books would require a new race/security review.
- Other write endpoints outside the specifically audited mutations remain subject to the existing §31 `عند الحاجة` policy; absence of Audit on every ordinary edit is not, by itself, a proven new defect. Independent reviewer should still examine policy and actual affected operations.

**Decision:** `LIVE_REFS_10_OF_10_MATCH / PR89_SHA_MATCH / EXISTING_CI_SUCCESS / NO_NEW_BLOCKER_FOUND`. This verification **does not complete** either `OC-15-ATOMIC-AUDIT`, `OC-11-SEC`, Host UAT, or any formal integration/merge. Do not open Phase16 until the agreed gate is satisfied.

## 7. Active handoff issue (2026-11-23)

[Issue #90 — Phase15 independent reviews / PostgreSQL runtime grants / Host UAT](https://github.com/daboolgame123-creator/Saqa/issues/90) is the active **NO-GO** checklist. It includes a read-only SQL privilege preflight for an **owner-authorized, separately verified synthetic database**, not for `alsqaya_staging` or production. Its creation **does not mean** OpenCode was assigned or Host was tested; every checkbox requires an actual recorded outcome. No code changed, no PR merged, and Phase16 remains gated.


## 8. Phase15-J no-op availability Audit fix — CI VERIFIED, 2026-11-23

**Confirmed defect and minimal correction:** direct and bulk grant HTTP controllers previously wrote `event_kind='create'` even if `grant()` or `grantToLinked()` inserted no rows (duplicate grant or no linked employees). In [Draft PR #91](https://github.com/daboolgame123-creator/Saqa/pull/91) HEAD `37c3040e78fb9f3e6ac115548465988b16b2090e`, stacked onto [Draft PR #89](https://github.com/daboolgame123-creator/Saqa/pull/89) HEAD `8320d749d7d62fcf131e6f0a10d5c02a81914a32`, both grant controllers now record Audit only if `grantedEmployeeIds.length > 0`. Synthetic regression covers legitimate grant, duplicate direct grant, empty bulk, notifications and retained access. Revoke behavior unchanged; no migrations, role policy or reports HTTP 503 changed.

**Exact SHA CI evidence:** [GitHub Actions Phase15-I run #45153758268](https://github.com/daboolgame123-creator/Saqa/actions/runs/45153758268) — `completed/success` on PR #91 SHA. The workflow verified all 10 pinned Phase1–10 refs, merged them **inside disposable Actions workspace only**, ran lint/build, full server/PostgreSQL/API, targeted regression, production-dependency high-severity check and clean-source check; all steps passed. Summary **418 server PASS / 1 SKIP; 243 synthetic DB PASS; 311 API PASS; total 972 PASS / 0 FAIL / 1 SKIP**. Targeted suites additionally passed (not counted twice). `npm audit --omit=dev --audit-level=high` succeeded, reported **2 moderate** findings (no high/critical blocker at configured threshold). Seven other Phase15 workflows B–H also completed `success` for this exact SHA.

**Still NOT accomplished:** PR #91 remains DRAFT/unmerged. The CI result certifies the **ephemeral cumulative tree** only, not an officially merged branch or approved deployment. When assembling a reviewed final integration SHA, include the PR #91 changes plus pinned Phase1–10 branches and rerun CI on **that exact integrated commit**. Required independent `OC-15-ATOMIC-AUDIT` and `OC-11-SEC`, owner policy decisions, production DB role-privilege assessment and Windows Host acceptance remain unverified. See [Issue #90](https://github.com/daboolgame123-creator/Saqa/issues/90). **Do not close Phase15, auto-merge, or start Phase16.**

**Status:** `PHASE15_J_CODE_AND_CUMULATIVE_CI_PASS / REVIEW_PENDING / HOST_PENDING / NO_MERGE / RELEASE_NO_GO`.
