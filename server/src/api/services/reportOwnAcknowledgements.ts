/** Phase 23/C1d-S3: standalone, non-HTTP personal acknowledgements.
 * Do NOT route this through privileged circular report statistics or the
 * general export service. The only identity source is the access context.
 */
import ExcelJS from 'exceljs';
import type { Db } from '../../repositories/shared';
import type { ReportAccessContext, ReportFilter } from '../../repositories/contracts';
import {
  readOwnCircularAcknowledgements,
  type OwnCircularAcknowledgement,
} from '../../repositories/reportOwnCircularAcknowledgements';

export class OwnAcknowledgementExportError extends Error {
  readonly code = 'OWN_ACKNOWLEDGEMENT_EXPORT_UNAVAILABLE';
  constructor(message: string) {
    super(message);
    this.name = 'OwnAcknowledgementExportError';
  }
}

const MAX_ROWS = 2000;
const MAX_CELL = 4000;
const MAX_CHARS = 250_000;
const canonicalUtc = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
};

export interface OwnAcknowledgementReport {
  ownAcknowledgementCount: number;
  entries: readonly OwnCircularAcknowledgement[];
}

/** A projection strictly limited to verified own acknowledgement history.
 * No aggregate about other people, identity, status anomaly or global book count.
 */
export async function runOwnAcknowledgementReport(
  db: Db,
  filter: ReportFilter,
  access: ReportAccessContext,
  dateTimeZone: string | null,
): Promise<OwnAcknowledgementReport> {
  const entries = await readOwnCircularAcknowledgements(db, filter, access, dateTimeZone);
  if (entries.length > MAX_ROWS) {
    throw new OwnAcknowledgementExportError('Own acknowledgement report exceeds row limit');
  }
  let characters = 0;
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry.transactionId !== 'string' || !entry.transactionId.trim() ||
        typeof entry.title !== 'string' || typeof entry.acknowledgedAt !== 'string' ||
        !canonicalUtc(entry.acknowledgedAt) ||
        entry.title.length > MAX_CELL || entry.transactionId.length > MAX_CELL) {
      throw new OwnAcknowledgementExportError('Invalid own acknowledgement report entry');
    }
    if (ids.has(entry.transactionId)) {
      throw new OwnAcknowledgementExportError('Duplicate own acknowledgement record');
    }
    ids.add(entry.transactionId);
    characters += entry.title.length + entry.acknowledgedAt.length;
    if (characters > MAX_CHARS) {
      throw new OwnAcknowledgementExportError('Own acknowledgement report exceeds text limit');
    }
  }
  return { ownAcknowledgementCount: entries.length, entries };
}

function escapeFormula(value: string): string {
  return /^[\s\u0000-\u001f]*[=+\-@]/u.test(value) ? "'" + value : value;
}

/** XLSX uses exactly the same owner-scoped rows and own-only count.
 * Internal-only: does NOT alter the public report export route.
 */
export async function exportOwnAcknowledgementsExcel(
  db: Db,
  filter: ReportFilter,
  access: ReportAccessContext,
  dateTimeZone: string | null,
): Promise<Buffer> {
  const report = await runOwnAcknowledgementReport(db, filter, access, dateTimeZone);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ALSQAYA own acknowledgements';
  const summary = workbook.addWorksheet('الملخص');
  summary.addRow(['المؤشر', 'القيمة']);
  summary.addRow(['إقراراتي المؤكدة', String(report.ownAcknowledgementCount)]);
  const details = workbook.addWorksheet('إقراراتي');
  details.addRow(['موضوع التعميم', 'تاريخ إقراري']);
  for (const entry of report.entries) {
    details.addRow([escapeFormula(entry.title), entry.acknowledgedAt]);
  }
  for (const worksheet of [summary, details]) {
    worksheet.getRow(1).font = { bold: true };
    worksheet.eachRow(row => row.eachCell(cell => { cell.numFmt = '@'; }));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
