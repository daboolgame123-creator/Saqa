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
  ReportAccessContext,
  TransactionScopeFilter,
} from './contracts';
import type { Db } from './shared';
import { transactionScopeCondition } from './transactionScopeSql';
import { assertReportAccess } from '../authorization/reportAccess';


/** A required Phase 23 report has no verified implementation yet.
 * Never treat missing data/logic as a successful report containing zero rows.
 * The HTTP report router remains disabled by 503 independently of this guard.
 */
export class ReportNotImplementedError extends Error {
  readonly code = 'REPORT_NOT_IMPLEMENTED';
  constructor(readonly reportType: ReportType) {
    super(`Phase 23 report is not implemented: ${reportType}`);
    this.name = 'ReportNotImplementedError';
  }
}

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

/** P1c: unsupported book filters must fail explicitly, never silently disappear. */
export class ReportFilterUnavailableError extends Error {
  readonly code = 'REPORT_FILTER_UNAVAILABLE';
  constructor(readonly fields: readonly string[]) {
    super(`Book report filters have no approved data mapping: ${fields.join(', ')}`);
    this.name = 'ReportFilterUnavailableError';
  }
}

/** Registration-day boundaries require a deliberate server-owned timezone.
 * A timezone from the browser/query is never accepted by the repository.
 */
export class ReportDateZoneRequiredError extends Error {
  readonly code = 'REPORT_DATE_ZONE_REQUIRED';
  constructor() {
    super('Report registration-date timezone is not configured');
    this.name = 'ReportDateZoneRequiredError';
  }
}

type BookReportType = 'monthly' | 'incoming' | 'outgoing';

/** @internal P1c: exposed for isolated SQL integration tests, not an HTTP route. */
export function buildTransactionsQuery(
  reportType: BookReportType,
  filter: ReportFilter,
  params: unknown[],
  scope: TransactionScopeFilter | null,
  dateTimeZone: string | null,
): ReportQuery {
  const unavailable = (['section', 'source'] as const)
    .filter(field => filter[field] !== undefined);
  if (unavailable.length > 0) {
    // "entity" is an external party, NOT an approved department/source mapping.
    throw new ReportFilterUnavailableError(unavailable);
  }

  const where: string[] = [
    't.deleted_at IS NULL',
    't.is_daily_situation = false',
  ];
  if (reportType === 'monthly') where.push('t.imported_at IS NULL');
  if (reportType === 'incoming') where.push("t.direction = 'وارد'");
  if (reportType === 'outgoing') where.push("t.direction = 'صادر'");

  if (filter.status !== undefined) {
    params.push(filter.status);
    where.push(`t.status = $${params.length}`);
  }
  if (filter.type !== undefined) {
    params.push(filter.type);
    where.push(`t.direction = $${params.length}`);
  }
  if (filter.employee !== undefined) {
    // The authoritative employee association is M:N; EXISTS does not duplicate books.
    params.push(filter.employee);
    where.push(`EXISTS (
      SELECT 1 FROM transaction_employees te
      WHERE te.transaction_id = t.id AND te.employee_id::text = $${params.length}
    )`);
  }
  if (filter.dateFrom !== undefined || filter.dateTo !== undefined) {
    if (!dateTimeZone?.trim()) throw new ReportDateZoneRequiredError();
    params.push(dateTimeZone);
    const zoneParam = params.length;
    // "created_at" is timestamptz. Convert to the explicitly configured
    // institution-local calendar date before applying inclusive date bounds.
    const registrationDay = `timezone($${zoneParam}::text, t.created_at)::date`;
    if (filter.dateFrom !== undefined) {
      params.push(filter.dateFrom);
      where.push(`${registrationDay} >= $${params.length}::date`);
    }
    if (filter.dateTo !== undefined) {
      params.push(filter.dateTo);
      where.push(`${registrationDay} <= $${params.length}::date`);
    }
  }

  // P1b authorizes null only for a verified admin/director context.
  // An actual employee scope is enforced INSIDE SQL, not after fetching rows.
  where.push(scope === null ? 'TRUE' : `(${transactionScopeCondition(scope, 't', params)})`);

  return {
    sql: `
      SELECT
        t.id, t.created_at AS "date", t.direction AS "type",
        t.status, t.subject AS "title", t.notes,
        (t.visibility #>> '{}') AS "visibility"
      FROM transactions t
      WHERE ${where.join(' AND ')}
      ORDER BY t.created_at DESC, t.id DESC
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
  constructor(private readonly db: Db, private readonly dateTimeZone: string | null = null) {}

  async list(
    reportType: ReportType,
    filter: ReportFilter,
    access: ReportAccessContext,
  ): Promise<ReportRecord[]> {
    // Protect direct repository callers, not only the HTTP/service layers.
    assertReportAccess(access, reportType);
    const params: unknown[] = [];
    let sql: string;

    switch (reportType) {
      case 'monthly':
      case 'incoming':
      case 'outgoing':
        ({ sql } = buildTransactionsQuery(
          reportType, filter, params, access.transactionScope, this.dateTimeZone,
        ));
        break;
      case 'circularsAndAcknowledgements':
        // Requires independent ViewLog/acknowledgment counts and authorization.
        throw new ReportNotImplementedError(reportType);
      case 'requests':
        ({ sql } = buildRequestsQuery(filter, params));
        break;
      case 'employees':
        ({ sql } = buildEmployeesQuery(filter, params));
        break;
      case 'researchers':
      case 'professors':
      case 'situation':
        // Incomplete independent researcher/professor sources and unimplemented
        // book-status report must not masquerade as valid empty results.
        throw new ReportNotImplementedError(reportType);
      case 'leaves':
        ({ sql } = buildLeavesQuery(filter, params));
        break;
      case 'timePermissions':
        ({ sql } = buildTimePermissionsQuery(filter, params));
        break;
      default:
        throw new ReportNotImplementedError(reportType);
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
