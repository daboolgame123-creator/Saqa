/** Phase 23 / C8 — shared SQL/service/export admission budget.
 *
 * A 2001-row sentinel detects an oversized report without silently returning
 * partial totals. The sentinel limit is a SERVER-OWNED bound parameter,
 * never a report filter or a caller-selected page size.
 */
import { AppError } from '../errors';

export const MAX_REPORT_ROWS = 2000 as const;
export const REPORT_SQL_SENTINEL_ROWS = MAX_REPORT_ROWS + 1;

export class ReportResultTooLargeError extends AppError {
  constructor() {
    super(
      'التقرير أكبر من الحد المعتمد. يُرجى تضييق الفترة أو الفلاتر.',
      422,
      'REPORT_RESULT_TOO_LARGE',
      true,
    );
  }
}

/** Append a bind-parameter sentinel AFTER scoped predicates and stable ORDER BY. */
export function boundReportSql(sql: string, params: unknown[]): string {
  if (!/\bORDER\s+BY\b/i.test(sql) || /\bLIMIT\b/i.test(sql)) {
    throw new Error('Unexpected report SQL without stable ordering or with existing limit');
  }
  params.push(REPORT_SQL_SENTINEL_ROWS);
  return sql + ' LIMIT $' + params.length;
}

/** Reject, never truncate, after the repository's bounded SQL result. */
export function requireCompleteReportRows<T>(rows: readonly T[]): void {
  if (!Array.isArray(rows) || rows.length > MAX_REPORT_ROWS) {
    throw new ReportResultTooLargeError();
  }
}
