/**
 * مستودع التكليفات/الإيفادات (Phase 9) — EmployeeAssignment.
 */
import type {
  AssignmentStatus,
  AssignmentType,
  EmployeeAssignment,
} from '../../../src/core/models/employeeAssignment';
import type { AssignmentRepository } from './contracts';
import { buildWhere, nullToUndefined, type Db } from './shared';

const COLUMNS = `
  id, employee_id AS "employeeId", type, entity, place,
  start_date AS "startDate", end_date AS "endDate", purpose, status,
  transaction_id AS "transactionId", notes
`;

interface AssignmentRow {
  id: string;
  employeeId: string;
  type: AssignmentType;
  entity: string;
  place: string | null;
  startDate: string;
  endDate: string;
  purpose: string | null;
  status: AssignmentStatus;
  transactionId: string | null;
  notes: string | null;
}

function toRecord(row: AssignmentRow): EmployeeAssignment {
  return {
    id: row.id,
    employeeId: row.employeeId,
    type: row.type,
    entity: row.entity,
    place: nullToUndefined(row.place),
    startDate: row.startDate,
    endDate: row.endDate,
    purpose: nullToUndefined(row.purpose),
    status: row.status,
    transactionId: nullToUndefined(row.transactionId),
    notes: nullToUndefined(row.notes),
  };
}

const FIELD_COLUMNS: Readonly<Record<string, string>> = {
  employeeId: 'employee_id',
  type: 'type',
  entity: 'entity',
  place: 'place',
  startDate: 'start_date',
  endDate: 'end_date',
  purpose: 'purpose',
  status: 'status',
  transactionId: 'transaction_id',
  notes: 'notes',
};

/** مستودع سجلات التكليف. */
export class PgAssignmentRepository implements AssignmentRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<EmployeeAssignment | null> {
    const result = await this.db.query<AssignmentRow>(
      `SELECT ${COLUMNS} FROM assignments WHERE id = $1`,
      [id],
    );
    return result.rows.length > 0 ? toRecord(result.rows[0]) : null;
  }

  async list(
    filter: { employeeId?: string; status?: AssignmentStatus; type?: AssignmentType } = {},
  ): Promise<EmployeeAssignment[]> {
    const { clause, params } = buildWhere([
      { column: 'employee_id', value: filter.employeeId },
      { column: 'status', value: filter.status },
      { column: 'type', value: filter.type },
    ]);
    const result = await this.db.query<AssignmentRow>(
      `SELECT ${COLUMNS} FROM assignments${clause} ORDER BY start_date DESC, id`,
      params,
    );
    return result.rows.map(toRecord);
  }

  async create(input: Omit<EmployeeAssignment, 'id'>): Promise<EmployeeAssignment> {
    const result = await this.db.query<AssignmentRow>(
      `INSERT INTO assignments (
         employee_id, type, entity, place, start_date, end_date, purpose, status, transaction_id, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${COLUMNS}`,
      [
        input.employeeId,
        input.type,
        input.entity,
        input.place ?? null,
        input.startDate,
        input.endDate,
        input.purpose ?? null,
        input.status,
        input.transactionId ?? null,
        input.notes ?? null,
      ],
    );
    return toRecord(result.rows[0]);
  }

  async update(
    id: string,
    patch: Partial<Omit<EmployeeAssignment, 'id'>>,
  ): Promise<EmployeeAssignment | null> {
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
    const result = await this.db.query<AssignmentRow>(
      `UPDATE assignments SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${params.length} RETURNING ${COLUMNS}`,
      params,
    );
    return result.rows.length > 0 ? toRecord(result.rows[0]) : null;
  }
}
