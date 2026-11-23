# Phase 15 — فحص Windows المحلي للقراءة فقط قبل القبول التشغيلي

**التاريخ:** 2026-11-23  
**الحالة:** `READ_ONLY_PREFLIGHT_PREPARED / HOST_NOT_TESTED / PHASE15_RELEASE_NO_GO`.

## الغرض وحدود الأمان

هذه خطوة **جرد مضيف**؛ ليست UAT حقيقيًا، ولا اختبار DB أو Audit أو تقريرًا بأن المشروع نُشر. يجب ألا تُغيِّر قاعدة `alsqaya_staging`، أو تُعيد Bootstrap، أو تُشغّل migrations، أو تنسخ ملفات المؤسسة، أو تدمج أي فرع.

المجلد المحلي المعتاد: `C:\Users\dell\ALSQAYA-STAGING`. قد يكون مختلفًا؛ تحقق من مساره أولًا. لا ينبغي افتراض أن HEAD المحلي يساوي آخر مرشح Draft على GitHub.

## أوامر جرد آمنة على PowerShell

افتح PowerShell عاديًا (لا تتطلب Administrator) والصق بعد مراجعتها:

```powershell
$repo = 'C:\Users\dell\ALSQAYA-STAGING'
Test-Path -LiteralPath $repo
git --no-optional-locks -C $repo rev-parse HEAD
git --no-optional-locks -C $repo branch --show-current
git --no-optional-locks -C $repo status --short --untracked-files=no
node --version
npm --version
Get-Command psql -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
foreach ($port in @(3000,4000,5433)) {
  $listening = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  Write-Output ("Port {0}: {1}" -f $port, $(if ($listening.Count -gt 0) { 'LISTENING' } else { 'NOT LISTENING' }))
}
```

**لا تنشر النصوص التي تتضمن أسرارًا** مثل `DATABASE_URL` أو كلمات المرور أو أسماء المنتسبين؛ يكفي نقل HEAD، واسم الفرع، وحالة نظافة الملفات، والإصدارات، وحالة المنافذ. إذا لم يعمل أمر بسبب عدم توفر برنامج، اذكر `UNAVAILABLE` بدل تثبيت أداة أو تغيير إعدادات في هذا الفحص.

## كيف نفسر النتيجة

