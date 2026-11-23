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
- **HEAD يختلف عن `8320d749d7d62fcf131e6f0a10d5c02a81914a32`:** هذا لا يعني إخفاقًا تلقائيًا. SHA الأخير خاص بـ[Draft PR #89](https://github.com/daboolgame123-creator/Saqa/pull/89)، ولم يدمج رسميًا، بينما [CI #45137856092](https://github.com/daboolgame123-creator/Saqa/actions/runs/45137856092) جمع مرشحات المراحل 1–10 **مؤقتًا** أثناء التشغيل. لا تحاول `checkout` لهذا SHA أو استبدال الملفات لإجبار التطابق.
- **منافذ 3000/4000/5433:** الاستماع يعكس وجود خدمة محلية محتملة، لا يثبت أن تلك الخدمة هي السقاية أو أن الاختبارات آمنة. لا تُفتح اتصالات أو تُفحَص جداول DB في الجرد.
- **Node/npm/psql:** الإصدارات تُقارن لاحقًا بالنسخة المعتمدة عند التحضير للاختبار، لكن الفحص لا ينفذ `npm ci` أو `npm run build` أو `Bootstrap` ولا ينشر شيئًا.

## بوابة Host UAT الفعلية — لا تُعد منجزة هنا

بعد إقرار المالك واختيار **عنقود تجريبي اصطناعي جديد ومعزول صراحةً**، يمكن تنفيذ اختبارات قليلة فقط: RBAC وهوية الجلسة، سجل «اطلعت» للإعمام العام، منع الكتب غير المؤهلة، الأرشفة/الاستعادة، استمرارية ViewLog، أذونات Audit، والمرفقات، وحظر التقارير 503. يجب تدوين منفذ/قاعدة الاختبار وتأكيد أنها **ليست** `alsqaya_staging` أو ملفات المؤسسة قبل أي كتابة. لا ادعاء بنجاح هذه الخطوة بعد.

**مراجع:** [بيان تكامل وإغلاق Phase15](PHASE15_EXIT_GATE_INTEGRATION_MANIFEST_20261123.md) و[مهمة OpenCode المستقلة](OPENCODE_PHASE15_ATOMIC_AUDIT_REVIEW_PROMPT_CURRENT.md).

**الحكم:** `HOST_READONLY_INVENTORY_READY / INDEPENDENT_REVIEW_PENDING / NO_MERGE / RELEASE_NO_GO`.
