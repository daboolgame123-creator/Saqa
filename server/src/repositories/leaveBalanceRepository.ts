/**
 * مستودع الرصيد — مصدر الحقيقة الوحيد لأرقام رصيد الإجازة (Phase 18 — §7.9).
 *
 * `leave_balances` كان تعريفاً هيكلياً في الترحيل 0003 بلا أي حقل حسابي؛
 * الترحيل 0011 أضاف الحقول المحسوبة، وهذا المستودع ينفّذ القراءة والكتابة عليها.
 *
 * قاعدة الكتابة: **لا يُعدَّل أي حقل رصيد إلا مع حركة في `leave_ledger`**.
 * لذلك `updateNumeric` لا يُستدعى إلا من داخل معاملة محرّك القواعد، وفيها
 * تُنشأ الحركة قبل تحديث الأرقام — فإن فشل أيٌّ منهما ترجع الحركة كلها.
 */
import type { EmployeeLeaveBalance } from '../../../src/core/models/employeeLeave';
import type {
  CreateEmployeeLeaveBalanceInput,
  LeaveBalanceNumericPatch,
  LeaveBalanceRepository,
} from './contracts';
import { buildWhere, type Db } from './shared';

const COLUMNS = `
  id, employee_id AS "employeeId", year,
  annual_balance AS "annualBalance",
  annual_service_days AS "annualServiceDays",
  annual_earned_days AS "annualEarnedDays",
  annual_remainder_days AS "annualRemainderDays",
  annual_carryover_days AS "annualCarryoverDays",
  annual_pending_days AS "annualPendingDays",
  emergency_balance AS "emergencyBalance",
  emergency_remainder_minutes AS "emergencyRemainderMinutes",
  unpaid_days AS "unpaidDays",
  notes, created_at AS "createdAt", updated_at AS "updatedAt"
`;

/** الحقول الرقمية — أسماؤها في النموذج وفي القاعدة. */
const NUMERIC_FIELDS = [
  'annualBalance',
  'annualServiceDays',
  'annualEarnedDays',
  'annualRemainderDays',
  'annualCarryoverDays',
  'annualPendingDays',
  'emergencyBalance',
  'emergencyRemainderMinutes',
  'unpaidDays',
] as const;

type NumericField = (typeof NUMERIC_FIELDS)[number];

const DB_COLUMN: Readonly<Record<NumericField, string>> = {
  annualBalance: 'annual_balance',
  annualServiceDays: 'annual_service_days',
  annualEarnedDays: 'annual_earned_days',
  annualRemainderDays: 'annual_remainder_days',
  annualCarryoverDays: 'annual_carryover_days',
  annualPendingDays: 'annual_pending_days',
  emergencyBalance: 'emergency_balance',
  emergencyRemainderMinutes: 'emergency_remainder_minutes',
  unpaidDays: 'unpaid_days',
};

type BalanceRow = Record<NumericField, string | number> & {
  id: string;
  employeeId: string;
  year: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

function toRecord(row: BalanceRow): EmployeeLeaveBalance {
  const record: EmployeeLeaveBalance = {
    id: row.id,
    employeeId: row.employeeId,
    year: row.year,
    annualBalance: 0,
    annualServiceDays: 0,
    annualEarnedDays: 0,
    annualRemainderDays: 0,
    annualCarryoverDays: 0,
    annualPendingDays: 0,
    emergencyBalance: 0,
    emergencyRemainderMinutes: 0,
    unpaidDays: 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.notes !== null && { notes: row.notes }),
  };
  // numeric/int يعود نصاً عبر pg — التحويل هنا مرة واحدة في موضع واحد.
  for (const field of NUMERIC_FIELDS) {
    record[field] = Number(row[field]);
  }
  return record;
}

/** تنفيذ جدول أرصدة الإجازات. */
export class PgLeaveBalanceRepository implements LeaveBalanceRepository {
  constructor(private readonly db: Db) {}

  async findByEmployeeYear(
    employeeId: string,
    year: string,
  ): Promise<EmployeeLeaveBalance | null> {
    const result = await this.db.query<BalanceRow>(
      `SELECT ${COLUMNS} FROM leave_balances WHERE employee_id = $1 AND year = $2`,
      [employeeId, year],
    );
    return result.rows.length > 0 ? toRecord(result.rows[0]) : null;
  }

