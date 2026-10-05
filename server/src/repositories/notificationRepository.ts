/**
 * مستودع الإشعارات (Phase 21 — §7.13 · §20 · §37).
 *
 * ما يفعله: `INSERT` واحد وقراءات مقيدة **بصاحب الإشعار داخل SQL**،
 * وتعليم المقروئ. لا شيء غير ذلك:
 *
 * - **بلا `update` عام وبلا `delete`**: الإشعار سجل تاريخي، وحالته الوحيدة
 *   القابلة للكتابة هي «جديد/مقروء» (§20). فمنح `delete` كان سيحوّل
 *   «تعليم المقروء» إلى حذف منطقي، وهو ما ينصّ §20 على منعه صريحاً.
 * - **القيد على المالك في الاستعلام لا بعده**: كل قراءة تمرّ بـ`user_id`
 *   داخل `WHERE`. فلو فُحص بعد قراءة كل الإشعارات وتُصفّى في الذاكرة
 *   لأمكن تسريب صف واحد عبر خطأ لاحق (§13 الفرض على مستوى الاستعلام).
 * - **`payload` يُخزَّن كما هو**: `jsonb` بلا تفسير. المرجع فيه
 *   (`resourceKind`/`resourceId`) ولا تُعاد كتابة الحمولة ولا تُوسَّع.
 * - **الأحدث أولاً**: `created_at DESC, id DESC` — الترتيب جزء من معنى
 *   «سجل الإشعارات» لا ترتيبٌ اعتباطي.
 */
import type {
  CreateNotificationInput,
  NotificationListFilter,
  NotificationRecord,
  NotificationRepository,
} from './contracts';
import type { NotificationPayload } from '../../../src/core/models/notification';
import { buildWhere, nullToUndefined, type Db } from './shared';

const COLUMNS = `
  id, user_id AS "userId", kind, payload,
  is_new AS "isNew", created_at AS "createdAt", read_at AS "readAt"
`;

/** صف `notifications` كما يعيده pg قبل التحويل. */
interface NotificationRow {
  id: string;
  userId: string;
  kind: NotificationRecord['kind'];
  payload: NotificationPayload | null;
  isNew: boolean;
  createdAt: string;
  readAt: string | null;
}

function toRecord(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    ...(row.payload !== null && { payload: row.payload }),
    isNew: row.isNew,
    createdAt: row.createdAt,
    ...(nullToUndefined(row.readAt) !== undefined && { readAt: nullToUndefined(row.readAt) }),
  };
}

/** تنفيذ جدول الإشعارات. */
export class PgNotificationRepository implements NotificationRepository {
  constructor(private readonly db: Db) {}

  async create(input: CreateNotificationInput): Promise<NotificationRecord> {
    const result = await this.db.query<NotificationRow>(
      `INSERT INTO notifications (user_id, kind, payload)
       VALUES ($1, $2, $3)
       RETURNING ${COLUMNS}`,
      [
        input.userId,
        input.kind,
        input.payload === undefined ? null : JSON.stringify(input.payload),
      ],
    );
    return toRecord(result.rows[0]);
  }

  /** قائمة إشعارات مستخدم واحد — التصفية كلها داخل الاستعلام. */
  async listForUser(
    userId: string,
    filter: NotificationListFilter = {},
  ): Promise<NotificationRecord[]> {
    const params: unknown[] = [userId];
    const clauses: string[] = ['user_id = $1'];
    if (filter.isNew !== undefined) {
      params.push(filter.isNew);
      clauses.push(`is_new = $${params.length}`);
    }
    if (filter.kind !== undefined) {
      params.push(filter.kind);
      clauses.push(`kind = $${params.length}`);
    }
    let sql =
      `SELECT ${COLUMNS} FROM notifications WHERE ${clauses.join(' AND ')}` +
      ' ORDER BY created_at DESC, id DESC';
    if (Number.isInteger(filter.limit) && (filter.limit ?? 0) > 0) {
      params.push(filter.limit);
      sql += ` LIMIT $${params.length}`;
    }
    if (Number.isInteger(filter.offset) && (filter.offset ?? 0) >= 0) {
      params.push(filter.offset);
      sql += ` OFFSET $${params.length}`;
    }
    const result = await this.db.query<NotificationRow>(sql, params);
    return result.rows.map(toRecord);
  }

  /** عدّاد غير المقروء — الجرس (UI-08) سيقرأ هذه القيمة. */
  async countUnread(userId: string): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM notifications WHERE user_id = $1 AND is_new',
      [userId],
    );
    return Number(result.rows[0].count);
  }

  /** إشعار واحد ضمن مالكه — `null` خارج المالك (⇒ 404 لا 403). */
  async findForUser(id: string, userId: string): Promise<NotificationRecord | null> {
    const { clause, params } = buildWhere([
      { column: 'id', value: id },
      { column: 'user_id', value: userId },
    ]);
    const result = await this.db.query<NotificationRow>(
      `SELECT ${COLUMNS} FROM notifications${clause}`,
      params,
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }

  /**
   * تعليم المقروء — `idempotent` ومقيد بالمالك.
   *
   * `read_at = COALESCE(read_at, now())` هو ما يجعله idempotent: النداء
   * الثاني لا يغيّر وقت القراءة الأول ولا ينشئ «قراءة ثانية» (§20: السجل
   * التاريخي منفصل عن حالة جديد، والقراءة تُسجَّل مرة واحدة).
   *
   * القيد `user_id = $2` في جملة `UPDATE` نفسها هو الفرض الأمني: لا
   * مرحلة بين قراءة وكتابة يمكن أن تُخطئ فيه (نفس نمط Phase 17).
   */
  async markRead(id: string, userId: string): Promise<NotificationRecord | null> {
    const result = await this.db.query<NotificationRow>(
      `UPDATE notifications
          SET is_new = false, read_at = COALESCE(read_at, now())
        WHERE id = $1 AND user_id = $2
        RETURNING ${COLUMNS}`,
      [id, userId],
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }
}