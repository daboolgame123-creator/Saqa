/**
 * مستودع الموقف اليومي المستقل (Phase 9 — BR-13).
 *
 * رابط {kind,id} في النموذج يُخزَّن كأعمدة FK منفصلة لكل هدف (5 أعمدة)
 * مع يقظة ألا يتجاوز رابطاً واحداً — كي يبقى التكامل المرجعي مفروضاً في القاعدة.
 */
import type {
  DailySituationCategory,
  DailySituationRecord,
  DailySituationRelatedRecord,
  DailySituationRelatedRecordKind,
} from '../../../src/core/models/dailySituation';
import type { DailySituationRepository } from './contracts';
import { buildWhere, nullToUndefined, type Db } from './shared';

const COLUMNS = `
  id, employee_id AS "employeeId", date, category,
  time_or_duration AS "timeOrDuration", reason, notes,
  related_transaction_id AS "relatedTransactionId",
  related_leave_id AS "relatedLeaveId",
  related_time_permission_id AS "relatedTimePermissionId",
  related_assignment_id AS "relatedAssignmentId",
  related_course_id AS "relatedCourseId",
  created_at AS "createdAt"
`;

/** خريطة نوع الرابط ⇒ عمود الجدول. */
const RELATED_KIND_TO_COLUMN: Readonly<Record<DailySituationRelatedRecordKind, string>> = {
  transaction: 'related_transaction_id',
  leave: 'related_leave_id',
  time_permission: 'related_time_permission_id',
  assignment: 'related_assignment_id',
  course: 'related_course_id',
};

interface SituationRow {
  id: string;
  employeeId: string;
  date: string;
  category: DailySituationCategory;
  timeOrDuration: string | null;
  reason: string | null;
  notes: string | null;
  relatedTransactionId: string | null;
  relatedLeaveId: string | null;
  relatedTimePermissionId: string | null;
  relatedAssignmentId: string | null;
  relatedCourseId: string | null;
  createdAt: string;
}

/** يعيد الرابط من الأعمدة الخمسة (أول قيمة غير null — واليقظة تمنع تجاوز واحد). */
function toRelated(row: SituationRow): DailySituationRelatedRecord | undefined {
  const pairs: readonly [DailySituationRelatedRecordKind, string | null][] = [
    ['transaction', row.relatedTransactionId],
    ['leave', row.relatedLeaveId],
    ['time_permission', row.relatedTimePermissionId],
    ['assignment', row.relatedAssignmentId],
    ['course', row.relatedCourseId],
  ];
  const found = pairs.find(([, id]) => id !== null);
  return found === undefined ? undefined : { kind: found[0], id: found[1] as string };
}

function toRecord(row: SituationRow): DailySituationRecord {
  return {
    id: row.id,
    employeeId: row.employeeId,
    date: row.date,
    category: row.category,
    timeOrDuration: nullToUndefined(row.timeOrDuration),
    reason: nullToUndefined(row.reason),
    notes: nullToUndefined(row.notes),
    relatedRecord: toRelated(row),
    createdAt: row.createdAt,
  };
}
const FIELD_COLUMNS: Readonly<Record<string, string>> = {
  employeeId: 'employee_id',
  date: 'date',
  category: 'category',
  timeOrDuration: 'time_or_duration',
  reason: 'reason',
  notes: 'notes',
};

/** يبني قيود أعمدة الروابط: يضبط هدف الـkind المطلوب ويصفّر الأعمدة الأخرى. */
function relatedSetClause(related: DailySituationRelatedRecord): { sql: string; params: unknown[] } {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [kind, column] of Object.entries(RELATED_KIND_TO_COLUMN)) {
    params.push(kind === related.kind ? related.id : null);
    sets.push(`${column} = $${params.length}`);
  }
  return { sql: sets.join(', '), params };
}

/** مستودع سجلات الموقف اليومي. */
export class PgDailySituationRepository implements DailySituationRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<DailySituationRecord | null> {
    const result = await this.db.query<SituationRow>(
      `SELECT ${COLUMNS} FROM daily_situations WHERE id = $1`,
      [id],
    );
    return result.rows.length > 0 ? toRecord(result.rows[0]) : null;
  }

  async list(
    filter: { employeeId?: string; date?: string; category?: DailySituationCategory } = {},
  ): Promise<DailySituationRecord[]> {
    const { clause, params } = buildWhere([
      { column: 'employee_id', value: filter.employeeId },
      { column: 'date', value: filter.date },
      { column: 'category', value: filter.category },
    ]);
    const result = await this.db.query<SituationRow>(
      `SELECT ${COLUMNS} FROM daily_situations${clause} ORDER BY date DESC, id`,
      params,
    );
    return result.rows.map(toRecord);
  }

  async create(
    input: Omit<DailySituationRecord, 'id' | 'createdAt'> & { createdAt?: string },
  ): Promise<DailySituationRecord> {
    const params: unknown[] = [
      input.employeeId,
      input.date,
      input.category,
      input.timeOrDuration ?? null,
      input.reason ?? null,
      input.notes ?? null,
    ];
    let relatedValues: string;
    if (input.relatedRecord === undefined) {
      relatedValues = 'NULL, NULL, NULL, NULL, NULL';
    } else {
      const built = relatedSetClause(input.relatedRecord);
      params.push(...built.params);
      relatedValues = built.params.map((_, i) => `$${7 + i}`).join(', ');
    }
    const result = await this.db.query<SituationRow>(
      `INSERT INTO daily_situations (
         employee_id, date, category, time_or_duration, reason, notes,
         related_transaction_id, related_leave_id, related_time_permission_id,
         related_assignment_id, related_course_id
       ) VALUES ($1,$2,$3,$4,$5,$6,${relatedValues}) RETURNING ${COLUMNS}`,
      params,
    );
    return toRecord(result.rows[0]);
  }

  async update(
    id: string,
    patch: Partial<Omit<DailySituationRecord, 'id' | 'createdAt'>>,
  ): Promise<DailySituationRecord | null> {
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
    if (patch.relatedRecord !== undefined) {
      const built = relatedSetClause(patch.relatedRecord);
      params.push(...built.params);
      sets.push(built.sql);
    }
    if (sets.length === 0) {
      return this.findById(id);
    }
    params.push(id);
    const result = await this.db.query<SituationRow>(
      `UPDATE daily_situations SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${params.length} RETURNING ${COLUMNS}`,
      params,
    );
    return result.rows.length > 0 ? toRecord(result.rows[0]) : null;
  }
}
