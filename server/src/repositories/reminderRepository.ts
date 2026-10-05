/**
 * مستودع التذكيرات (Phase 21 — §7.14 · §21 · §37).
 *
 * ما يفعله: CRUD بسيط على جدول 0004 كما هو، **بلا حقل مضاف عدا
 * `processed_at`** (حاجز تكرار تقني للوظيفة المجدولة، موضَّح في 0014).
 *
 * ثلاثة قرارات تستحق التوضيح:
 *
 * 1. **`relatedKind`/`relatedId` بلا FK**: الترحيل 0004 نصّ أن «أهدافه غير
 *    مثبتة بعد فلا FK الآن»، والخطة لم تحسمها. فالمستودع لا يتحقق من وجود
 *    المورد ولا يفترض نوعاً.
 *
 * 2. **`status` لا يُكتب إطلاقاً**: قيم الحالة (تنفيذ/انتهاء) غير محددة في
 *    نصّ الخطة، فكتابتها كانت ستخترع قائمة حالات أعمال (§13). والـdispatcher
 *    يستعمل `processed_at` — وهو **علامة تقنية لا حالة عمل**.
 *
 * 3. **مقارنة الاستحقاق كزوج `(remind_on, remind_at)`**: هما عمودان منفصلان،
 *    ومقارنة كلٍّ وحده خطأ كلاسيكي: `remind_on <= today` وحده يُدخل
 *    تذكيراً **مستقبلاً في وقتٍ متأخر من اليوم**، و`remind_at <= now` وحده
 *    يُدخل تذكيراً **من يوم سابق لم يُعالج**. فالمقارنة الزوجية في سطر واحد
 *    هي الطريقة الصحيحة في PostgreSQL وتُطبَّق حرفياً.
 */
import type {
  CreateReminderInput,
  ReminderRecord,
  ReminderRepository,
  UpdateReminderInput,
} from './contracts';
import { nullToUndefined, type Db } from './shared';

const COLUMNS = `
  id, enabled, remind_on AS "remindOn", remind_at AS "remindAt", note,
  status, related_kind AS "relatedKind", related_id AS "relatedId",
  created_at AS "createdAt", updated_at AS "updatedAt",
  processed_at AS "processedAt"
`;

/** صف `reminders` كما يعيده pg قبل التحويل. */
interface ReminderRow {
  id: string;
  enabled: boolean;
  remindOn: string;
  remindAt: string;
  note: string;
  status: string | null;
  relatedKind: string | null;
  relatedId: string | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
}

/** أعمدة قابلة للتعديل من `UpdateReminderInput` — خريطة واحدة للخدمات. */
const UPDATABLE_COLUMNS = {
  enabled: 'enabled',
  remindOn: 'remind_on',
  remindAt: 'remind_at',
  note: 'note',
  relatedKind: 'related_kind',
  relatedId: 'related_id',
} as const;

