/**
 * مستودع سجل حركات الرصيد (Phase 18 — §7.10/§15).
 *
 * الجدول كان في الترحيل 0003 تخزيناً هيكلياً فقط؛ صار الآن سجلاً حقيقياً:
 * كل تغيير في أي رقم رصيد له صف حركة هنا، والإلغاء صف عكسي **مرتبط**
 * بالأصل عبر `reverses_ledger_id` — لا حذف ولا محو لتاريخ (§15).
 *
 * `year` عمود مولَّد في القاعدة من `occurred_on` (لا يُرسَل من التطبيق)،
 * و`unit` يفصل اليوم عن الدقيقة حتى لا تختلط 420 دقيقة بيوم (§14.3).
 */
import type {
  LeaveLedgerEntry,
  LeaveLedgerUnit,
  LeaveMovementType,
  LeaveType,
} from '../../../src/core/models/employeeLeave';
import type {
  CreateLeaveLedgerEntryInput,
  LeaveLedgerListFilter,
  LeaveLedgerRepository,
} from './contracts';
import { nullToUndefined, type Db } from './shared';

const COLUMNS = `
  id, employee_id AS "employeeId",
  leave_id AS "leaveId", time_permission_id AS "timePermissionId",
  movement_type AS "movementType", leave_type AS "leaveType",
  amount, unit, balance_after AS "balanceAfter", year,
  occurred_on AS "occurredOn", reverses_ledger_id AS "reversesLedgerId",
  notes, created_at AS "createdAt"
`;

interface LedgerRow {
  id: string;
  employeeId: string;
  leaveId: string | null;
  timePermissionId: string | null;
  movementType: LeaveMovementType;
  leaveType: LeaveType | null;
  amount: string | number;
  unit: LeaveLedgerUnit;
  balanceAfter: string | number;
  year: number;
  occurredOn: string;
  reversesLedgerId: string | null;
  notes: string | null;
  createdAt: string;
}

function toRecord(row: LedgerRow): LeaveLedgerEntry {
  return {
    id: row.id,
    employeeId: row.employeeId,
    movementType: row.movementType,
    // numeric يعود نصاً عبر pg — التحويل في موضع واحد.
    amount: Number(row.amount),
    unit: row.unit,
    balanceAfter: Number(row.balanceAfter),
    year: Number(row.year),
    occurredOn: row.occurredOn,
    createdAt: row.createdAt,
    ...(nullToUndefined(row.leaveId) !== undefined && { leaveId: row.leaveId ?? undefined }),
    ...(nullToUndefined(row.timePermissionId) !== undefined && {
      timePermissionId: row.timePermissionId ?? undefined,
    }),
    ...(nullToUndefined(row.leaveType) !== undefined && {
      leaveType: row.leaveType ?? undefined,
    }),
    ...(nullToUndefined(row.reversesLedgerId) !== undefined && {
      reversesLedgerId: row.reversesLedgerId ?? undefined,
    }),
    ...(nullToUndefined(row.notes) !== undefined && { notes: row.notes ?? undefined }),
  };
}

/** بناء جملة WHERE من فلترة معقولة (قيم فقط، ترقيم آمن). */
function buildFilter(filter: LeaveLedgerListFilter): {
  clause: string;
  params: unknown[];
} {
  const parts: string[] = [];
  const params: unknown[] = [];
  const push = (column: string, value: unknown): void => {
    if (value === undefined || value === null) {
      return;
    }
    params.push(value);
    parts.push(`${column} = $${params.length}`);
  };
  push('employee_id', filter.employeeId);
  push('year', filter.year);
  push('leave_id', filter.leaveId);
  push('leave_type', filter.leaveType);
  push('time_permission_id', filter.timePermissionId);
  push('movement_type', filter.movementType);
  return { clause: parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '', params };
}

/** تنفيذ جدول حركات الرصيد. */
export class PgLeaveLedgerRepository implements LeaveLedgerRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<LeaveLedgerEntry | null> {
    const result = await this.db.query<LedgerRow>(
      `SELECT ${COLUMNS} FROM leave_ledger WHERE id = $1`,
      [id],
    );
    return result.rows.length > 0 ? toRecord(result.rows[0]) : null;
  }

  /** كل الحركات (بما فيها المعكوسة) — سجل تاريخي كامل لا يُحذف منه. */
  async list(filter: LeaveLedgerListFilter = {}): Promise<LeaveLedgerEntry[]> {
    const { clause, params } = buildFilter(filter);
    const result = await this.db.query<LedgerRow>(
      `SELECT ${COLUMNS} FROM leave_ledger${clause}
       ORDER BY occurred_on ASC, created_at ASC, id`,
      params,
    );
    return result.rows.map(toRecord);
  }

  /**
   * الحركات التي لم تُعكس بعد.
   *
   * `NOT EXISTS` على حركة تشير إليها بـ`reverses_ledger_id`: الحركة المنقوضة
   * تختفي من هذه القائمة وبقيت في `list` — فلا يُعكس خصم مرتين ولا تُحتسب
   * حركة ملغاة مرتين.
   */
  async listActive(filter: LeaveLedgerListFilter = {}): Promise<LeaveLedgerEntry[]> {
    const { clause, params } = buildFilter(filter);
    // `clause` تبدأ بـ`WHERE` بالفعل، فالقالب يبدأ بها مباشرةً. وحالة
    // عدم وجود فلترة تبدأ بـ`NOT EXISTS` — فلا `WHERE` ولا `AND` يتيمة.
    const where = clause === '' ? 'WHERE NOT EXISTS (' : `${clause} AND NOT EXISTS (`;
    const result = await this.db.query<LedgerRow>(
      `SELECT ${COLUMNS} FROM leave_ledger
       ${where}
         SELECT 1 FROM leave_ledger r WHERE r.reverses_ledger_id = leave_ledger.id
       )
       ORDER BY occurred_on ASC, created_at ASC, id`,
      params,
    );
    return result.rows.map(toRecord);
  }

  async create(input: CreateLeaveLedgerEntryInput): Promise<LeaveLedgerEntry> {
    const result = await this.db.query<LedgerRow>(
      `INSERT INTO leave_ledger (
         employee_id, leave_id, time_permission_id, movement_type, leave_type,
         amount, unit, balance_after, occurred_on, reverses_ledger_id, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING ${COLUMNS}`,
      [
        input.employeeId,
        input.leaveId ?? null,
        input.timePermissionId ?? null,
        input.movementType,
        input.leaveType ?? null,
        input.amount,
        input.unit,
        input.balanceAfter,
        input.occurredOn,
        input.reversesLedgerId ?? null,
        input.notes ?? null,
      ],
    );
    return toRecord(result.rows[0]);
  }
}