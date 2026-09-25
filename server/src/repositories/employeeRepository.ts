/**
 * مستودع الموظفين (Phase 9) — يربط Employee والحالة الراهنة والسجل التاريخي
 * بـPostgreSQL. لا يحذف موظفاً أبداً؛ تغيير الحالة يكتب الجدول + السجل
 * التاريخي في معاملة واحدة (الخطة §32 و§7.3).
 */
import { withTransaction } from '../database/pool';
import type {
  ChangeEmployeeStatusInput,
  CreateEmployeeInput,
  EmployeeListFilter,
  EmployeeRecord,
  EmployeeRepository,
  EmployeeStatusHistoryRecord,
  EmployeeStatusValue,
  UpdateEmployeeInput,
} from './contracts';
import { buildWhere, isPool, nullToUndefined, type Db } from './shared';

/**
 * أعمدة سجل الموظف بـaliases لتطابق نموذج المجال مباشرة بعد الاستعلام.
 * userId مشتق من users.employee_id (العلاقة مخزَّنة في جهة واحدة فقط
 * حسب تصميم migration 0001) عبر LEFT JOIN.
 */
const EMPLOYEE_COLUMNS = `
  e.id, e.name, e.title, e.department,
  e.badge_number AS "badgeNumber", e.joined_date AS "joinedDate",
  e.category, e.academic_degree AS "academicDegree", e.specialization,
  e.status, e.phone, e.photo, u.id AS "userId",
  e.created_at AS "createdAt", e.updated_at AS "updatedAt"
`;

/** FROM + JOIN المقابل لـ EMPLOYEE_COLUMNS (يُستخدم في SELECT لا في RETURNING). */
const EMPLOYEE_FROM = `
  FROM employees e
  LEFT JOIN users u ON u.employee_id = e.id
`;

const HISTORY_COLUMNS = `
  id, employee_id AS "employeeId", status,
  service_end_reason AS "serviceEndReason", notes,
  changed_at AS "changedAt"
`;

