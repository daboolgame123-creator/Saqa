/** Phase 23/C1d-S1: internal-only owner ViewLog reader, NOT wired to reports.
 * Never reuse privileged circular summary for employees or open HTTP routes.
 */
import type { Db } from './shared';
import type { ReportAccessContext, ReportFilter } from './contracts';
import { ReportFilterUnavailableError, ReportDateZoneRequiredError } from './reportRepository';
import { ReportScopeNotReadyError } from '../authorization/reportAccess';

export interface OwnCircularAcknowledgement {
  transactionId: string;
  title: string;
  acknowledgedAt: string;
}
interface OwnLogRow {
  transactionId: string;
  title: string | null;
  linkedEmployeeId: string | null;
  acknowledgedAt: string | Date;
  timestampKey: string;
  inPeriod: boolean;
}

function requireOwner(access: ReportAccessContext | undefined): string {
  const reportType = 'circularsAndAcknowledgements';
  if (!access || access.role !== 'employee' ||
      typeof access.employeeId !== 'string' || !access.employeeId.trim() ||
      access.personnelScope?.kind !== 'owner' ||
      access.personnelScope.employeeId !== access.employeeId ||
      access.requestScope?.kind !== 'owner' ||
      access.requestScope.ownerEmployeeId !== access.employeeId ||
      access.transactionScope === null ||
      access.transactionScope?.availableToEmployeeId !== access.employeeId ||
      access.transactionScope?.excludeDailySituations !== true ||
      access.transactionScope?.availabilityScope !== 'SpecificEmployees' ||
      !Array.isArray(access.transactionScope?.visibilityIn) ||
      access.transactionScope.visibilityIn.length !== 1 ||
      access.transactionScope.visibilityIn[0] !== 'PublicToEmployees') {
    throw new ReportScopeNotReadyError(reportType);
  }
  return access.employeeId;
}

/** Only a verified subset of the current employee's own formal acknowledgements.
 * Ambiguous historical groups are excluded. No aggregate or completeness claim.
 * This is deliberately a separate, unconnected internal API until C1d is tested.
 */
export async function readOwnCircularAcknowledgements(
  db: Db,
  filter: ReportFilter,
  access: ReportAccessContext,
  dateTimeZone: string | null,
): Promise<OwnCircularAcknowledgement[]> {
  const employeeId = requireOwner(access); // before any DB work
  if (filter.reportType !== 'circularsAndAcknowledgements') throw new Error('Report type mismatch');
  const unavailable = ([
    'type', 'section', 'source', 'employee', 'documentDateFrom', 'documentDateTo',
  ] as const).filter(key => filter[key] !== undefined);
  if (unavailable.length) throw new ReportFilterUnavailableError(unavailable);
  if ((filter.dateFrom !== undefined || filter.dateTo !== undefined)
      && !dateTimeZone?.trim()) throw new ReportDateZoneRequiredError();

  const params: unknown[] = [employeeId];
  const where = [
    'vl.employee_id = $1',
    'vl.acknowledged_at IS NOT NULL',
    "t.direction = 'وارد'",
    "t.sub_type = 'تعميم'",
    "(t.visibility #>> '{}') = 'PublicToEmployees'",
    't.deleted_at IS NULL',
    't.is_daily_situation = false',
  ];
  if (filter.status !== undefined) {
    params.push(filter.status);
    where.push('t.status = $' + params.length);
  }
  // Keep full owner-specific history in WHERE, apply date predicate to each
  // row in SELECT to detect conflicting timestamps across report periods.
  const period: string[] = [];
  if (filter.dateFrom !== undefined || filter.dateTo !== undefined) {
    params.push(dateTimeZone as string);
    const localDay = 'timezone($' + params.length + '::text, vl.acknowledged_at)::date';
    if (filter.dateFrom !== undefined) {
      params.push(filter.dateFrom);
      period.push(localDay + ' >= $' + params.length + '::date');
    }
    if (filter.dateTo !== undefined) {
      params.push(filter.dateTo);
      period.push(localDay + ' <= $' + params.length + '::date');
    }
  }
  const inPeriod = period.length ? period.join(' AND ') : 'TRUE';
  const sql = [
    'SELECT vl.transaction_id AS "transactionId", t.subject AS "title",',
    'u.employee_id AS "linkedEmployeeId",',
    'vl.acknowledged_at AS "acknowledgedAt",',
    'vl.acknowledged_at::text AS "timestampKey",',
    '(' + inPeriod + ') AS "inPeriod"',
    'FROM view_logs vl',
    'JOIN transactions t ON t.id = vl.transaction_id',
    'LEFT JOIN users u ON u.id = vl.user_id',
    'WHERE ' + where.join(' AND '),
    'ORDER BY vl.transaction_id, vl.acknowledged_at, vl.id',
  ].join(' ');
  const result = await db.query<OwnLogRow>(sql, params);
  const grouped = new Map<string, OwnLogRow[]>();
  for (const row of result.rows) {
    const group = grouped.get(row.transactionId);
    if (group) group.push(row);
    else grouped.set(row.transactionId, [row]);
  }
  const entries: OwnCircularAcknowledgement[] = [];
  for (const [transactionId, group] of grouped) {
    const within = group.filter(row => row.inPeriod === true);
    if (!within.length) continue;
    if (group.some(row => row.linkedEmployeeId !== null &&
        row.linkedEmployeeId !== employeeId)) continue;
    if (new Set(group.map(row => row.timestampKey)).size !== 1) continue;
    const row = within[0];
    const date = row.acknowledgedAt instanceof Date
      ? row.acknowledgedAt : new Date(row.acknowledgedAt);
    if (!Number.isFinite(date.getTime())) continue;
    entries.push({
      transactionId,
      title: row.title ?? '',
      acknowledgedAt: date.toISOString(),
    });
  }
  entries.sort((a, b) =>
    a.acknowledgedAt.localeCompare(b.acknowledgedAt) ||
    a.transactionId.localeCompare(b.transactionId));
  return entries;
}
