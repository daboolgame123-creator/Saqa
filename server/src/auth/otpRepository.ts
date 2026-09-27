/**
 * مستودع الأرقام السرية OTP (Phase 11) — `auth_otp_codes` و
 * `auth_otp_rate_limits`.
 *
 * قواعد مُطبَّقة هنا كما هي في §11.5:
 * - الرمز **لا يُخزَّن نصاً**: `code_hash` تجزئة SHA-256.
 * - `user_id` يقبل NULL: طلب الرمز لا يكشف وجود الحساب، فيُسجَّل الطلب
 *   حتى حين لا يوجد حساب مطابق.
 * - **رمز جديد يبطل السابق**: `invalidateActiveForPhone` يبطل كل رمز
 *   حيّ للهاتف والغرض قبل إصدار جديد.
 * - **خمسة محاولات خاطئة تبطل الرمز الحالي**: `incrementAttempts` يعيد
 *   العدّ، والخدمة تقرر الإبطال عند بلوغ الحد.
 * - **الطلب السادس يُسجَّل**: `insert` يحفظ كل طلب (بما فيه المحظور)
 *   ليُحتسب في نافذة الخمس دقائق/الـ15 دقيقة.
 */
import type { Queryable } from '../database';
import type { OtpPurpose, OtpRecord } from './authTypes';

/** أعمدة الرمز كما تُقرأ (aliased). */
const OTP_COLUMNS = `
  id, user_id AS "userId", employee_id AS "employeeId", phone, purpose,
  code_hash AS "codeHash", attempts, created_at AS "createdAt",
  expires_at AS "expiresAt", consumed_at AS "consumedAt",
  invalidated_at AS "invalidatedAt"
`;

interface OtpRow {
  id: string;
  userId: string | null;
  employeeId: string | null;
  phone: string;
  purpose: OtpPurpose;
  codeHash: string;
  attempts: number;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  invalidatedAt: string | null;
}

function toRecord(row: OtpRow): OtpRecord {
  return {
    id: row.id,
    userId: row.userId,
    employeeId: row.employeeId,
    phone: row.phone,
    purpose: row.purpose,
    codeHash: row.codeHash,
    attempts: row.attempts,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    invalidatedAt: row.invalidatedAt,
  };
}

/** إدخال إنشاء رمز سري. */
export interface CreateOtpInput {
  userId: string | null;
  employeeId: string | null;
  phone: string;
  purpose: OtpPurpose;
  codeHash: string;
  /** تاريخ الانتهاء المحسوب في الخدمة (5 دقائق §11.5). */
  expiresAt: string;
}

/** مستودع OTP — عمليات فقط بلا قواعد أعمال. */
export class OtpRepository {
  constructor(private readonly db: Queryable) {}

  /** يحفظ طلب رمز جديد (كل طلب يُسجَّل داخل نافذة العدّ). */
  async insert(input: CreateOtpInput): Promise<OtpRecord> {
    const result = await this.db.query<OtpRow>(
      `INSERT INTO auth_otp_codes (user_id, employee_id, phone, purpose, code_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${OTP_COLUMNS}`,
      [
        input.userId,
        input.employeeId,
        input.phone,
        input.purpose,
        input.codeHash,
        input.expiresAt,
      ],
    );
    return toRecord(result.rows[0]);
  }

  /** أحدث رمز حيّ لهذا الهاتف والغرض (غير مستهلك وغير مُبطل). */
  async findActive(phone: string, purpose: OtpPurpose): Promise<OtpRecord | null> {
    const result = await this.db.query<OtpRow>(
      `SELECT ${OTP_COLUMNS} FROM auth_otp_codes
       WHERE phone = $1 AND purpose = $2
         AND consumed_at IS NULL AND invalidated_at IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [phone, purpose],
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }

  /** يبطل كل الرموز الحيّة لهذا الهاتف والغرض (رمز جديد يبطل السابق). */
  async invalidateActiveForPhone(phone: string, purpose: OtpPurpose): Promise<number> {
    const result = await this.db.query(
      `UPDATE auth_otp_codes SET invalidated_at = now()
       WHERE phone = $1 AND purpose = $2
         AND consumed_at IS NULL AND invalidated_at IS NULL`,
      [phone, purpose],
    );
    return result.rowCount ?? 0;
  }

  /** يزيد عدّاد المحاولات الخاطئة ويعيد السجل المحدَّث. */
  async incrementAttempts(id: string): Promise<OtpRecord | null> {
    const result = await this.db.query<OtpRow>(
      `UPDATE auth_otp_codes SET attempts = attempts + 1 WHERE id = $1 RETURNING ${OTP_COLUMNS}`,
      [id],
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }

  /** يستهلك الرمز (استخدام واحد §11.5). */
  async consume(id: string): Promise<void> {
    await this.db.query(`UPDATE auth_otp_codes SET consumed_at = now() WHERE id = $1`, [id]);
  }

  /** يُبطل الرمز (خمس محاولات خاطئة). */
  async invalidate(id: string): Promise<void> {
    await this.db.query(`UPDATE auth_otp_codes SET invalidated_at = now() WHERE id = $1`, [id]);
  }

  /** عدد طلبات الرمز لهذا الهاتف خلال نافذة زمنية (حد 5 طلبات / 15 دقيقة). */
  async countRequestsSince(phone: string, sinceIso: string): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM auth_otp_codes
       WHERE phone = $1 AND created_at >= $2`,
      [phone, sinceIso],
    );
    return Number(result.rows[0].count);
  }

  // ── حظر طلبات OTP (§11.5) ──────────────────────────────────────────

  /** هل يوجد حظر ساري على هذا الهاتف؟ */
  async findActiveBlock(phone: string): Promise<string | null> {
    const result = await this.db.query<{ blockedUntil: string }>(
      `SELECT blocked_until AS "blockedUntil" FROM auth_otp_rate_limits
       WHERE phone = $1 AND blocked_until > now()`,
      [phone],
    );
    return result.rows[0]?.blockedUntil ?? null;
  }

  /** يسجّل/يمدّد حظر الطلبات لهذا الهاتف حتى لحظة معيّنة. */
  async blockRequests(phone: string, untilIso: string): Promise<void> {
    await this.db.query(
      `INSERT INTO auth_otp_rate_limits (phone, blocked_until, blocked_at)
       VALUES ($1, $2, now())
       ON CONFLICT (phone) DO UPDATE
         SET blocked_until = EXCLUDED.blocked_until, blocked_at = now()`,
      [phone, untilIso],
    );
  }
}
