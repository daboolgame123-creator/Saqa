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
import { buildWhere, isPool, limitOffsetClause, nullToUndefined, type Db } from './shared';
import { transactionScopeCondition } from './transactionScopeSql';

/** أنماط البحث المدعومة. */
type SearchSource = 'transaction' | 'employee';

/** حد افتراضي للنتائج لكل نوع عند عدم التحديد. */
const DEFAULT_LIMIT = 20;

/** أطول مقتطف يُعاد في نتيجة البحث. */
const EXCERPT_MAX = 120;

/** يُحوّل نص البحث إلى نمط ILIKE آمن (يُهَرّب الرموز الخاصة % و _). */
function likePattern(q: string): string {
  return `%${q.replace(/[%_]/g, '\\$&')}%`;
}

/** تطبيع عربي للاستعلام فقط (D4): لا يكتب فوق الأصل، للمقارنة والفهرسة. */
function normalizeArabicQuery(text: string): string {
  return text
    // 1. توحيد أ إ آ إلى ا
    .replace(/[أإآ]/g, 'ا')
    // 2. إزالة التشكيل (حركات وتنوين)
    .replace(/[\u064B-\u065F]/g, '')
    // 3. إزالة التطويل ( Kashida )
    .replace(/\u0640/g, '')
    // 4. تطبيع المسافات وإزالة الزائدة
    .replace(/\s+/g, ' ')
    .trim();
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
  visibility: string | null;
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
  employee_name AS "employeeName", visibility
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

    if (filter.type === 'transaction' || filter.type === 'all') {
      results.push(...(await this.searchTransactions(pattern, scope, filter)));
    }

    if (filter.type === 'employee' || filter.type === 'all') {
      results.push(...(await this.searchEmployees(pattern, filter)));
    }

    return results;
  }

  private async searchTransactions(
    pattern: string,
    scope: TransactionScopeFilter | undefined,
    filter: SearchFilter,
  ): Promise<SearchResult[]> {
    const params: unknown[] = [];
    const add = (value: unknown): number => {
      params.push(value);
      return params.length;
    };

    const p = add(pattern);
    let sql = `
      SELECT ${TRANSACTION_SEARCH_COLUMNS}
      FROM transactions
      WHERE deleted_at IS NULL
        AND (number ILIKE $${p} OR sequence ILIKE $${add(pattern)}
             OR subject ILIKE $${add(pattern)} OR content ILIKE $${add(pattern)}
             OR entity ILIKE $${add(pattern)} OR addressed_to ILIKE $${add(pattern)}
             OR employee_name ILIKE $${add(pattern)})
    `;

    if (scope !== undefined) {
      sql += ` AND ${transactionScopeCondition(scope, 'transactions', params)}`;
    }

    sql += ` ORDER BY document_date DESC, created_at DESC, id`;
    sql += limitOffsetClause(filter.limit, filter.offset, params);

    const result = await this.db.query<TransactionSearchRow>(sql, params);
    return result.rows.map((row) => ({
      source: 'transaction' as const,
      id: row.id,
      title: row.subject,
      number: row.number,
      date: row.date,
      person: row.employeeName ?? undefined,
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
    filter: SearchFilter,
  ): Promise<SearchResult[]> {
    const params: unknown[] = [];
    const add = (value: unknown): number => {
      params.push(value);
      return params.length;
    };

    const p = add(pattern);
    let sql = `
      SELECT ${EMPLOYEE_SEARCH_COLUMNS}
      FROM employees e
      WHERE (e.name ILIKE $${p} OR e.badge_number ILIKE $${add(pattern)}
             OR e.title ILIKE $${add(pattern)} OR e.department ILIKE $${add(pattern)})
    `;

    sql += ` ORDER BY e.name`;
    sql += limitOffsetClause(filter.limit, filter.offset, params);

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