function toRecord(row: ReminderRow): ReminderRecord {
  const status = nullToUndefined(row.status);
  const relatedKind = nullToUndefined(row.relatedKind);
  const relatedId = nullToUndefined(row.relatedId);
  const processedAt = nullToUndefined(row.processedAt);
  return {
    id: row.id,
    enabled: row.enabled,
    remindOn: row.remindOn,
    // `time` يعيد HH:mm:ss ويُطبَّع إلى HH:mm وفق نموذج المجال (dateTime.ts).
    remindAt: row.remindAt.slice(0, 5),
    note: row.note,
    ...(status !== undefined && { status }),
    ...(relatedKind !== undefined && { relatedKind }),
    ...(relatedId !== undefined && { relatedId }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(processedAt !== undefined && { processedAt }),
  };
}
/** تنفيذ جدول التذكيرات. */
export class PgReminderRepository implements ReminderRepository {
  constructor(private readonly db: Db) {}

  async create(input: CreateReminderInput): Promise<ReminderRecord> {
    const result = await this.db.query<ReminderRow>(
      `INSERT INTO reminders (enabled, remind_on, remind_at, note, related_kind, related_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [
        input.enabled,
        input.remindOn,
        input.remindAt,
        input.note,
        input.relatedKind ?? null,
        input.relatedId ?? null,
      ],
    );
    return toRecord(result.rows[0]);
  }

  /** الأحدث استحقاقاً أولاً — «ما هو قادم» أهم من الترتيب المُدخل. */
  async list(filter: { enabled?: boolean } = {}): Promise<ReminderRecord[]> {
    const params: unknown[] = [];
    let sql = `SELECT ${COLUMNS} FROM reminders`;
    if (filter.enabled !== undefined) {
      params.push(filter.enabled);
      sql += ` WHERE enabled = $${params.length}`;
    }
    sql += ' ORDER BY remind_on DESC, remind_at DESC, id DESC';
    const result = await this.db.query<ReminderRow>(sql, params);
    return result.rows.map(toRecord);
  }

  async findById(id: string): Promise<ReminderRecord | null> {
    const result = await this.db.query<ReminderRow>(
      `SELECT ${COLUMNS} FROM reminders WHERE id = $1`,
      [id],
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }

  /** تعديل جزئي — الحقول غير المذكورة تبقى كما هي، و`updated_at` يتقدّم. */
  async update(id: string, patch: UpdateReminderInput): Promise<ReminderRecord | null> {
    const params: unknown[] = [id];
    const sets: string[] = [];
    for (const [field, column] of Object.entries(UPDATABLE_COLUMNS)) {
      const value = (patch as Record<string, unknown>)[field];
      if (value !== undefined) {
        params.push(value);
        sets.push(`${column} = $${params.length}`);
      }
    }
    if (sets.length === 0) {
      // لا حقول قابلة للتعديل ⇒ لا كتابة ولا `updated_at` يتقدّم بلا سبب.
      return this.findById(id);
    }
    sets.push('updated_at = now()');
    const result = await this.db.query<ReminderRow>(
      `UPDATE reminders SET ${sets.join(', ')} WHERE id = $1 RETURNING ${COLUMNS}`,
      params,
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }

  /**
   * التذكيرات المستحقة التي لم تُعالَج:
   * `enabled AND processed_at IS NULL AND (remind_on, remind_at) <= ($1, $2::time)`.
   *
   * `$2` يمرَّر كسلسلة `HH:mm:ss` صراحةً: عمود `time` المخزَّن من
   * `HH:mm` يحمل `00:00:00`، فبلا التحويل تطابق `22:00` قيمةً نصية غير
   * متساوية الطول وتُقصَر المقارنة خطأً.
   */
  async listDuePending(now: { date: string; time: string }): Promise<ReminderRecord[]> {
    const result = await this.db.query<ReminderRow>(
      `SELECT ${COLUMNS} FROM reminders
        WHERE enabled
          AND processed_at IS NULL
          AND (remind_on, remind_at) <= ($1, $2::time)
        ORDER BY remind_on, remind_at, id`,
      [now.date, `${now.time}:00`],
    );
    return result.rows.map(toRecord);
  }

  /**
   * علامة المعالجة — **الحاجز التقني الوحيد ضد الإشعار المكرر**.
   *
   * `WHERE processed_at IS NULL` في جملة `UPDATE` نفسها: فإن نال الصفَ
   * أحدهم فهو الذي عالجه، وإن لم ينله أحد لم يكن هو. هذا ما يمنع تشغيلين
   * متزامنين من إنتاج إشعارين للتذكير نفسه، وهو حدّه الأدنى — **لا**
   * يعني أن التذكير لا يُنبغى إشعاره مرة أخرى إن أُعيد جدولته (قاعدة عمل
   * لم تثبتها الخطة ⇒ TBD).
   */
  async markProcessed(id: string, processedAt: string): Promise<ReminderRecord | null> {
    const result = await this.db.query<ReminderRow>(
      `UPDATE reminders SET processed_at = $2, updated_at = now()
        WHERE id = $1 AND processed_at IS NULL
        RETURNING ${COLUMNS}`,
      [id, processedAt],
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }

  /** فكّ العلامة — إعادة جدولة يدوية، بلا معنى أعمالي إضافي. */
  async clearProcessed(id: string): Promise<ReminderRecord | null> {
    const result = await this.db.query<ReminderRow>(
      'UPDATE reminders SET processed_at = NULL, updated_at = now() WHERE id = $1 RETURNING ' +
        COLUMNS,
      [id],
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }
}