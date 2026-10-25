/**
 * مستودع البحث الموحد (Phase 22 — §38).
 *
 * قراءة فقط عبر موردَين: المعاملات (transactions) والمنتسبون (employees).
 * لا OCR، لا خدمات خارجية، لا تعديل على أي بيانات أصلية.
 *
 * الأمان: المعاملات تُصفّى بقيد نطاق الرؤية (`transactionScopeCondition`)
 * داخل SQL قبل الإرجاع — لا تسرب لبيانات خارج نطاق المستخدم. المنتسبون
 * يُبحث فيهم بناءً على الصلاحية المفروضة على المسار (view) بلا قيود نطاق
 * إضافية، مطابقة للسلوك القائم في `GET /api/employees`.
 *
 * التطبيع العربي (D4 من §38): يُطبَّع نص الاستعلام في طبقة الخدمة/الخادم
 * للمقارنة فقط، ولا يُكتب فوق أي قيمة أصلية في القاعدة.
 */
import type { AccessScope } from '../../../src/core/models/accessScope';
import type {
  SearchFilter,
  SearchResult,
  TransactionScopeFilter,
} from './contracts';
import { limitOffsetClause, type Db } from './shared';
import { transactionScopeCondition } from './transactionScopeSql';

/** حد افتراضي للنتائج لكل نوع عند عدم التحديد. */
const DEFAULT_LIMIT = 20;

/** أطول مقتطف يُعاد في نتيجة البحث. */
const EXCERPT_MAX = 120;

/** حد تقني أعلى للنتائج في كل استعلام بحث — احتياط أداء، ليس قاعدة عمل. */
const SEARCH_MAX_LIMIT = 100;

/**
 * الحروف المطبَّعة في تطبيع الألف (D4 — §38): `أ إ آ ٱ` إلى `ا`.
 *
 * نفس المحارف تُستعمل في جانبَي المطابقة: دالة `normalizeArabicQuery`
 * (نص الاستعلام) وفي `normalizeArabicColumn` (تعبير SQL على العمود) —
 * فالقاعدتان واحدة لا نسختان، وإلا لاختلفت المطابقة بينهما.
 */
const ALEF_VARIANTS = ['أ', 'إ', 'آ', 'ٱ'];

/**
 * نطاق التشكيل والتطويل المحذوف (D4 — §38).
 *
 * U+064B..U+065F (الحركات والتنوين) وU+0640 (التطويل/Kashida).
 */
const TASHKEEL_AND_KASHIDA = '\u064B-\u065F\u0640';

/** يُحوّل نص البحث إلى نمط ILIKE آمن (يُهَرّب الرموز الخاصة % و _). */
function likePattern(q: string): string {
  return `%${q.replace(/[%_]/g, '\\$&')}%`;
}

/**
 * تطبيع عربي للاستعلام (D4): لا يكتب فوق الأصل، للمقارنة والفهرسة.
 *
 * القواعد المنقولة من §38 حرفياً:
 * - توحيد `أ إ آ ٱ` إلى `ا`.
 * - إزالة التشكيل (حركات وتنوين) والتطويل (Kashida).
 * - تطبيع المسافات وإزالة الزائدة.
 * - **لا** توحيد `ة` مع `ه` ولا `ى` مع `ي` (توحيد زائد = مطابقة خاطئة).
 */
