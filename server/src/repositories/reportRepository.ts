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
  if (filter.reportType !== reportType) throw new Error('Report type mismatch');
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


type P1dSource = 'requests' | 'employees' | 'leaves' | 'timePermissions';
type P1dSpec = { from: string; a: string; owner: string; kind: string; section?: string; cols: string };
/** All SQL identifiers/projections are DDL-backed constants, not user input. */
const P1D_SQL: Record<P1dSource,P1dSpec> = {
  requests: { from: 'requests r', a: 'r', owner: 'r.employee_id', kind: 'r.kind',
    cols: `r.id, r.created_at AS "date", r.kind AS "type", NULL::text AS "section",
      r.employee_id::text AS "employee", r.status, NULL::text AS "source",
      NULL::text AS "title", r.notes, NULL::text AS "visibility"` },
  employees: { from: 'employees e', a: 'e', owner: 'e.id', kind: 'e.category', section: 'e.department',
    cols: `e.id, e.created_at AS "date", e.category AS "type", e.department AS "section",
      e.name AS "employee", e.status, NULL::text AS "source", e.title,
      NULL::text AS "notes", NULL::text AS "visibility"` },
  leaves: { from: 'leaves l', a: 'l', owner: 'l.employee_id', kind: 'l.type',
    cols: `l.id, l.created_at AS "date", l.type, NULL::text AS "section",
      l.employee_id::text AS "employee", l.status, NULL::text AS "source",
      NULL::text AS "title", l.notes, NULL::text AS "visibility"` },
  timePermissions: { from: 'time_permissions tp', a: 'tp', owner: 'tp.employee_id', kind: 'tp.status',
    cols: `tp.id, tp.created_at AS "date", NULL::text AS "type", NULL::text AS "section",
      tp.employee_id::text AS "employee", tp.status, NULL::text AS "source",
      NULL::text AS "title", tp.notes, NULL::text AS "visibility"` },
};

/** @internal P1d: isolated PostgreSQL owner-scope probes; never an HTTP endpoint.
 * P1b's employee entry guard remains in service/repository until fully reviewed. */
export function buildScopedPersonnelReportQuery(
  reportType: P1dSource, filter: ReportFilter, params: unknown[],
  access: ReportAccessContext, dateTimeZone: string | null,
): ReportQuery {
  const spec = P1D_SQL[reportType];
  if (!spec) throw new ReportNotImplementedError(reportType);
  if (filter.reportType !== reportType) throw new Error('Report type mismatch');
  // Guard the test-exposed SQL builder itself against an inconsistent or
  // downgraded owner scope. Ordinary employee report reads remain disabled.
  if (access?.role === 'employee') {
    const id = access.employeeId;
    if (typeof id !== 'string' || !id.trim()
        || access.personnelScope?.kind !== 'owner'
        || access.personnelScope.employeeId !== id
        || access.requestScope?.kind !== 'owner'
        || access.requestScope.ownerEmployeeId !== id) {
      throw new Error('Report identity/scope mismatch');
    }
  } else {
    // Privileged roles must also carry the exact unrestricted source scopes.
    assertReportAccess(access, reportType);
  }
  const unsupported: string[] = [];
  if (filter.source !== undefined) unsupported.push('source');
  if (filter.section !== undefined && spec.section === undefined) unsupported.push('section');
  if (unsupported.length) throw new ReportFilterUnavailableError(unsupported);
  const conditions: string[] = [];
  const add = (column: string, value?: string, castId = false) => {
    if (value !== undefined) {
      params.push(value);
      conditions.push(column + (castId ? '::text' : '') + ' = $' + params.length);
    }
  };
  if (filter.dateFrom !== undefined || filter.dateTo !== undefined) {
    if (!dateTimeZone?.trim()) throw new ReportDateZoneRequiredError();
    params.push(dateTimeZone);
    const regDay = 'timezone($' + params.length + '::text, ' + spec.a + '.created_at)::date';
    if (filter.dateFrom !== undefined) {
      params.push(filter.dateFrom);
      conditions.push(regDay + ' >= $' + params.length + '::date');
    }
    if (filter.dateTo !== undefined) {
      params.push(filter.dateTo);
      conditions.push(regDay + ' <= $' + params.length + '::date');
    }
  }
  // User-supplied filters can only narrow the independent trusted owner scope.
  add(spec.owner, filter.employee, true);
  add(spec.kind, filter.type);
  if (spec.section) add(spec.section, filter.section);
  add(spec.a + '.status', filter.status);
  if (reportType === 'requests') {
    const scope = access.requestScope;
    if (scope.kind === 'all') conditions.push('TRUE');
    else if (scope.kind === 'owner' && scope.ownerEmployeeId?.trim()) add(spec.owner, scope.ownerEmployeeId, true);
    else throw new Error('Report request scope is required');
  } else {
    const scope = access.personnelScope;
    if (scope.kind === 'all') conditions.push('TRUE');
    else if (scope.kind === 'owner' && scope.employeeId?.trim()) add(spec.owner, scope.employeeId, true);
    else throw new Error('Report personnel scope is required');
  }
  return {
    sql: 'SELECT ' + spec.cols + ' FROM ' + spec.from + ' WHERE ' + conditions.join(' AND ')
      + ' ORDER BY ' + spec.a + '.created_at DESC, ' + spec.a + '.id DESC',
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
    if (filter.reportType !== reportType) throw new Error('Report type mismatch');
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
        ({ sql } = buildScopedPersonnelReportQuery('requests', filter, params, access, this.dateTimeZone));
        break;
      case 'employees':
        ({ sql } = buildScopedPersonnelReportQuery('employees', filter, params, access, this.dateTimeZone));
        break;
      case 'researchers':
      case 'professors':
      case 'situation':
        // Incomplete independent researcher/professor sources and unimplemented
        // book-status report must not masquerade as valid empty results.
        throw new ReportNotImplementedError(reportType);
      case 'leaves':
        ({ sql } = buildScopedPersonnelReportQuery('leaves', filter, params, access, this.dateTimeZone));
        break;
      case 'timePermissions':
        ({ sql } = buildScopedPersonnelReportQuery('timePermissions', filter, params, access, this.dateTimeZone));
        break;
      default:
        throw new ReportNotImplementedError(reportType);
    }

    const result = await this.db.query<ReportRecord>(sql, params);
    return result.rows;
  }
}

