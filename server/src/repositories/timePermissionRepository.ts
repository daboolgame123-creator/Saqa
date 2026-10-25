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

  /**
   * مجموع المدد المخزّنة بالدقائق في مدى تواريخ — أساس مؤشر تجاوز
   * 4 ساعات أسبوعياً (§14.4).
   *
   * قراءة للقياس فقط: `duration_minutes` المخزَّن هو مصدر الحقيقة، ولا
   * يُشتق هنا من `time_out`/`time_in`. `time_permissions.status <> 'cancelled'`
   * لاستثناء الملغاة من المقياس — الإلغاء ينشئ حركة عكسية (§15) ولا يُلغي
   * السجل، لكن الزمنية الملغاة لا تُحتسب زمناً ممنوحاً.
   */
  async sumMinutesBetween(
    employeeId: string,
    fromDate: string,
    toDate: string,
  ): Promise<number> {
    const result = await this.db.query<{ total: string | null }>(
      `SELECT COALESCE(SUM(duration_minutes), 0)::text AS total
         FROM time_permissions
        WHERE employee_id = $1
          AND date >= $2 AND date <= $3
          AND duration_minutes IS NOT NULL
          AND status <> 'cancelled'`,
      [employeeId, fromDate, toDate],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  /**
   * زمنيات لها مدة مخزّنة ولم تُحوَّل بعد (Phase 18).
   *
   * «لم تُحوَّل» = لا وجود حركة `time_conversion` تشير إليها. يمنع
   * التحويل المكرر لنفس السجل، وهو شرط صحّة الرصيد الطارئ: التحويل
   * مرّة واحدة لكل زمنية.
   */
  async listUnconverted(
    employeeId: string,
    excludeId?: string,
  ): Promise<TimePermissionRecord[]> {
    const params: unknown[] = [employeeId];
    const exclude = excludeId === undefined ? '' : `AND id <> $${params.push(excludeId)}`;
    const result = await this.db.query<TimePermissionRow>(
      `SELECT ${COLUMNS} FROM time_permissions
        WHERE employee_id = $1
          AND duration_minutes IS NOT NULL
          AND status <> 'cancelled'
          ${exclude}
          AND NOT EXISTS (
            SELECT 1 FROM leave_ledger
             WHERE leave_ledger.time_permission_id = time_permissions.id
               AND leave_ledger.movement_type = 'time_conversion'
          )
        ORDER BY date ASC, time_out ASC, id`,
      params,
    );
    return result.rows.map(toRecord);
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
