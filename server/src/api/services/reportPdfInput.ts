/** P1k ALT-07: strict DATA ONLY input for a future isolated PDF renderer.
 * No raw HTML, paths, URLs, request objects or authorization metadata.
 * Call ONLY with a ReportExportModel built after authorized ReportApiService.run.
 * This does not activate report HTTP routes or the experimental worker.
 */
import type { ReportExportModel } from './reportExport';

export class ReportPdfInputError extends Error {
  readonly code = 'REPORT_PDF_INPUT_REJECTED';
  constructor(reason: string) { super(reason); this.name = 'ReportPdfInputError'; }
}

export interface ReportPdfInputV1 {
  schemaVersion: 1;
  title: string;
  summary: string[][];
  details: string[][];
  acknowledgements: string[][];
  hasAcknowledgements: boolean;
}

const MAX_PDF_ROWS = 250;
const MAX_CELL_LENGTH = 4000;
const MAX_ROW_CHARS = 1200;
const MAX_TOTAL_CHARS = 180_000;
const MAX_JSON_BYTES = 512_000;
const MAX_SUMMARY_ROWS = 100;
const HEADER_KEYS = ['schemaVersion', 'title', 'summary', 'details', 'acknowledgements', 'hasAcknowledgements'] as const;
const MODEL_KEYS = ['title', 'summary', 'details', 'acknowledgements', 'hasAcknowledgements'] as const;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, i) => key !== expected[i])) {
    throw new ReportPdfInputError('Unexpected or missing PDF input fields');
  }
}

function boundedString(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_CELL_LENGTH) {
    throw new ReportPdfInputError('Invalid PDF text field');
  }
  // Reject broken UTF-16. Do not modify valid Arabic/Latin/bidi text.
  for (let i = 0; i < value.length; i++) {
    const n = value.charCodeAt(i);
    if (n >= 0xD800 && n <= 0xDBFF) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) {
        throw new ReportPdfInputError('Unpaired Unicode surrogate');
      }
    } else if (n >= 0xDC00 && n <= 0xDFFF) {
      throw new ReportPdfInputError('Unpaired Unicode surrogate');
    }
  }
  return value;
}

function rows(value: unknown, columns: number, limit: number): string[][] {
  if (!Array.isArray(value) || value.length > limit) {
    throw new ReportPdfInputError('Invalid PDF row count');
  }
  return value.map((row: unknown) => {
    if (!Array.isArray(row) || row.length !== columns) {
      throw new ReportPdfInputError('Unexpected PDF column count');
    }
    const clean = row.map(boundedString);
    if (clean.reduce((count, field) => count + field.length, 0) > MAX_ROW_CHARS && columns !== 2) {
      throw new ReportPdfInputError('Oversized PDF row');
    }
    return clean;
  });
}

function validate(value: unknown): ReportPdfInputV1 {
  if (!plain(value)) throw new ReportPdfInputError('Invalid PDF envelope');
  exactKeys(value, HEADER_KEYS);
  if (value.schemaVersion !== 1 || typeof value.hasAcknowledgements !== 'boolean') {
    throw new ReportPdfInputError('Unsupported PDF schema or acknowledgement flag');
  }
  const title = boundedString(value.title);
  const summary = rows(value.summary, 2, MAX_SUMMARY_ROWS);
  const details = rows(value.details, 8, MAX_PDF_ROWS);
  const acknowledgements = rows(value.acknowledgements, 3, MAX_PDF_ROWS);
  if (!value.hasAcknowledgements && acknowledgements.length > 0) {
    throw new ReportPdfInputError('Acknowledgements forbidden for this report');
  }
  const total = title.length + [...summary, ...details, ...acknowledgements]
    .reduce((sum, row) => sum + row.reduce((n, field) => n + field.length, 0), 0);
  if (total > MAX_TOTAL_CHARS) throw new ReportPdfInputError('Oversized PDF text budget');
  return { schemaVersion: 1, title, summary, details, acknowledgements,
    hasAcknowledgements: value.hasAcknowledgements };
}

/** Must be invoked only after building a trusted scoped ReportExportModel. */
export function encodeReportPdfInput(model: ReportExportModel): Buffer {
  if (!plain(model)) throw new ReportPdfInputError('Invalid trusted report model');
  exactKeys(model, MODEL_KEYS);
  const payload = validate({ schemaVersion: 1, title: model.title,
    summary: model.summary, details: model.details,
    acknowledgements: model.acknowledgements,
    hasAcknowledgements: model.hasAcknowledgements });
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  if (bytes.length > MAX_JSON_BYTES) throw new ReportPdfInputError('Oversized PDF JSON input');
  return bytes;
}

/** Fail-closed parser for a future fixed-template worker. No implicit casts. */
export function decodeReportPdfInput(bytes: Uint8Array): ReportPdfInputV1 {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > MAX_JSON_BYTES) {
    throw new ReportPdfInputError('Invalid PDF JSON input size');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new ReportPdfInputError('Malformed PDF JSON or UTF-8');
  }
  return validate(parsed);
}