/** صف كما يعيده pg بعد الـaliases. */
interface EmployeeRow {
  id: string;
  name: string;
  title: string;
  department: string;
  badgeNumber: string | null;
  joinedDate: string | null;
  category: string | null;
  academicDegree: string | null;
  specialization: string | null;
  status: EmployeeStatusValue;
  phone: string | null;
  photo: string | null;
  /** غائب في استعلامات RETURNING (لا JOIN) — يُملأ من users عند الحاجة. */
  userId?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface HistoryRow {
  id: string;
  employeeId: string;
  status: EmployeeStatusValue;
  serviceEndReason: string | null;
  notes: string | null;
  changedAt: string;
}

function toRecord(row: EmployeeRow): EmployeeRecord {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    department: row.department,
    badgeNumber: nullToUndefined(row.badgeNumber),
    joinedDate: nullToUndefined(row.joinedDate),
    category: nullToUndefined(row.category as EmployeeRecord['category']),
    academicDegree: nullToUndefined(row.academicDegree),
    specialization: nullToUndefined(row.specialization),
    status: row.status,
    phone: nullToUndefined(row.phone),
    photo: nullToUndefined(row.photo),
    userId: nullToUndefined(row.userId),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toHistory(row: HistoryRow): EmployeeStatusHistoryRecord {
  return {
    id: row.id,
    employeeId: row.employeeId,
    status: row.status,
    serviceEndReason: row.serviceEndReason,
    notes: row.notes,
    changedAt: row.changedAt,
  };
}

/** خريطة حقلاً ⇒ أعمدة SQL (ترتيب ثابت يمنع الخلط). */
const FIELD_COLUMNS: Readonly<Record<string, string>> = {
  name: 'name',
  title: 'title',
  department: 'department',
  badgeNumber: 'badge_number',
  joinedDate: 'joined_date',
  category: 'category',
  academicDegree: 'academic_degree',
  specialization: 'specialization',
  status: 'status',
  phone: 'phone',
  photo: 'photo',
  // userId مستثنى: يُكتب في users.employee_id لا في employees.
};
/** مستودع الموظفين على Pool أو Client معاملة. */
export class PgEmployeeRepository implements EmployeeRepository {
  constructor(private readonly db: Db) {}

  /** قراءة سجل واحد مع userId المشتق من users (تعمل مع Pool أو Client). */
  private async findByIdOn(db: Db, id: string): Promise<EmployeeRecord | null> {
    const result = await db.query<EmployeeRow>(
      `SELECT ${EMPLOYEE_COLUMNS}${EMPLOYEE_FROM} WHERE e.id = $1`,
      [id],
    );
    return result.rows.length > 0 ? toRecord(result.rows[0]) : null;
  }

  /**
   * ربط/فك ربط حساب المستخدم — العلاقة مخزَّنة في users.employee_id فقط
   * (تصميم 0001)، ومعرّف حساب غير موجود خطأ صريح لا صمت.
   */
  private async applyUserLink(db: Db, employeeId: string, userId: string | null): Promise<void> {
    if (userId === null) {
      await db.query(`UPDATE users SET employee_id = NULL WHERE employee_id = $1`, [employeeId]);
      return;
    }
    const linked = await db.query(
      `UPDATE users SET employee_id = $1 WHERE id = $2`,
      [employeeId, userId],
    );
    if ((linked.rowCount ?? 0) === 0) {
      throw new Error(`تعذّر ربط الموظف: لا يوجد حساب مستخدم بالمعرّف ${userId}.`);
    }
  }

  async findById(id: string): Promise<EmployeeRecord | null> {
    return this.findByIdOn(this.db, id);
  }

  async list(filter: EmployeeListFilter = {}): Promise<EmployeeRecord[]> {
    const conditions: { column: string; value: unknown }[] = [];
    if (filter.status !== undefined && filter.status !== 'all') {
      conditions.push({ column: 'e.status', value: filter.status });
    }
    const { clause, params } = buildWhere(conditions);
    let sql = `SELECT ${EMPLOYEE_COLUMNS}${EMPLOYEE_FROM}${clause}`;
    const search = filter.search?.trim();
    if (search !== undefined && search !== '') {
      params.push(`%${search}%`);
      const searchIndex = params.length;
      sql += `${clause === '' ? ' WHERE' : ' AND'} (e.name ILIKE $${searchIndex}`
        + ` OR e.badge_number ILIKE $${searchIndex})`;
    }
    sql += ' ORDER BY e.name';
    const result = await this.db.query<EmployeeRow>(sql, params);
    return result.rows.map(toRecord);
  }

  async create(input: CreateEmployeeInput): Promise<EmployeeRecord> {
    const run = async (db: Db): Promise<EmployeeRecord> => {
      const result = await db.query<{ id: string }>(
        `INSERT INTO employees (
           name, title, department, badge_number, joined_date, category,
           academic_degree, specialization, status, phone, photo
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          input.name,
          input.title,
          input.department,
          input.badgeNumber ?? null,
          input.joinedDate ?? null,
          input.category ?? null,
          input.academicDegree ?? null,
          input.specialization ?? null,
          input.status ?? 'active',
          input.phone ?? null,
          input.photo ?? null,
        ],
      );
      const created = result.rows[0];
      if (input.userId !== undefined) {
        await this.applyUserLink(db, created.id, input.userId);
      }
      const record = await this.findByIdOn(db, created.id);
      if (record === null) {
        throw new Error('فشل إنشاء الموظف: السجل المُنشأ غير موجود بعد الإدراج.');
      }
      return record;
    };

    // الإدراج وربط الحساب في معاملة واحدة: إما أن ينجحا معاً أو لا شيء.
    if (isPool(this.db)) {
      return withTransaction(this.db, (client) => run(client));
    }
    return run(this.db);
  }

  async update(id: string, patch: UpdateEmployeeInput): Promise<EmployeeRecord | null> {
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
    const { userId } = patch;
    if (sets.length === 0 && userId === undefined) {
      return this.findById(id);
    }

    const run = async (db: Db): Promise<EmployeeRecord | null> => {
      if (sets.length > 0) {
        const result = await db.query(
          `UPDATE employees SET ${sets.join(', ')}, updated_at = now()
           WHERE id = $${params.length + 1} RETURNING id`,
          [...params, id],
        );
        if (result.rows.length === 0) {
          return null;
        }
      } else {
        const exists = await db.query(`SELECT 1 FROM employees WHERE id = $1`, [id]);
        if (exists.rows.length === 0) {
          return null;
        }
      }
      if (userId !== undefined) {
        await this.applyUserLink(db, id, userId);
      }
      return this.findByIdOn(db, id);
    };

    // تعديل الحقول وتعديل الربط في معاملة واحدة.
    if (isPool(this.db)) {
      return withTransaction(this.db, (client) => run(client));
    }
    return run(this.db);
  }

  async changeStatus(
    id: string,
    input: ChangeEmployeeStatusInput,
  ): Promise<{ employee: EmployeeRecord; history: EmployeeStatusHistoryRecord } | null> {
    const run = async (
      db: Db,
    ): Promise<{ employee: EmployeeRecord; history: EmployeeStatusHistoryRecord } | null> => {
      const updated = await db.query(
        `UPDATE employees SET status = $2, updated_at = now()
         WHERE id = $1 RETURNING id`,
        [id, input.status],
      );
      if (updated.rows.length === 0) {
        return null;
      }
      const history = await db.query<HistoryRow>(
        `INSERT INTO employee_status_history (employee_id, status, service_end_reason, notes)
         VALUES ($1, $2, $3, $4) RETURNING ${HISTORY_COLUMNS}`,
        [id, input.status, input.serviceEndReason ?? null, input.notes ?? null],
      );
      const employee = await this.findByIdOn(db, id);
      if (employee === null) {
        return null;
      }
      return { employee, history: toHistory(history.rows[0]) };
    };

    // معاملة واحدة: إما نجاح الحالة مع السجل التاريخي معاً أو لا شيء.
    if (isPool(this.db)) {
      return withTransaction(this.db, (client) => run(client));
    }
    return run(this.db);
  }

  async listStatusHistory(employeeId: string): Promise<EmployeeStatusHistoryRecord[]> {
    const result = await this.db.query<HistoryRow>(
      `SELECT ${HISTORY_COLUMNS} FROM employee_status_history
       WHERE employee_id = $1 ORDER BY changed_at DESC, id DESC`,
      [employeeId],
    );
    return result.rows.map(toHistory);
  }
}
