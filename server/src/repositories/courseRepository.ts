/**
 * مستودع الدورات والمشاركات العلمية (Phase 9) — EmployeeCourse.
 */
import type {
  EmployeeCourse,
  ParticipationStatus,
  ParticipationType,
} from '../../../src/core/models/employeeCourse';
import type { CourseRepository } from './contracts';
import { buildWhere, nullToUndefined, type Db } from './shared';

const COLUMNS = `
  id, employee_id AS "employeeId", name, organizer, place,
  start_date AS "startDate", end_date AS "endDate",
  participation_type AS "participationType",
  participation_status AS "participationStatus",
  transaction_id AS "transactionId",
  certificate_ref AS "certificateRef", notes
`;

interface CourseRow {
  id: string;
  employeeId: string;
  name: string;
  organizer: string;
  place: string | null;
  startDate: string | null;
  endDate: string | null;
  participationType: ParticipationType;
  participationStatus: ParticipationStatus;
  transactionId: string | null;
  certificateRef: string | null;
  notes: string | null;
}

function toRecord(row: CourseRow): EmployeeCourse {
  return {
    id: row.id,
    employeeId: row.employeeId,
    name: row.name,
    organizer: row.organizer,
    place: nullToUndefined(row.place),
    startDate: nullToUndefined(row.startDate),
    endDate: nullToUndefined(row.endDate),
    participationType: row.participationType,
    participationStatus: row.participationStatus,
    transactionId: nullToUndefined(row.transactionId),
    certificateRef: nullToUndefined(row.certificateRef),
    notes: nullToUndefined(row.notes),
  };
}

const FIELD_COLUMNS: Readonly<Record<string, string>> = {
  employeeId: 'employee_id',
  name: 'name',
  organizer: 'organizer',
  place: 'place',
  startDate: 'start_date',
  endDate: 'end_date',
  participationType: 'participation_type',
  participationStatus: 'participation_status',
  transactionId: 'transaction_id',
  certificateRef: 'certificate_ref',
  notes: 'notes',
};

/** مستودع سجلات الدورات. */
export class PgCourseRepository implements CourseRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<EmployeeCourse | null> {
    const result = await this.db.query<CourseRow>(
      `SELECT ${COLUMNS} FROM courses WHERE id = $1`,
      [id],
    );
    return result.rows.length > 0 ? toRecord(result.rows[0]) : null;
  }

  async list(
    filter: {
      employeeId?: string;
      status?: ParticipationStatus;
      participationType?: ParticipationType;
    } = {},
  ): Promise<EmployeeCourse[]> {
    const { clause, params } = buildWhere([
      { column: 'employee_id', value: filter.employeeId },
      { column: 'participation_status', value: filter.status },
      { column: 'participation_type', value: filter.participationType },
    ]);
    const result = await this.db.query<CourseRow>(
      `SELECT ${COLUMNS} FROM courses${clause} ORDER BY start_date DESC NULLS LAST, id`,
      params,
    );
    return result.rows.map(toRecord);
  }

  async create(input: Omit<EmployeeCourse, 'id'>): Promise<EmployeeCourse> {
    const result = await this.db.query<CourseRow>(
      `INSERT INTO courses (
         employee_id, name, organizer, place, start_date, end_date,
         participation_type, participation_status, transaction_id, certificate_ref, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${COLUMNS}`,
      [
        input.employeeId,
        input.name,
        input.organizer,
        input.place ?? null,
        input.startDate ?? null,
        input.endDate ?? null,
        input.participationType,
        input.participationStatus,
        input.transactionId ?? null,
        input.certificateRef ?? null,
        input.notes ?? null,
      ],
    );
    return toRecord(result.rows[0]);
  }

  async update(
    id: string,
    patch: Partial<Omit<EmployeeCourse, 'id'>>,
  ): Promise<EmployeeCourse | null> {
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
    const result = await this.db.query<CourseRow>(
      `UPDATE courses SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${params.length} RETURNING ${COLUMNS}`,
      params,
    );
    return result.rows.length > 0 ? toRecord(result.rows[0]) : null;
  }
}