  /** رصيد آخر سنة قبل `year` — أساس حساب الترحيل السنوي (§14.1). */
  async findLatestBefore(
    employeeId: string,
    year: string,
  ): Promise<EmployeeLeaveBalance | null> {
    const result = await this.db.query<BalanceRow>(
      `SELECT ${COLUMNS} FROM leave_balances
       WHERE employee_id = $1 AND year < $2 ORDER BY year DESC LIMIT 1`,
      [employeeId, year],
    );
    return result.rows.length > 0 ? toRecord(result.rows[0]) : null;
  }

  async list(filter: { employeeId?: string; year?: string } = {}): Promise<EmployeeLeaveBalance[]> {
    const { clause, params } = buildWhere([
      { column: 'employee_id', value: filter.employeeId },
      { column: 'year', value: filter.year },
    ]);
    const result = await this.db.query<BalanceRow>(
      `SELECT ${COLUMNS} FROM leave_balances${clause} ORDER BY year DESC, employee_id`,
      params,
    );
    return result.rows.map(toRecord);
  }

  async create(input: CreateEmployeeLeaveBalanceInput): Promise<EmployeeLeaveBalance> {
    const result = await this.db.query<BalanceRow>(
      `INSERT INTO leave_balances (
         employee_id, year,
         annual_balance, annual_service_days, annual_earned_days,
         annual_remainder_days, annual_carryover_days, annual_pending_days,
         emergency_balance, emergency_remainder_minutes, unpaid_days, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING ${COLUMNS}`,
      [
        input.employeeId,
        input.year,
        input.annualBalance ?? 0,
        input.annualServiceDays ?? 0,
        input.annualEarnedDays ?? 0,
        input.annualRemainderDays ?? 0,
        input.annualCarryoverDays ?? 0,
        input.annualPendingDays ?? 0,
        input.emergencyBalance ?? 0,
        input.emergencyRemainderMinutes ?? 0,
        input.unpaidDays ?? 0,
        input.notes ?? null,
      ],
    );
    return toRecord(result.rows[0]);
  }

  /**
   * تحديث أرقام الرصيد بشروط قيمها الحالية — جملة واحدة (Phase 18).
   *
   * `current` يبني شروط `col = $n` على كل حقل مرسل، فيفشل التحديث (صفر
   * صفوف) إن تغيّر الرصيد بين القراءة والكتابة. لا نافذة ولا كتابة فوق
   * الأحدث — مبدأ Phase 17 مطبَّق على صف الرصيد.
   */
  async updateNumeric(
    id: string,
    current: LeaveBalanceNumericPatch,
    patch: LeaveBalanceNumericPatch,
  ): Promise<EmployeeLeaveBalance | null> {
    const params: unknown[] = [];
    const conditions: string[] = [];
    const sets: string[] = [];
    for (const field of NUMERIC_FIELDS) {
      const expected = current[field];
      if (expected !== undefined) {
        params.push(expected);
        conditions.push(`${DB_COLUMN[field]} = $${params.length}`);
      }
      const next = patch[field];
      if (next !== undefined) {
        params.push(next);
        sets.push(`${DB_COLUMN[field]} = $${params.length}`);
      }
    }
    if (sets.length === 0) {
      return this.findById(id);
    }
    const where = conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '';
    params.push(id);
    const result = await this.db.query<BalanceRow>(
      `UPDATE leave_balances SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${params.length}${where}
       RETURNING ${COLUMNS}`,
      params,
    );
    return result.rows.length > 0 ? toRecord(result.rows[0]) : null;
  }

  /** قراءة صف بمعرّفه — قراءة داخلية للمحرك. */
  async findById(id: string): Promise<EmployeeLeaveBalance | null> {
    const result = await this.db.query<BalanceRow>(
      `SELECT ${COLUMNS} FROM leave_balances WHERE id = $1`,
      [id],
    );
    return result.rows.length > 0 ? toRecord(result.rows[0]) : null;
  }
}