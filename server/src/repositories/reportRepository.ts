/**
 * مستودع التقارير (Phase 23) - القراءة فقط.
 *
 * المرجع: ALSQAYA_PLAN.md 39.
 *
 * SQL والفلاتر والملكية لم تستكمل؛ راوتر التقارير محجوب في P0.
 * راجع PHASE_23_DECISIONS.md قبل أي إتاحة لاحقة.
 */
import type {
  ReportFilter,
  ReportRecord,
  ReportRepository,
  ReportType,
  TransactionScopeFilter,
} from './contracts';
import type { Db } from './shared';
import { transactionScopeCondition } from './transactionScopeSql';

interface ReportQuery {
  sql: string;
  params: unknown[];
}

/** Internal compatibility with legacy SQL, not additional HTTP filter fields.
 * Mapping public filters to SQL remains deferred; the report router is blocked.
 */
interface LegacyReportSqlFilter extends ReportFilter {
  category?: string;
  entity?: string;
  number?: string;
  subject?: string;
  kind?: string;
  department?: string;
}

function buildTransactionsQuery(
  filter: LegacyReportSqlFilter,
  params: unknown[],
  scope: TransactionScopeFilter | null,
): ReportQuery {
  const where: string[] = [];
  const addText = (field: 'category' | 'entity' | 'number' | 'subject' | 'source') => {
    if (filter[field]) {
      params.push(filter[field]);
      where.push(`"${field}" = $${params.length}`);
    }
  };

  if (filter.dateFrom || filter.dateTo) {
    const startIdx = params.length + 1;
    if (filter.dateFrom) params.push(filter.dateFrom);
    if (filter.dateTo) params.push(filter.dateTo);
    const endIdx = params.length;
    where.push(`document_date >= $${startIdx} AND document_date <= $${endIdx}`);
  }

  addText('category');
  addText('entity');
  addText('number');
  addText('subject');
  addText('source');

  if (filter.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }

  const scopeCondition = scope !== null && scope !== undefined && Object.keys(scope).length > 0
    ? transactionScopeCondition(scope, 't', params)
    : 'FALSE';
  const whereClause = where.length > 0
    ? `WHERE ${where.join(' AND ')} AND ${scopeCondition}`
    : `WHERE ${scopeCondition}`;

  return {
    sql: `
      SELECT
        id,
        document_date AS "date",
        category AS "type",
        entity AS "section",
        employee_name AS "employee",
        status,
        source,
        subject AS "title",
        notes,
        visibility,
        employee_id AS "employeeId"
      FROM transactions
      ${whereClause}
      ORDER BY document_date DESC, id DESC
    `,
    params,
  };
}

function buildRequestsQuery(filter: LegacyReportSqlFilter, params: unknown[]): ReportQuery {
  const where: string[] = [];
  if (filter.dateFrom || filter.dateTo) {
    const startIdx = params.length + 1;
    if (filter.dateFrom) params.push(filter.dateFrom);
    if (filter.dateTo) params.push(filter.dateTo);
    const endIdx = params.length;
    where.push(`created_at >= $${startIdx} AND created_at <= $${endIdx}`);
  }
  if (filter.kind) {
    params.push(filter.kind);
    where.push(`kind = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : 'WHERE TRUE';
  return {
    sql: `
      SELECT id, created_at AS "date", NULL AS "type", NULL AS "section", employee_id AS "employee",
             status, NULL AS "source", NULL AS "title", notes, NULL AS "visibility"
      FROM requests
      ${whereClause}
      ORDER BY created_at DESC, id DESC
    `,
    params,
  };
}

function buildEmployeesQuery(filter: LegacyReportSqlFilter, params: unknown[]): ReportQuery {
  const where: string[] = [];
  if (filter.department) {
    params.push(filter.department);
    where.push(`department = $${params.length}`);
  }
  if (filter.category) {
    params.push(filter.category);
    where.push(`category = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : 'WHERE TRUE';
  return {
    sql: `
      SELECT id, name, title, department, category, status, badge_number AS "badgeNumber",
             joined_date AS "joinedDate", academic_degree AS "academicDegree",
             specialization, userId, createdAt, updatedAt
      FROM employees
      ${whereClause}
      ORDER BY name ASC
    `,
    params,
  };
}

// ─── التنفيذ ───────────────────────────────────────────────────────────────

export class PgReportRepository implements ReportRepository {
  constructor(private readonly db: Db) {}

  async list(
    reportType: ReportType,
    filter: ReportFilter,
    scope?: TransactionScopeFilter | null,
  ): Promise<ReportRecord[]> {
    const params: unknown[] = [];
    let sql: string;

    switch (reportType) {
      case 'monthly':
      case 'incoming':
      case 'outgoing':
      case 'circularsAndAcknowledgements':
        ({ sql } = buildTransactionsQuery(filter, params, scope ?? null));
        break;
      case 'requests':
        ({ sql } = buildRequestsQuery(filter, params));
        break;
      case 'employees':
      case 'researchers':
        ({ sql } = buildEmployeesQuery(filter, params));
        break;
      case 'professors':
      case 'situation':
        // أنواع غير محسومة في §39 — تُوثّق هنا وتُرجع فارغاً بدلاً من اختراع تصنيف.
        return [];
      case 'leaves':
        ({ sql } = buildLeavesQuery(filter, params));
        break;
      case 'timePermissions':
        ({ sql } = buildTimePermissionsQuery(filter, params));
        break;
      default:
        return [];
    }

    const result = await this.db.query<ReportRecord>(sql, params);
    return result.rows;
  }
}

function buildLeavesQuery(filter: ReportFilter, params: unknown[]): ReportQuery {
  const where: string[] = [];
  if (filter.dateFrom || filter.dateTo) {
    const startIdx = params.length + 1;
    if (filter.dateFrom) params.push(filter.dateFrom);
    if (filter.dateTo) params.push(filter.dateTo);
    const endIdx = params.length;
    where.push(`start_date >= $${startIdx} AND start_date <= $${endIdx}`);
  }
  if (filter.type) {
    params.push(filter.type);
    where.push(`type = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : 'WHERE TRUE';
  return {
    sql: `
      SELECT id, start_date AS "date", type, NULL AS "section", employee_id AS "employee",
             status, NULL AS "source", notes, NULL AS "visibility"
      FROM leaves
      ${whereClause}
      ORDER BY start_date DESC, id DESC
    `,
    params,
  };
}

function buildTimePermissionsQuery(filter: ReportFilter, params: unknown[]): ReportQuery {
  const where: string[] = [];
  if (filter.dateFrom || filter.dateTo) {
    const startIdx = params.length + 1;
    if (filter.dateFrom) params.push(filter.dateFrom);
    if (filter.dateTo) params.push(filter.dateTo);
    const endIdx = params.length;
    where.push(`date >= $${startIdx} AND date <= $${endIdx}`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : 'WHERE TRUE';
  return {
    sql: `
      SELECT id, date, status, employee_id AS "employee", NULL AS "type", NULL AS "section",
             NULL AS "source", NULL AS "title", notes, NULL AS "visibility"
      FROM time_permissions
      ${whereClause}
      ORDER BY date DESC, id DESC
    `,
    params,
  };
}
