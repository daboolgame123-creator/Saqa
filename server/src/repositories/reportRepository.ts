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
  CircularAcknowledgementResult,
  CircularAcknowledgementEntry,
  CircularAcknowledgementStatistics,
} from './contracts';
import { isPool, type Db } from './shared';
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

type BookReportType = 'monthly' | 'incoming' | 'outgoing' | 'situation';

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
  // Original document date is separate from the registration clock.
  if (filter.documentDateFrom !== undefined) {
    params.push(filter.documentDateFrom);
    where.push('t.document_date >= $' + params.length + '::date');
  }
  if (filter.documentDateTo !== undefined) {
    params.push(filter.documentDateTo);
    where.push('t.document_date <= $' + params.length + '::date');
  }
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
  // The test-exposed SQL builder must enforce the SAME guard as the service
  // and repository, including the transaction scope. Never keep a weaker copy:
  // a future direct caller must not rely on a context the repository rejects.
  assertReportAccess(access, reportType);
  const unsupported: string[] = [];
  if (filter.documentDateFrom !== undefined) unsupported.push('documentDateFrom');
  if (filter.documentDateTo !== undefined) unsupported.push('documentDateTo');
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

  /** Dedicated two-period ViewLog report, unavailable to employees until policy review. */
  async readCircularAcknowledgements(
    filter: ReportFilter,
    access: ReportAccessContext,
  ): Promise<CircularAcknowledgementResult> {
    return readCircularAcknowledgements(this.db, filter, access, this.dateTimeZone);
  }

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
      case 'situation':
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
        // The independent researcher and professor models are not verified.
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


/** Registered circulars and formal acknowledgements have DIFFERENT date clocks.
 * Neither opening the book nor viewing an attachment counts as 'acknowledged'.
 * The SQL deliberately omits session_ref and raw user IDs from public output.
 */
interface CircularLogRow {
  id: string;
  transactionId: string;
  employeeId: string | null;
  linkedEmployeeId: string | null;
  employeeName: string | null;
  acknowledgedAt: string | Date;
  timestampKey: string;
  inPeriod: boolean;
}

function addCircularPeriod(
  expression: string,
  filter: ReportFilter,
  params: unknown[],
  zone: string | null,
): string[] {
  if (filter.dateFrom === undefined && filter.dateTo === undefined) return [];
  if (!zone?.trim()) throw new ReportDateZoneRequiredError();
  params.push(zone);
  const day = 'timezone($' + params.length + '::text, ' + expression + ')::date';
  const conditions: string[] = [];
  if (filter.dateFrom !== undefined) {
    params.push(filter.dateFrom);
    conditions.push(day + ' >= $' + params.length + '::date');
  }
  if (filter.dateTo !== undefined) {
    params.push(filter.dateTo);
    conditions.push(day + ' <= $' + params.length + '::date');
  }
  return conditions;
}

const CIRCULAR_CRITERIA: readonly string[] = [
  "t.direction = 'وارد'",
  "t.sub_type = 'تعميم'",
  "(t.visibility #>> '{}') = 'PublicToEmployees'",
  't.deleted_at IS NULL',
  't.is_daily_situation = false',
];

function timestampIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** @internal P1e: no route may call this until the release gate is lifted.
 * Retains raw rows only inside the repository to detect historical anomalies.
 */
