/**
 * مستودع الأذونات الزمنية (Phase 9) — EmployeeTimePermission.
 * timeOut/timeIn تُخزن HH:mm وتُقرأ بعد تطبيع الأصفار الثانوية.
 */
import type { TimePermissionStatus } from '../../../src/core/models/employeeTimePermission';
import { normalizeTimeOfDay } from '../database/dateTime';
import type { TimePermissionRecord, TimePermissionRepository } from './contracts';
import { buildWhere, nullToUndefined, type Db } from './shared';

const COLUMNS = `
  id, employee_id AS "employeeId", date,
  time_out AS "timeOut", time_in AS "timeIn",
  duration_minutes AS "durationMinutes", reason, status,
  transaction_id AS "transactionId", notes
`;

interface TimePermissionRow {
  id: string;
  employeeId: string;
  date: string;
  timeOut: string;
  timeIn: string | null;
  durationMinutes: number | null;
  reason: string | null;
  status: TimePermissionStatus;
  transactionId: string | null;
  notes: string | null;
}

function toRecord(row: TimePermissionRow): TimePermissionRecord {
  return {
    id: row.id,
    employeeId: row.employeeId,
    date: row.date,
    timeOut: normalizeTimeOfDay(row.timeOut),
    timeIn: row.timeIn === null ? undefined : normalizeTimeOfDay(row.timeIn),
    durationMinutes: nullToUndefined(row.durationMinutes),
    reason: nullToUndefined(row.reason),
    status: row.status,
    transactionId: nullToUndefined(row.transactionId),
    notes: nullToUndefined(row.notes),
  };
}

const FIELD_COLUMNS: Readonly<Record<string, string>> = {
  employeeId: 'employee_id',
  date: 'date',
  timeOut: 'time_out',
  timeIn: 'time_in',
  durationMinutes: 'duration_minutes',
  reason: 'reason',
  status: 'status',
  transactionId: 'transaction_id',
  notes: 'notes',
};

/** مستودع سجلات الأذونات الزمنية. */
export class PgTimePermissionRepository implements TimePermissionRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<TimePermissionRecord | null> {
    const result = await this.db.query<TimePermissionRow>(
      `SELECT ${COLUMNS} FROM time_permissions WHERE id = $1`,
      [id],
    );
    return result.rows.length > 0 ? toRecord(result.rows[0]) : null;
  }

  async list(
    filter: { employeeId?: string; date?: string; status?: TimePermissionStatus } = {},
  ): Promise<TimePermissionRecord[]> {
    const { clause, params } = buildWhere([
      { column: 'employee_id', value: filter.employeeId },
      { column: 'date', value: filter.date },
      { column: 'status', value: filter.status },
    ]);
    const result = await this.db.query<TimePermissionRow>(
      `SELECT ${COLUMNS} FROM time_permissions${clause} ORDER BY date DESC, id`,
      params,
    );
    return result.rows.map(toRecord);
  }

  async create(input: Omit<TimePermissionRecord, 'id'>): Promise<TimePermissionRecord> {
    const result = await this.db.query<TimePermissionRow>(
      `INSERT INTO time_permissions (
         employee_id, date, time_out, time_in, duration_minutes, reason, status, transaction_id, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${COLUMNS}`,
      [
        input.employeeId,
        input.date,
        input.timeOut,
        input.timeIn ?? null,
        input.durationMinutes ?? null,
        input.reason ?? null,
        input.status,
        input.transactionId ?? null,
        input.notes ?? null,
      ],
    );
    return toRecord(result.rows[0]);
  }

  async update(
    id: string,
    patch: Partial<Omit<TimePermissionRecord, 'id'>>,
  ): Promise<TimePermissionRecord | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [field, column] of Object.entries(FIELD_COLUMNS)) {
      const value = (patch as Record<string, unknown>)[field];
      if (value === undefined) {
        continue;
      }
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    }
    if (sets.length === 0) {
      return this.findById(id);
    }
    params.push(id);
    const result = await this.db.query<TimePermissionRow>(
      `UPDATE time_permissions SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${params.length} RETURNING ${COLUMNS}`,
      params,
    );
    return result.rows.length > 0 ? toRecord(result.rows[0]) : null;
  }
}