- **Git clean/dirty:** أي ملفات معدلة تُترك كما هي؛ لا `git reset` ولا `git clean`. المطلوب فقط معرفة ما إذا كانت توجد تغييرات يجب حفظها قبل أي اختبار لاحق.
- **HEAD يختلف عن `28b304e90c49f7a7f8fb7afc84fc2f365fe79fae`:** هذا لا يعني إخفاقًا تلقائيًا. SHA المذكور هو مرشح [Draft PR #93](https://github.com/daboolgame123-creator/Saqa/pull/93) بتاريخ 2026-11-23، مبني على #92 ثم #91 ثم #89. [CI #45174645061](https://github.com/daboolgame123-creator/Saqa/actions/runs/45174645061) أتم **974 PASS / 0 FAIL / 1 SKIP** لكنه اختبر تركيبًا تراكميًا يتضمن فروع المراحل 1–10 **مؤقتًا** داخل GitHub Actions فقط؛ لم يحدث دمج رسمي. لا تحاول `checkout` لأي SHA، ولا تستبدل الملفات لإجبار التطابق.
- **منافذ 3000/4000/5433:** الاستماع يعكس وجود خدمة محلية محتملة، لا يثبت أن تلك الخدمة هي السقاية أو أن الاختبارات آمنة. لا تُفتح اتصالات أو تُفحَص جداول DB في الجرد.
- **Node/npm/psql:** الإصدارات تُقارن لاحقًا بالنسخة المعتمدة عند التحضير للاختبار، لكن الفحص لا ينفذ `npm ci` أو `npm run build` أو `Bootstrap` ولا ينشر شيئًا.
- **لا تشغّل `npm run db:status` ضمن الجرد:** رغم اسمه، فإن `server/src/database/migrations.ts` يستدعي `ensureMigrationsTable()` في مسار `getMigrationStatus()`، وقد ينفذ `CREATE TABLE IF NOT EXISTS schema_migrations`؛ لذا لا يُعد الأمر فحصًا مضمون القراءة فقط على قاعدة غير مهيأة.

## ماذا يرسل المضيف بعد الجرد؟

أرسل **النتائج النصية المقتضبة**: `repo_exists` و`HEAD` و`branch` و`git_dirty=yes/no` و`node` و`npm` و`psql_available=yes/no` و`port3000/4000/5433=LISTENING|NOT LISTENING`. لا ترسل قائمة ملفات الموظفين، أو كلمات المرور أو الرموز أو `.env`، ولا تنفذ `psql` في هذه الخطوة.

**الفاصل الحاسم:** هذا جرد للمضيف فقط. حتى لو تطابق HEAD محليًا، فذلك لا يثبت صحة مرشح التكامل المؤقت أو أذونات دور تشغيل PostgreSQL، ولا يجيز اختبار `alsqaya_staging`. أي اختبار DB لاحق يحتاج إذنًا منفصلًا وعنقودًا اصطناعيًا مستقلًا والتحقق من هويته أولًا.

**فصل الحسابات عند النشر لاحقًا:** `server/src/server.ts` يفتح اتصال التطبيق عبر `DATABASE_URL`، بينما `server/src/database/cli.ts` يستخدم قيمة `DATABASE_URL` الخاصة *بعملية تشغيل الترحيلات*. يمكن لمشغّل المؤسسة إعطاء اتصال تشغيل محدود واتصال ترحيلات إداري مختلفين كإعداد تشغيل منفصل، دون تعديل الشيفرة أو كشف روابط الاتصال. لا يعني مثال `alsqaya_dev` في `.env.example` أن صلاحيات التشغيل الفعلية معتمدة. إثبات الفصل يتم بفحص دور التشغيل وصلاحيات `audit_logs` على عنقود اصطناعي مأذون فقط.

## التحقق اللاحق من صلاحيات سجل التدقيق — ليس ضمن جرد Windows

عند إقرار المالك **لعنقود PostgreSQL اصطناعي مستقل فقط**، استخدم استعلام `SELECT` الموجود في [Issue #90](https://github.com/daboolgame123-creator/Saqa/issues/90) بحساب اتصال التشغيل الفعلي، لا بمالك الترحيلات ولا بحساب `postgres`. يتضمن فحص تحديث أي عمود منفرد في `audit_logs`، وصلاحية `TRIGGER`، وإمكان استخدام `SET ROLE` لدور يملك صلاحيات تغيير السجل؛ مجرد `can_update=false` على الجدول ليس إثباتًا كافيًا لعدم وجود تحديث ممنوح على أعمدة بعينها.

**شرط الإغلاق:** لا تعلن نجاح صلاحيات التشغيل إلا بنتيجة الأعلام الكاملة والتحقق من هوية الاتصال الفعلية دون إظهار الأسرار. لا تنفذ أوامر `GRANT` أو `REVOKE` أو تغييرات إعدادات من هذه الوثيقة.

## بوابة Host UAT الفعلية — لا تُعد منجزة هنا

بعد إقرار المالك واختيار **عنقود تجريبي اصطناعي جديد ومعزول صراحةً**، يمكن تنفيذ اختبارات قليلة فقط: RBAC وهوية الجلسة، سجل «اطلعت» للإعمام العام، منع الكتب غير المؤهلة، الأرشفة/الاستعادة، استمرارية ViewLog، أذونات Audit، والمرفقات، وحظر التقارير 503. يجب تدوين منفذ/قاعدة الاختبار وتأكيد أنها **ليست** `alsqaya_staging` أو ملفات المؤسسة قبل أي كتابة. لا ادعاء بنجاح هذه الخطوة بعد.

**مراجع:** [بيان تكامل وإغلاق Phase15](PHASE15_EXIT_GATE_INTEGRATION_MANIFEST_20261123.md) و[مهمة OpenCode المستقلة](OPENCODE_PHASE15_ATOMIC_AUDIT_REVIEW_PROMPT_CURRENT.md).

**الحكم:** `HOST_READONLY_INVENTORY_READY / INDEPENDENT_REVIEW_PENDING / NO_MERGE / RELEASE_NO_GO`.
