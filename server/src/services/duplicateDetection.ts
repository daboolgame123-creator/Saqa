/**
 * كشف تشابه الكتب (Phase 20 — §36 «Duplicate Detection»).
 *
 * **الوظيفة تحذير لا منع**، وهذا هو نصّ §36 الحرفي: «لا يمنع الإدخال
 * تلقائياً… يظهر warning مع أسباب الاشتباه». لذلك لا يوجد هنا أي
 * `AppError` ولا `ValidationError`: الدالة تُعيد نتيجةً وصفية فقط،
 * ولا تكتب شيئاً ولا تمسح سجلاً ولا تختار «الصحيح» بالاجتهاد.
 *
 * الحقول الخمسة مستندة إلى بنود §36 بالترتيب:
 * official number · date · source · topic · file hash (عند توفّره).
 *
 * حدود مقصودة لتفادي اختراع قواعد:
 * - المطابقة **حرفية تماماً** (`=`) على كل حقل، بلا تطبيع عربي ولا
 *   `LOWER` ولا تشابه ضبابي: الخطة لم تحدّد دالة تشابه، واختراعها
 *   يغيّر معنى «العدد الرسمي» الذي يُقارَن حرفياً.
 * - **سبب واحد كافٍ**: تطابق أي حقل واحد يجعل الكتاب مرشّحاً مع ذكر
 *   ذلك السبب. القاعدة لم تحدّد «عدداً أدنى من التطابقات» فلا تُخترع عتبة.
 * - **سقف 10 مرشّحات** سقف أداءٍ فحسب (استجابة غير ضخمة)؛ لا يمنع
 *   الإدخال ولا يستبعد مرشّحاً «صحيحاً» بالاجتهاد.
 *
 * النطاق: الكتب النشطة فقط (`deleted_at IS NULL`)، والكتاب المؤرشف
 * محجوب عن القوائم العامة. و`scope` (Phase 13) يُقيّد الفحص بمن
 * يستدعيه — المسؤول والمدير بلا قيد، والمنتسب على ما يراه.
 */
import type { Queryable } from '../database';
import type { TransactionScopeFilter } from '../repositories/contracts';
import { transactionScopeCondition } from '../repositories/transactionScopeSql';
import type { DuplicateReason } from '../api/dto/transactionRelation';

/** القيم المرشّحة للفحص كما تأتي من الكتاب المُنشأ. */
export interface DuplicateProbe {
  /** معرّف الكتاب المُنشأ — يُستثنى من النتائج (لا يشتبه بنفسه). */
  transactionId: string;
  number: string;
  date: string;
  entity: string;
  subject: string;
  /** بصمات مرفقات الكتاب إن توفّرت (§36 «file hash when available»). */
  fileHashes?: readonly string[];
}

/** مرشّح واحد مع أسباب اشتباهه. */
export interface DuplicateMatch {
  id: string;
  number: string;
  date: string;
  entity: string;
  subject: string;
  reasons: DuplicateReason[];
}

/** نتيجة الفحص — وصفية، تُعرض ولا تُطبَّق. */
export interface DuplicateScanResult {
  suspected: boolean;
  reasons: DuplicateReason[];
  candidates: DuplicateMatch[];
}

/** ترتيب الأسباب ثابت (ترتيب بنود §36) حتى لا تتذبذب الاستجابة. */
const REASON_ORDER: readonly DuplicateReason[] = [
  'officialNumber',
  'date',
  'source',
  'topic',
  'fileHash',
];

/** سقف المرشّحات المعروض — سقف أداءٍ فحسب (§36 لا يحدّد سقفاً). */
const MAX_CANDIDATES = 10;

interface CandidateRow {
  id: string;
  number: string;
  date: string;
  entity: string;
  subject: string;
  hashMatches: number;
}

/** يحوّل صفاً مرشّحاً إلى نتيجته مع أسبابه المحسوبة في TypeScript. */
function toMatch(row: CandidateRow, probe: DuplicateProbe): DuplicateMatch {
  const reasons: DuplicateReason[] = [];
  if (row.number === probe.number) {
    reasons.push('officialNumber');
  }
  if (row.date === probe.date) {
    reasons.push('date');
  }
  if (row.entity === probe.entity) {
    reasons.push('source');
  }
  if (row.subject === probe.subject) {
    reasons.push('topic');
  }
  if (row.hashMatches > 0) {
    reasons.push('fileHash');
  }
  return {
    id: row.id,
    number: row.number,
    date: row.date,
    entity: row.entity,
    subject: row.subject,
    reasons,
  };
}

/**
 * يفحص كتب القاعدة بحثاً عن تشابه مع `probe` — قراءة فقط.
 *
 * استعلام واحد يجمع الكتب التي تطابق **أي** حقل من الحقول الخمسة، ويقرأ
 * بصمات المرفقات كعدّاد (`hashMatches`) بدل إخراج عمود بصمة كامل.
 *
 * ملاحظة على المعاملات: `$6` يحمل قائمة البصمات دائماً (حتى فارغة)،
 * فيبقى ترقيم المعاملات ثابتاً وتطبيق شرط النطاق في آمنته — لا يُعاد
 * حساب رقم المعامل.
 */
export async function scanDuplicateTransactions(
  db: Queryable,
  probe: DuplicateProbe,
  scope?: TransactionScopeFilter,
): Promise<DuplicateScanResult> {
  const hashes = [...new Set(probe.fileHashes ?? [])];
  const params: unknown[] = [
    probe.transactionId,
    probe.number,
    probe.date,
    probe.entity,
    probe.subject,
    hashes,
  ];
  // شرط البصمة يظهر فقط عند توفّرها: بلا بصمة لا معنى للمقارنة
  // («when available» في نصّ §36)، وإظهاره بقائمة فارغة كان مطابقة
  // على `NULL` لا تشابهاً.
  const hashCondition =
    hashes.length > 0
      ? `OR EXISTS (
           SELECT 1 FROM attachments a
           WHERE a.transaction_id = t.id
             AND a.content_hash = ANY($6::text[])
         )`
      : '';

  let sql = `SELECT t.id, t.number, t.document_date AS "date", t.entity, t.subject,
                    (SELECT count(*) FROM attachments a
                      WHERE a.transaction_id = t.id
                        AND a.content_hash = ANY($6::text[])
                    ) AS "hashMatches"
               FROM transactions t
              WHERE t.id <> $1
                AND t.deleted_at IS NULL
                AND (
                     t.number = $2
                  OR t.document_date = $3::date
                  OR t.entity = $4
                  OR t.subject = $5
                  ${hashCondition}
                )`;
  if (scope !== undefined) {
    // القيد بعد كل معاملات WHERE — نفس ترتيب `transactionRepository.list`.
    sql += ` AND ${transactionScopeCondition(scope, 't', params)}`;
  }
  sql += ' ORDER BY t.document_date DESC, t.id';

  const result = await db.query<CandidateRow>(sql, params);
  const matches = result.rows.slice(0, MAX_CANDIDATES).map((row) => toMatch(row, probe));
  const reasons = REASON_ORDER.filter((reason) =>
    matches.some((match) => match.reasons.includes(reason)),
  );
  return { suspected: matches.length > 0, reasons, candidates: matches };
}