function normalizeArabicQuery(text: string): string {
  return text
    // 1. توحيد أ إ آ ٱ إلى ا
    .replace(/[أإآٱ]/g, 'ا')
    // 2. إزالة التشكيل (حركات وتنوين)
    .replace(/[\u064B-\u065F]/g, '')
    // 3. إزالة التطويل ( Kashida )
    .replace(/\u0640/g, '')
    // 4. تطبيع المسافات وإزالة الزائدة
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * تعبير SQL يطبع قيمة عمود عربي للمقارنة (D4) — نفس قواعد التطبيع
 * المطبَّقة على الاستعلام في `normalizeArabicQuery`، بلا تعديل على
 * البيانات المخزَّنة.
 *
 * لماذا expression في SQL لا قيمة مخزَّنة: §38 يشترط أن التطبيع يكون
 * «عند المقارنة/الفهرسة فقط» بلا كتابة فوق القيم الأصلية. ونتيجة
 * المطابقة يجب أن تسري على **العمود** أيضاً، وإلا لكان البحث عن
 * «إداري» لا يجد «إدارى» مخزَّنة.
 *
 * الدوال المستعملة كلها مدمجة في PostgreSQL (`lower` · `replace` ·
 * `regexp_replace`) — بلا extension وبلا `unnest`.
 */
function normalizeArabicColumn(sqlColumn: string): string {
  const coalesced = `COALESCE(${sqlColumn}, '')`;
  // تُبنى متداخلة (داخل بعض) لا متجاورة: `replace`takes ثلاثة وسائط،
  // فجمعها بـ`,` يجعل `regexp_replace` sees وسائط زائدة.
  const alefNormalized = ALEF_VARIANTS.reduce(
    (expression, letter) => `replace(${expression}, '${letter}', 'ا')`,
    coalesced,
  );
  return `lower(regexp_replace(regexp_replace(${alefNormalized}, '[${TASHKEEL_AND_KASHIDA}]', '', 'g'), '\\s+', ' ', 'g'))`;
}

/** صف معاملة خفيف لنتائج البحث. */
interface TransactionSearchRow {
  id: string;
  number: string;
  sequence: string;
  date: string;
  subject: string;
  content: string | null;
  employeeName: string | null;
  linkedNames: string | null;
  visibility: string | null;
  status: string | null;
}

/** صف منتسب خفيف لنتائج البحث. */
interface EmployeeSearchRow {
  id: string;
  name: string;
  department: string;
  title: string;
}

const TRANSACTION_SEARCH_COLUMNS = `
  id, number, sequence, document_date AS "date", subject, content,
  employee_name AS "employeeName", visibility, status,
  COALESCE(
    (
      SELECT string_agg(e.name, '، ' ORDER BY e.name)
        FROM transaction_employees te
        JOIN employees e ON e.id = te.employee_id
       WHERE te.transaction_id = transactions.id
    ),
    employee_name
  ) AS "linkedNames"
`;

const EMPLOYEE_SEARCH_COLUMNS = `
  e.id, e.name, e.department, e.title
`;

export class PgSearchRepository {
  constructor(private readonly db: Db) {}

  /**
   * بحث موحد عبر المعاملات والمنتسبين.
   * `scope` يُطبق على استعلام المعاملات فقط (نطاق الوصول Phase 13).
   */
  async search(
    filter: SearchFilter,
    scope?: TransactionScopeFilter,
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const pattern = likePattern(normalizeArabicQuery(filter.q));
    const safeLimit = Math.min(
      Number.isInteger(filter.limit) && filter.limit > 0 ? filter.limit : DEFAULT_LIMIT,
      SEARCH_MAX_LIMIT,
    );
    const safeOffset = Number.isInteger(filter.offset) && filter.offset >= 0 ? filter.offset : 0;

    if (filter.type === 'transaction' || filter.type === 'all') {
      results.push(
        ...(await this.searchTransactions(pattern, scope, safeLimit, safeOffset)),
      );
    }

    if (filter.type === 'employee' || filter.type === 'all') {
      results.push(...(await this.searchEmployees(pattern, safeLimit, safeOffset)));
    }

    // Phase 22: الحد الإجمالي لنتائج الطلب الواحد هو 100 نتيجة، بما في ذلك `type=all`.
    // عندما يكون النوع `all`، قد يساهم كل نوع بنتائج حتى الـ limit، لذلك يُقصّ المجموع
    // النهائي إلى safeLimit لضمان ألا يتجاوز الطلب 100 نتيجة.
    return results.slice(0, safeLimit);
  }

  private async searchTransactions(
    pattern: string,
    scope: TransactionScopeFilter | undefined,
    limit: number,
    offset: number,
  ): Promise<SearchResult[]> {
    const params: unknown[] = [];
    const add = (value: unknown): number => {
      params.push(value);
      return params.length;
    };

    const p = add(pattern);
    const norm = normalizeArabicColumn;
    let sql = `
      SELECT ${TRANSACTION_SEARCH_COLUMNS}
      FROM transactions
      WHERE deleted_at IS NULL
        AND (
          ${norm('number')} ILIKE $${p}
          OR ${norm('sequence')} ILIKE $${add(pattern)}
          OR ${norm('subject')} ILIKE $${add(pattern)}
          OR ${norm('content')} ILIKE $${add(pattern)}
          OR ${norm('entity')} ILIKE $${add(pattern)}
          OR ${norm('addressed_to')} ILIKE $${add(pattern)}
          OR ${norm('status')} ILIKE $${add(pattern)}
          OR ${norm('employee_name')} ILIKE $${add(pattern)}
          OR to_char(transactions.document_date, 'YYYY-MM-DD') ILIKE $${add(pattern)}
          OR EXISTS (
            SELECT 1 FROM transaction_employees te
            JOIN employees e ON e.id = te.employee_id
            WHERE te.transaction_id = transactions.id
              AND (
                ${norm('e.name')} ILIKE $${add(pattern)}
                OR ${norm('e.department')} ILIKE $${add(pattern)}
              )
          )
        )
    `;

    if (scope !== undefined) {
      sql += ` AND ${transactionScopeCondition(scope, 'transactions', params)}`;
    }

    sql += ` ORDER BY document_date DESC, created_at DESC, id`;
    sql += limitOffsetClause(limit, offset, params);

    const result = await this.db.query<TransactionSearchRow>(sql, params);
    return result.rows.map((row) => ({
      source: 'transaction' as const,
      id: row.id,
      title: row.subject,
      number: row.number,
      date: row.date,
      // «الشخص المرتبط» (§40): أسماء المنتسبين المرتبطين بالكتاب أولاً،
      // واسم `employee_name` القديم احتياطاً للكتب التي لا روابط لها.
      person: row.linkedNames ?? row.employeeName ?? undefined,
      excerpt: row.content
        ? row.content.length > EXCERPT_MAX
          ? `${row.content.slice(0, EXCERPT_MAX)}…`
          : row.content
        : undefined,
      sourceLabel: 'معاملة',
      visibility: row.visibility as AccessScope | undefined,
    }));
  }

  private async searchEmployees(
    pattern: string,
    limit: number,
    offset: number,
  ): Promise<SearchResult[]> {
    const params: unknown[] = [];
    const add = (value: unknown): number => {
      params.push(value);
      return params.length;
    };

    const p = add(pattern);
    const norm = normalizeArabicColumn;
    let sql = `
      SELECT ${EMPLOYEE_SEARCH_COLUMNS}
      FROM employees e
      WHERE (
        ${norm('e.name')} ILIKE $${p}
        OR ${norm('e.badge_number')} ILIKE $${add(pattern)}
        OR ${norm('e.title')} ILIKE $${add(pattern)}
        OR ${norm('e.department')} ILIKE $${add(pattern)}
      )
    `;

    sql += ` ORDER BY e.name`;
    sql += limitOffsetClause(limit, offset, params);

    const result = await this.db.query<EmployeeSearchRow>(sql, params);
    return result.rows.map((row) => ({
      source: 'employee' as const,
      id: row.id,
      title: row.name,
      person: row.department,
      excerpt: row.title,
      sourceLabel: 'منتسب',
    }));
  }
}