export async function readCircularAcknowledgements(
  db: Db,
  filter: ReportFilter,
  access: ReportAccessContext,
  dateTimeZone: string | null,
): Promise<CircularAcknowledgementResult> {
  const kind: ReportType = 'circularsAndAcknowledgements';
  assertReportAccess(access, kind);
  if (filter.reportType !== kind) throw new Error('Report type mismatch');
  const unavailable = ([
    'type', 'section', 'source', 'employee',
    'documentDateFrom', 'documentDateTo',
  ] as const)
    .filter(key => filter[key] !== undefined);
  if (unavailable.length) throw new ReportFilterUnavailableError(unavailable);
  // Reject invalid calendar policy BEFORE opening any database transaction.
  if ((filter.dateFrom !== undefined || filter.dateTo !== undefined)
      && !dateTimeZone?.trim()) throw new ReportDateZoneRequiredError();

  // A Pool-backed production report executes the two independent indicator
  // queries under ONE repeatable-read snapshot, so concurrent acknowledgements,
  // archival actions or status edits cannot create inconsistent totals.
  if (isPool(db)) {
    const client = await db.connect();
    let began = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      began = true;
      const result = await readCircularAcknowledgements(
        client as unknown as Db, filter, access, dateTimeZone,
      );
      await client.query('COMMIT');
      return result;
    } catch (error) {
      if (began) {
        try { await client.query('ROLLBACK'); } catch { /* Preserve original failure. */ }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  const booksParams: unknown[] = [];
  const booksWhere = [...CIRCULAR_CRITERIA];
  if (filter.status !== undefined) {
    booksParams.push(filter.status);
    booksWhere.push('t.status = $' + booksParams.length);
  }
  booksWhere.push(...addCircularPeriod('t.created_at', filter, booksParams, dateTimeZone));
  const books = await db.query<ReportRecord>(
    'SELECT t.id, t.created_at AS "date", t.sub_type AS "type", ' +
    't.status, t.subject AS "title", t.notes, ' +
    '(t.visibility #>> ' + "'{}'" + ') AS "visibility" ' +
    'FROM transactions t WHERE ' + booksWhere.join(' AND ') +
    ' ORDER BY t.created_at DESC, t.id DESC',
    booksParams,
  );

  // Load the FULL history of eligible, visible circulars. The date range is
  // evaluated PER ROW, not in WHERE: an out-of-range duplicate of the same
  // employee/circular can invalidate an in-range timestamp. This prevents
  // silently "choosing" a disputed first/last acknowledgement.
  const logsParams: unknown[] = [];
  const logsWhere = [...CIRCULAR_CRITERIA, 'vl.acknowledged_at IS NOT NULL'];
  if (filter.status !== undefined) {
    logsParams.push(filter.status);
    logsWhere.push('t.status = $' + logsParams.length);
  }
  const datePredicates = addCircularPeriod(
    'vl.acknowledged_at', filter, logsParams, dateTimeZone,
  );
  const inPeriodSql = datePredicates.length ? datePredicates.join(' AND ') : 'TRUE';
  const logs = await db.query<CircularLogRow>(
    'SELECT vl.id, vl.transaction_id AS "transactionId", ' +
    'vl.employee_id AS "employeeId", u.employee_id AS "linkedEmployeeId", ' +
    'e.name AS "employeeName", vl.acknowledged_at AS "acknowledgedAt", ' +
    // PostgreSQL textual timestamptz includes microseconds; JS Date loses them.
    'vl.acknowledged_at::text AS "timestampKey", ' +
    '(' + inPeriodSql + ') AS "inPeriod" ' +
    'FROM view_logs vl JOIN transactions t ON t.id = vl.transaction_id ' +
    'LEFT JOIN users u ON u.id = vl.user_id ' +
    'LEFT JOIN employees e ON e.id = vl.employee_id ' +
    'WHERE ' + logsWhere.join(' AND ') +
    ' ORDER BY vl.transaction_id, vl.employee_id, vl.acknowledged_at, vl.id',
    logsParams,
  );

  const issues: CircularAcknowledgementStatistics['problemReasons'] = {
    missingEmployeeId: 0,
    identityMismatch: 0,
    conflictingAcknowledgementTime: 0,
  };
  const problematicRows = new Set<string>();
  const groups = new Map<string, CircularLogRow[]>();
  const mark = (
    entries: CircularLogRow[],
    reason: keyof CircularAcknowledgementStatistics['problemReasons'],
  ) => {
    for (const entry of entries.filter(row => row.inPeriod === true)) {
      problematicRows.add(entry.id);
      issues[reason]++;
    }
  };
  for (const row of logs.rows) {
    if (row.employeeId === null) {
      mark([row], 'missingEmployeeId');
      continue;
    }
    // Employee identity is the logical key, never the username or user ID.
    const key = row.transactionId + ':' + row.employeeId;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const acknowledged: CircularAcknowledgementEntry[] = [];
  const unique = new Set<string>();
  for (const group of groups.values()) {
    const within = group.filter(row => row.inPeriod === true);
    if (!within.length) continue;
    const mismatched = group.some(
      row => row.linkedEmployeeId !== null && row.linkedEmployeeId !== row.employeeId,
    );
    const conflictingTime = new Set(group.map(row => row.timestampKey)).size !== 1;
    if (mismatched) mark(group, 'identityMismatch');
    if (conflictingTime) mark(group, 'conflictingAcknowledgementTime');
    if (mismatched || conflictingTime) continue;

    // Multiple user accounts may have acknowledged for one employee/book.
    // Only one logical operation counts when the timestamp is consistent.
    const row = within[0];
    acknowledged.push({
      transactionId: row.transactionId,
      employeeId: row.employeeId as string,
      employeeName: row.employeeName ?? '',
      acknowledgedAt: timestampIso(row.acknowledgedAt),
    });
    unique.add(row.employeeId as string);
  }

  acknowledged.sort((a, b) =>
    a.acknowledgedAt.localeCompare(b.acknowledgedAt)
    || a.transactionId.localeCompare(b.transactionId)
    || a.employeeId.localeCompare(b.employeeId),
  );

  const complete = problematicRows.size === 0;
  return {
    circulars: books.rows,
    acknowledgements: acknowledged,
    statistics: {
      circularCount: books.rows.length,
      acknowledgementOperations: complete ? acknowledged.length : null,
      uniqueEmployees: complete ? unique.size : null,
      verifiedAcknowledgementOperations: acknowledged.length,
      verifiedUniqueEmployees: unique.size,
      problemRecords: problematicRows.size,
      problemReasons: issues,
      complete,
    },
  };
}
