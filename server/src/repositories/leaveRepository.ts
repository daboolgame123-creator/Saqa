/**
 * مستودع سجلات الإجازات (Phase 9) — EmployeeLeave فقط.
 * رصيد الإجازات وحركاته جداول منفصلة لا تُدار من هنا (Phase 18).
 */
import type { EmployeeLeave, LeaveStatus, LeaveType } from '../../../src/core/models/employeeLeave';
import type { LeaveRepository } from './contracts';
import { buildWhere, limitOffsetClause, nullToUndefined, type Db } from './shared';

const COLUMNS = `
  id, employee_id AS "employeeId", type,
  start_date AS "startDate", end_date AS "endDate",
  days, is_paid AS "isPaid", status,
  transaction_id AS "transactionId", notes
`;

interface LeaveRow {
  id: string;
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number | null;
  isPaid: boolean;
  status: LeaveStatus;
  transactionId: string | null;
  notes: string | null;
}

function toRecord(row: LeaveRow): EmployeeLeave {
  return {
    id: row.id,
    employeeId: row.employeeId,
    type: row.type,
    startDate: row.startDate,
    endDate: row.endDate,
    days: nullToUndefined(row.days),
    isPaid: row.isPaid,
    status: row.status,
    transactionId: nullToUndefined(row.transactionId),
    notes: nullToUndefined(row.notes),
  };
}

const FIELD_COLUMNS: Readonly<Record<string, string>> = {
  employeeId: 'employee_id',
  type: 'type',
  startDate: 'start_date',
  endDate: 'end_date',
  days: 'days',
  isPaid: 'is_paid',
  status: 'status',
  transactionId: 'transaction_id',
  notes: 'notes',
};

/** مستودع سجلات الإجازات. */
export class PgLeaveRepository implements LeaveRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<EmployeeLeave | null> {
    const result = await this.db.query<LeaveRow>(
      `SELECT ${COLUMNS} FROM leaves WHERE id = $1`,
      [id],
    );
    return result.rows.length > 0 ? toRecord(result.rows[0]) : null;
  }

  async list(
    filter: { employeeId?: string; status?: LeaveStatus; type?: LeaveType } = {},
  ): Promise<EmployeeLeave[]> {
    const { clause, params } = buildWhere([
      { column: 'employee_id', value: filter.employeeId },
      { column: 'status', value: filter.status },
      { column: 'type', value: filter.type },
    ]);
    let sql = `SELECT ${COLUMNS} FROM leaves${clause} ORDER BY start_date DESC, id`;
    sql += limitOffsetClause(undefined, undefined, params);
    const result = await this.db.query<LeaveRow>(sql, params);
    return result.rows.map(toRecord);
  }

  async create(input: Omit<EmployeeLeave, 'id'>): Promise<EmployeeLeave> {
    const result = await this.db.query<LeaveRow>(
      `INSERT INTO leaves (employee_id, type, start_date, end_date, days, is_paid, status, transaction_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${COLUMNS}`,
      [
        input.employeeId,
        input.type,
        input.startDate,
        input.endDate,
        input.days ?? null,
        input.isPaid ?? true,
        input.status,
        input.transactionId ?? null,
        input.notes ?? null,
      ],
    );
    return toRecord(result.rows[0]);
  }

  async update(id: string, patch: Partial<Omit<EmployeeLeave, 'id'>>): Promise<EmployeeLeave | null> {
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
    const result = await this.db.query<LeaveRow>(
      `UPDATE leaves SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${params.length} RETURNING ${COLUMNS}`,
      params,
    );
    return result.rows.length > 0 ? toRecord(result.rows[0]) : null;
  }
}
