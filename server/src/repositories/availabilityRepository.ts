/**
 * مستودع إتاحة الكتب للمنتسبين (Phase 13 — §9.3/§9.4 و§29).
 *
 * لماذا جدول مستقل عن `transaction_employees`: §29 يميّز صريحاً بين
 * «مرتبط» و«متاح» (`linked employee but not available`)، و§9.4 تجعل الإتاحة
 * الجماعية تُنفَّذ **على** المرتبطين — فالربط شرط سابق للإتاحة الجماعية لا
 * بديل عنها. فصل الجدولين يحفظ أيضاً قاعدة BR-05 المعتمدة بلا مساس.
 *
 * لا حذف ولا سحب جماعي هنا: العمليات الأربع في §29 توزّع هكذا —
 * المنح والمنح الجماعي والسحب في هذه الطبقة، وتحديد المرتبطين في الخدمة،
 * والفحص الإداري عبر `listByTransaction` (يُعيد الساري والمسحوب معاً).
 *
 * السحب تحديث لا حذف (§9.3): يملأ `revoked_at` فيبقى السجل التاريخي،
 * ويزيل الفهرس الفريد الجزئي قيد «إتاحة سارية واحدة» ليصح إعادة المنح.
 */
import type {
  TransactionAvailabilityRecord,
  TransactionAvailabilityRepository,
} from './contracts';
import type { Db } from './shared';

const AVAILABILITY_COLUMNS = `
  id, transaction_id AS "transactionId", employee_id AS "employeeId",
  granted_at AS "grantedAt", revoked_at AS "revokedAt"
`;

interface AvailabilityRow {
  id: string;
  transactionId: string;
  employeeId: string;
  grantedAt: string;
  revokedAt: string | null;
}

function toRecord(row: AvailabilityRow): TransactionAvailabilityRecord {
  return {
    id: row.id,
    transactionId: row.transactionId,
    employeeId: row.employeeId,
    grantedAt: row.grantedAt,
    revokedAt: row.revokedAt,
  };
}

/** تنفيذ جدول إتاحة الكتب. */
export class PgTransactionAvailabilityRepository implements TransactionAvailabilityRepository {
  constructor(private readonly db: Db) {}

  /** الأحدث أولاً؛ الصف الساري هو ما `revokedAt === null`. */
  async listByTransaction(transactionId: string): Promise<TransactionAvailabilityRecord[]> {
    const result = await this.db.query<AvailabilityRow>(
      `SELECT ${AVAILABILITY_COLUMNS} FROM transaction_availability
       WHERE transaction_id = $1 ORDER BY granted_at DESC, id`,
      [transactionId],
    );
    return result.rows.map(toRecord);
  }

  /**
   * منح إتاحة لمنتسبين في استعلام واحد.
   *
   * `UNNEST` يمنع تكرار الكتابة لكل منتسب على حدة، و`ON CONFLICT … DO
   * NOTHING` يستهدف **الفهرس الجزئي** (الساري فقط) فيتجاوز من له إتاحة
   * سارية ولا يلمس السجلات المسحوبة. العائد: الصفوف المنشأة في هذه الدعوة.
   */
  async grant(
    transactionId: string,
    employeeIds: readonly string[],
  ): Promise<TransactionAvailabilityRecord[]> {
    if (employeeIds.length === 0) {
      return [];
    }
    const result = await this.db.query<AvailabilityRow>(
      `INSERT INTO transaction_availability (transaction_id, employee_id)
       SELECT $1, employee_id FROM UNNEST($2::uuid[]) AS employee_id
       ON CONFLICT (transaction_id, employee_id) WHERE revoked_at IS NULL DO NOTHING
       RETURNING ${AVAILABILITY_COLUMNS}`,
      [transactionId, [...employeeIds]],
    );
    return result.rows.map(toRecord);
  }

  /** سحب الإتاحة السارية: تحديث واحد يخدم كل الصفوف السارية للمنتسب. */
  async revoke(transactionId: string, employeeId: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE transaction_availability SET revoked_at = now()
       WHERE transaction_id = $1 AND employee_id = $2 AND revoked_at IS NULL`,
      [transactionId, employeeId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
